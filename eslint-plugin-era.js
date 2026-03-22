// ERA — Custom ESLint plugin enforcing development-standards.md field naming conventions
// See docs/development-standards.md §2 for the rules these enforce.

/** @type {import('eslint').ESLint.Plugin} */
const eraPlugin = {
  meta: { name: "eslint-plugin-era", version: "1.0.0" },
  rules: {
    // ─── Rule: era-field-suffixes ─────────────────────────────
    // Validates that TypeScript interface fields use canonical suffixes
    // and that suffix ↔ type annotations are consistent.
    "field-suffixes": {
      meta: {
        type: "suggestion",
        docs: {
          description: "Enforce ERA field naming conventions from development-standards.md §2",
        },
        messages: {
          booleanPrefix:
            'Boolean field "{{name}}" should start with "is", "has", or "can" (e.g. "is{{capitalized}}").',
          amountType:
            'Field "{{name}}" ends with "Amount" — its type annotation should be `number`, not `{{actual}}`.',
          dateType:
            'Field "{{name}}" ends with "Date" — its type annotation should be `string` (YYYY-MM-DD), not `{{actual}}`.',
          timestampType:
            'Field "{{name}}" ends with "At" — its type annotation should be `string` (ISO 8601), not `{{actual}}`.',
          rateType:
            'Field "{{name}}" ends with "Rate" — its type annotation should be `number`, not `{{actual}}`.',
          countType:
            'Field "{{name}}" ends with "Count" — its type annotation should be `number`, not `{{actual}}`.',
        },
        schema: [],
      },
      create(context) {
        // Suffix → expected TS type keyword(s)
        const SUFFIX_TYPE_MAP = {
          Amount: { expected: "number", messageId: "amountType" },
          Rate:   { expected: "number", messageId: "rateType" },
          Count:  { expected: "number", messageId: "countType" },
          Date:   { expected: "string", messageId: "dateType" },
          At:     { expected: "string", messageId: "timestampType" },
        };

        function checkProperty(node) {
          const name =
            node.key?.name ?? node.key?.value;
          if (!name) return;

          const typeAnnotation = node.typeAnnotation?.typeAnnotation;

          // Boolean prefix check
          if (typeAnnotation) {
            const typeStr = context.sourceCode.getText(typeAnnotation);
            if (
              typeStr === "boolean" &&
              !name.startsWith("is") &&
              !name.startsWith("has") &&
              !name.startsWith("can") &&
              // Exceptions: common boolean names that don't need prefix
              name !== "required" &&
              name !== "optional"
            ) {
              const capitalized =
                name.charAt(0).toUpperCase() + name.slice(1);
              context.report({
                node: node.key,
                messageId: "booleanPrefix",
                data: { name, capitalized },
              });
            }
          }

          // Suffix ↔ type consistency checks
          for (const [suffix, rule] of Object.entries(SUFFIX_TYPE_MAP)) {
            if (!name.endsWith(suffix)) continue;
            // Skip if no type annotation (inferred types are fine)
            if (!typeAnnotation) break;

            const typeStr = context.sourceCode.getText(typeAnnotation);
            // Accept the expected type, or optional (number | undefined), or union containing it
            if (
              typeStr !== rule.expected &&
              !typeStr.includes(rule.expected)
            ) {
              context.report({
                node: node.key,
                messageId: rule.messageId,
                data: { name, actual: typeStr },
              });
            }
            break; // Only check first matching suffix
          }
        }

        return {
          // Interface fields: interface Foo { barAmount: number }
          TSPropertySignature: checkProperty,
          // Type literal fields: type Foo = { barAmount: number }
          TSPropertyDefinition: checkProperty,
        };
      },
    },

    // ─── Rule: era-doctype-required ──────────────────────────
    // Warns when an interface that should have docType is missing it.
    // Checks interfaces whose names match known shared-container entities.
    "doctype-required": {
      meta: {
        type: "suggestion",
        docs: {
          description:
            "Ensure entities in shared Cosmos containers include a docType discriminator field",
        },
        messages: {
          missingDocType:
            'Interface "{{name}}" is stored in a shared container and should include a `docType` field. See development-standards.md §1.',
        },
        schema: [],
      },
      create(context) {
        // Entities that live in shared containers (multiple entity types per container)
        const SHARED_CONTAINER_ENTITIES = new Set([
          // ledger container
          "Account", "JournalEntry", "FiscalPeriod",
          // documents container
          "Invoice", "Payment", "VatReturn",
          // inventory container
          "Item", "StockMovement",
        ]);

        return {
          TSInterfaceDeclaration(node) {
            const name = node.id?.name;
            if (!name || !SHARED_CONTAINER_ENTITIES.has(name)) return;

            const hasDocType = node.body?.body?.some(
              (member) =>
                member.type === "TSPropertySignature" &&
                (member.key?.name === "docType" ||
                  member.key?.value === "docType"),
            );

            if (!hasDocType) {
              context.report({
                node: node.id,
                messageId: "missingDocType",
                data: { name },
              });
            }
          },
        };
      },
    },

    // ─── Rule: era-no-cross-partition-query ───────────────────
    // Warns when a Cosmos SQL query string lacks a partition key filter.
    "no-cross-partition-query": {
      meta: {
        type: "problem",
        docs: {
          description:
            "Ensure Cosmos DB queries include partition key filter (companyId, id, or country)",
        },
        messages: {
          missingPartitionKey:
            "Cosmos query may be missing a partition key filter. Include c.companyId, c.id, or c.country in the WHERE clause. See development-standards.md §4.",
        },
        schema: [],
      },
      create(context) {
        const PARTITION_KEYS = ["companyId", "c.companyId", "c.id", "c.country"];

        return {
          // Match template literals and string literals that look like Cosmos SQL
          TemplateLiteral(node) {
            const raw = node.quasis.map((q) => q.value.raw).join("");
            checkQueryString(raw, node);
          },
          Literal(node) {
            if (typeof node.value !== "string") return;
            checkQueryString(node.value, node);
          },
        };

        function checkQueryString(str, node) {
          const upper = str.toUpperCase();
          // Only check strings that look like Cosmos SQL queries
          if (!upper.includes("SELECT") || !upper.includes("FROM")) return;
          // Skip if it's clearly a comment or documentation
          if (upper.startsWith("--") || upper.startsWith("//")) return;

          const lower = str.toLowerCase();
          const hasPartitionKey = PARTITION_KEYS.some((key) =>
            lower.includes(key.toLowerCase()),
          );

          if (!hasPartitionKey) {
            context.report({ node, messageId: "missingPartitionKey" });
          }
        }
      },
    },
  },
};

export default eraPlugin;
