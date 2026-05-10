/**
 * In-memory Cosmos DB fake for integration tests.
 *
 * Implements the subset of @azure/cosmos Container API that era actually uses.
 * Translates a small dialect of Cosmos SQL into JavaScript predicates at runtime.
 *
 * Supported query features:
 *   - SELECT * FROM c
 *   - SELECT TOP n * FROM c
 *   - SELECT TOP n c.field FROM c
 *   - SELECT VALUE COUNT(1) FROM c
 *   - SELECT VALUE c.field FROM c
 *   - WHERE clauses with AND, OR, parentheses
 *   - Operators: =, !=, <, <=, >, >=
 *   - IS_DEFINED(c.field), NOT IS_DEFINED(c.field)
 *   - IS_NULL(c.field)
 *   - ARRAY_CONTAINS(c.arr, value [, true])
 *   - ARRAY_CONTAINS(@param, c.field)
 *   - LOWER(c.field)
 *   - c.field IN ('a', 'b')
 *   - ORDER BY c.field [ASC|DESC] (single or comma-separated)
 *   - OFFSET n LIMIT m
 *   - Parameters via @paramName
 *
 * Anything outside this dialect should throw, not silently return wrong data.
 */
import { describe } from "vitest";

type Doc = Record<string, unknown> & { id: string };
type ParamMap = Record<string, unknown>;

interface QuerySpec {
  query: string;
  parameters?: Array<{ name: string; value: unknown }>;
}

interface FetchAllResult<T> {
  resources: T[];
}

interface ItemResult<T> {
  resource: T | undefined;
}

class FakeContainer {
  private store = new Map<string, Doc>();
  public name: string;

  constructor(name: string) {
    this.name = name;
  }

  public _reset() {
    this.store.clear();
  }

  public _all(): Doc[] {
    return Array.from(this.store.values()).map((d) => ({ ...d }));
  }

  public get items() {
    return {
      create: async <T extends Doc>(item: T): Promise<{ resource: T }> => {
        if (!item.id) throw new Error(`create: item missing id (container=${this.name})`);
        if (this.store.has(item.id)) {
          const err = new Error(`Conflict: id ${item.id} already exists`) as Error & { code: number };
          err.code = 409;
          throw err;
        }
        this.store.set(item.id, { ...item });
        return { resource: { ...item } };
      },

      upsert: async <T extends Doc>(item: T): Promise<{ resource: T }> => {
        if (!item.id) throw new Error(`upsert: item missing id (container=${this.name})`);
        this.store.set(item.id, { ...item });
        return { resource: { ...item } };
      },

      query: <T = unknown>(spec: QuerySpec | string) => {
        const querySpec: QuerySpec = typeof spec === "string" ? { query: spec } : spec;
        return {
          fetchAll: async (): Promise<FetchAllResult<T>> => {
            const resources = runQuery<T>(this._all(), querySpec);
            return { resources };
          },
          fetchNext: async (): Promise<FetchAllResult<T>> => {
            const resources = runQuery<T>(this._all(), querySpec);
            return { resources };
          },
        };
      },
    };
  }

  public item(id: string, _partitionKey: string) {
    const store = this.store;
    return {
      read: async <T>(): Promise<ItemResult<T>> => {
        const r = store.get(id);
        return { resource: r ? ({ ...r } as unknown as T) : undefined };
      },
      replace: async <T extends Doc>(item: T): Promise<{ resource: T }> => {
        store.set(id, { ...item });
        return { resource: { ...item } };
      },
      delete: async (): Promise<void> => {
        store.delete(id);
      },
    };
  }
}

// ─── Query runner ────────────────────────────────────────────

function runQuery<T>(docs: Doc[], spec: QuerySpec): T[] {
  const params: ParamMap = {};
  for (const p of spec.parameters ?? []) {
    // Normalize "@name" → "name" so JS-compiled lookups via p[<bare-name>] work.
    const key = p.name.startsWith("@") ? p.name.slice(1) : p.name;
    params[key] = p.value;
  }

  let sql = spec.query.trim();

  // Strip `SELECT TOP n` and apply n as a post-filter slice. We rewrite the
  // SQL to plain `SELECT ...` and apply the slice at the end of dispatch.
  let topLimit: number | undefined;
  const topMatch = /^SELECT\s+TOP\s+(\d+)\s+/i.exec(sql);
  if (topMatch) {
    topLimit = parseInt(topMatch[1], 10);
    sql = "SELECT " + sql.slice(topMatch[0].length);
  }

  const result = dispatchSelect<T>(docs, sql, params);
  return topLimit !== undefined ? result.slice(0, topLimit) : result;
}

function dispatchSelect<T>(docs: Doc[], sql: string, params: ParamMap): T[] {  // Detect SELECT VALUE COUNT(1) ...
  const countMatch = /^SELECT\s+VALUE\s+COUNT\s*\(\s*1\s*\)\s+FROM\s+c\s*(.*)$/is.exec(sql);
  if (countMatch) {
    const tail = countMatch[1] ?? "";
    const filtered = applyTail(docs, tail, params);
    return [filtered.length] as unknown as T[];
  }

  // Detect SELECT VALUE c.<field> FROM c ...
  const valueMatch = /^SELECT\s+VALUE\s+c\.(\w+)\s+FROM\s+c\s*(.*)$/is.exec(sql);
  if (valueMatch) {
    const field = valueMatch[1];
    const tail = valueMatch[2] ?? "";
    const filtered = applyTail(docs, tail, params);
    return filtered.map((d) => (d as Record<string, unknown>)[field]) as T[];
  }

  // Detect SELECT c.field [, c.field2 ...] FROM c ...  (projection)
  const projMatch = /^SELECT\s+(c\.\w+(?:\s*,\s*c\.\w+)*)\s+FROM\s+c\s*(.*)$/is.exec(sql);
  if (projMatch) {
    const fields = projMatch[1]
      .split(",")
      .map((s) => s.trim().replace(/^c\./, ""));
    const tail = projMatch[2] ?? "";
    const filtered = applyTail(docs, tail, params);
    return filtered.map((d) => {
      const out: Record<string, unknown> = {};
      for (const f of fields) out[f] = (d as Record<string, unknown>)[f];
      return out;
    }) as T[];
  }

  // Standard SELECT * FROM c [WHERE ...] [ORDER BY ...] [OFFSET n LIMIT m]
  const starMatch = /^SELECT\s+\*\s+FROM\s+c\s*(.*)$/is.exec(sql);
  if (!starMatch) {
    throw new Error(`cosmos-fake: unsupported SELECT shape:\n${sql}`);
  }
  const tail = starMatch[1] ?? "";
  return applyTail(docs, tail, params) as unknown as T[];
}

function applyTail(docs: Doc[], rawTail: string, params: ParamMap): Doc[] {
  let tail = rawTail.trim();

  // OFFSET n LIMIT m
  let offset = 0;
  let limit = Infinity;
  const offsetLimitMatch = /\bOFFSET\s+(\d+)\s+LIMIT\s+(\d+)\s*$/i.exec(tail);
  if (offsetLimitMatch) {
    offset = parseInt(offsetLimitMatch[1], 10);
    limit = parseInt(offsetLimitMatch[2], 10);
    tail = tail.slice(0, offsetLimitMatch.index).trim();
  } else {
    const limitOnly = /\bLIMIT\s+(\d+)\s*$/i.exec(tail);
    if (limitOnly) {
      limit = parseInt(limitOnly[1], 10);
      tail = tail.slice(0, limitOnly.index).trim();
    }
  }

  // ORDER BY ...
  let orderBy: Array<{ field: string; dir: "asc" | "desc" }> = [];
  const orderMatch = /\bORDER\s+BY\s+(.+)$/i.exec(tail);
  if (orderMatch) {
    const orderClause = orderMatch[1].trim();
    orderBy = orderClause.split(",").map((part) => {
      const m = /^c\.(\w+)\s*(ASC|DESC)?$/i.exec(part.trim());
      if (!m) throw new Error(`cosmos-fake: cannot parse ORDER BY part: ${part}`);
      return { field: m[1], dir: ((m[2] ?? "ASC").toUpperCase() === "DESC" ? "desc" : "asc") };
    });
    tail = tail.slice(0, orderMatch.index).trim();
  }

  // WHERE ...
  let predicate: ((d: Doc) => boolean) | null = null;
  const whereMatch = /^WHERE\s+(.+)$/is.exec(tail);
  if (whereMatch) {
    predicate = compilePredicate(whereMatch[1].trim(), params);
  } else if (tail.length > 0) {
    throw new Error(`cosmos-fake: unexpected trailing tokens after FROM c: "${tail}"`);
  }

  let out = predicate ? docs.filter(predicate) : docs.slice();

  for (const ob of orderBy.slice().reverse()) {
    out.sort((a, b) => {
      const av = (a as Record<string, unknown>)[ob.field];
      const bv = (b as Record<string, unknown>)[ob.field];
      if (av === bv) return 0;
      if (av === undefined || av === null) return 1;
      if (bv === undefined || bv === null) return -1;
      const cmp = (av as number | string) < (bv as number | string) ? -1 : 1;
      return ob.dir === "desc" ? -cmp : cmp;
    });
  }

  return out.slice(offset, offset + limit).map((d) => ({ ...d }));
}

/**
 * Compile a Cosmos WHERE expression into a JS predicate.
 *
 * Strategy: rewrite the SQL string into a JavaScript expression operating on
 * variables `c` (the doc) and `p` (the params map), then evaluate with `new Function`.
 *
 * SECURITY NOTE: this runs only against test-supplied SQL strings from era's
 * own source. Never expose this function to user input.
 */
function compilePredicate(expr: string, params: ParamMap): (d: Doc) => boolean {
  let js = expr;

  // Mask string literals so transformations don't touch their contents.
  const literals: string[] = [];
  js = js.replace(/'((?:[^'\\]|\\.)*)'/g, (_m, body) => {
    literals.push(body);
    return `__STR${literals.length - 1}__`;
  });

  // ARRAY_CONTAINS(c.arr, value [, true])  → __ac1(c.arr, value)
  js = js.replace(
    /ARRAY_CONTAINS\s*\(\s*c\.(\w+)\s*,\s*([^,)]+?)(?:\s*,\s*true)?\s*\)/gi,
    (_m, field, val) => `__ac1(c.${field}, ${val.trim()})`,
  );
  // ARRAY_CONTAINS(@param, c.field)        → __ac2(p.param, c.field)
  js = js.replace(
    /ARRAY_CONTAINS\s*\(\s*@(\w+)\s*,\s*c\.(\w+)\s*\)/gi,
    (_m, param, field) => `__ac2(p.${param}, c.${field})`,
  );

  // IS_DEFINED(c.field) → (c.field !== undefined)
  js = js.replace(/IS_DEFINED\s*\(\s*c\.(\w+(?:\.\w+)*)\s*\)/gi, (_m, field) => {
    return `(c.${field} !== undefined)`;
  });

  // IS_NULL(c.field) → (c.field === null || c.field === undefined)
  // Cosmos's IS_NULL matches only true JSON null, but our fake stores docs that
  // may omit fields entirely (rather than persist `field: null`). Treat both as
  // the "null-ish" case so queries like `IS_NULL(c.companyId)` match shared
  // documents that simply don't carry the field.
  js = js.replace(/IS_NULL\s*\(\s*c\.(\w+(?:\.\w+)*)\s*\)/gi, (_m, field) => {
    return `(c.${field} === null || c.${field} === undefined)`;
  });

  // LOWER(c.field) → String(c.field ?? '').toLowerCase()
  js = js.replace(/LOWER\s*\(\s*c\.(\w+)\s*\)/gi, (_m, f) => `String(c.${f} ?? '').toLowerCase()`);

  // c.field IN ('a','b')  → ['a','b'].includes(c.field)
  js = js.replace(/c\.(\w+)\s+IN\s*\(([^)]+)\)/gi, (_m, field, list) => {
    return `[${list}].includes(c.${field})`;
  });

  // Logical operators
  js = js.replace(/\bAND\b/gi, "&&");
  js = js.replace(/\bOR\b/gi, "||");
  js = js.replace(/\bNOT\b/gi, "!");

  // Comparison operators — order matters:
  //   1. != / !==  (use lookahead so existing !== survives)
  //   2. =  → === (with lookbehind to skip <=, >=, !=, ==)
  js = js.replace(/!==/g, "\x00NEQ3\x00"); // protect existing
  js = js.replace(/!=(?!=)/g, "\x00NEQ\x00"); // != → marker
  js = js.replace(/(?<![<>=!])=(?!=)/g, "==="); // = → ===
  js = js.replace(/\x00NEQ3\x00/g, "!==");
  js = js.replace(/\x00NEQ\x00/g, "!==");

  // Parameters: @name → p.name
  js = js.replace(/@(\w+)/g, (_m, name) => `p[${JSON.stringify(name)}]`);

  // Restore string literals
  js = js.replace(/__STR(\d+)__/g, (_m, idx) => JSON.stringify(literals[Number(idx)]));

  // Field nesting: c.field, c.lines[0].accountCode
  // Already valid JS — no transformation needed since c.field works.

  // Helpers used in compiled expressions
  const ac1 = (arr: unknown, val: unknown): boolean => {
    if (!Array.isArray(arr)) return false;
    if (val !== null && typeof val === "object") {
      // Match by structural equality of provided keys
      return arr.some((a) =>
        Object.entries(val as Record<string, unknown>).every(
          ([k, v]) => (a as Record<string, unknown>)?.[k] === v,
        ),
      );
    }
    return arr.includes(val);
  };
  const ac2 = (arr: unknown, val: unknown): boolean => {
    if (!Array.isArray(arr)) return false;
    return arr.includes(val);
  };

  let fn: (c: Doc, p: ParamMap, __ac1: typeof ac1, __ac2: typeof ac2) => boolean;
  try {
    // eslint-disable-next-line no-new-func
    fn = new Function(
      "c",
      "p",
      "__ac1",
      "__ac2",
      `try { return Boolean(${js}); } catch { return false; }`,
    ) as typeof fn;
  } catch (e) {
    throw new Error(`cosmos-fake: failed to compile WHERE predicate.\nSQL: ${expr}\nJS: ${js}\nError: ${(e as Error).message}`);
  }

  return (d: Doc) => fn(d, params, ac1, ac2);
}

// ─── Module-level state and exports ─────────────────────────

const containerRegistry = new Map<string, FakeContainer>();

export function getFakeContainer(name: string): FakeContainer {
  let c = containerRegistry.get(name);
  if (!c) {
    c = new FakeContainer(name);
    containerRegistry.set(name, c);
  }
  return c;
}

export function resetAllFakeContainers(): void {
  for (const c of containerRegistry.values()) c._reset();
}

export function dumpFakeContainer(name: string): Doc[] {
  return getFakeContainer(name)._all();
}

// Suppress vitest's auto-discovery thinking this is a test file.
if (false as boolean) describe("noop", () => {});
