const fs = require("fs");
const files = [
  "src/frontend/pages/Accounts.tsx",
  "src/frontend/pages/BankRecon.tsx",
  "src/frontend/pages/Contacts.tsx",
  "src/frontend/pages/FixedAssets.tsx",
  "src/frontend/pages/Invoices.tsx",
  "src/frontend/pages/Items.tsx",
  "src/frontend/pages/RecurringEntries.tsx",
  "src/frontend/pages/Reports.tsx",
  "src/frontend/pages/Accounting.tsx",
];

for (const file of files) {
  let src = fs.readFileSync(file, "utf8");

  // 1. Add import for formatMoney
  if (!src.includes("formatMoney")) {
    src = src.replace(
      /from ["']\.\.\/utils\/context["'];?/,
      (match) => match + '\nimport { formatMoney, formatMoneyOr } from "../utils/format";'
    );
  }

  // 2. Replace useApp() destructuring to include numberFormat
  src = src.replace(
    /const\s*\{\s*companyId\s*\}\s*=\s*useApp\(\)/,
    "const { companyId, numberFormat: fmt } = useApp()"
  );
  src = src.replace(
    /const\s*\{\s*companyId,\s*companies\s*\}\s*=\s*useApp\(\)/,
    "const { companyId, companies, numberFormat: fmt } = useApp()"
  );

  // 3. Replace template literal patterns: `€${x.toFixed(2)}`
  src = src.replace(/`€\$\{([^}]+)\.toFixed\(2\)\}`/g, (m, expr) => {
    return "formatMoney(" + expr.trim() + ", fmt)";
  });

  // 4. Replace JSX: €{(expr ?? 0).toFixed(2)}
  src = src.replace(/€\{\(([^)]+?)\s*\?\?\s*0\)\.toFixed\(2\)\}/g, (m, expr) => {
    return "{formatMoney(" + expr.trim() + ", fmt)}";
  });

  // 5. Replace JSX: €{expr?.toFixed(2)}
  src = src.replace(/€\{([^}]+?)\?\.toFixed\(2\)\}/g, (m, expr) => {
    return "{formatMoney(" + expr.trim() + ", fmt)}";
  });

  // 6. Replace JSX: €{expr.toFixed(2)}
  src = src.replace(/€\{([^}]+?)\.toFixed\(2\)\}/g, (m, expr) => {
    return "{formatMoney(" + expr.trim() + ", fmt)}";
  });

  fs.writeFileSync(file, src, "utf8");

  const count = (src.match(/formatMoney/g) || []).length;
  const remaining = (src.match(/toFixed\(2\)/g) || []).length;
  console.log(`${file}: ${count} formatMoney calls, ${remaining} remaining toFixed(2)`);
}
