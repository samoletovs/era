import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Azure OpenAI retires gpt-4o, gpt-4o-mini and the gpt-4.1 family on 2027-04-14.
// Code, scripts, IaC and workflows must not name them as defaults or allowlist
// entries. Docs and tests may mention them (migration notes, legacy-body tests).

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const SCANNED = ['src', 'scripts', 'infrastructure', '.github/workflows', '.env.example'];
const TEXT_FILE = /\.(?:ts|tsx|js|mjs|cjs|json|bicep|bicepparam|ya?ml|html|css|example)$/;
const SKIPPED_DIRS = new Set(['node_modules', 'dist', '.git']);
const RETIRING_MODEL = /\bgpt-?4(?:o|\.1)\b/i;

function collectFiles(path: string): string[] {
  const stats = statSync(path, { throwIfNoEntry: false });
  if (!stats) return [];
  if (stats.isFile()) return [path];
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory()) {
      return SKIPPED_DIRS.has(entry.name) ? [] : collectFiles(join(path, entry.name));
    }
    return TEXT_FILE.test(entry.name) ? [join(path, entry.name)] : [];
  });
}

function retiringModelReferences(files: string[]): string[] {
  return files.flatMap((file) =>
    readFileSync(file, 'utf8')
      .split(/\r?\n/)
      .flatMap((line, index) =>
        RETIRING_MODEL.test(line)
          ? [`${relative(REPO_ROOT, file).replaceAll('\\', '/')}:${index + 1}: ${line.trim()}`]
          : [],
      ),
  );
}

describe('retiring Azure OpenAI models', () => {
  it('are not named in source, scripts, infrastructure, workflows or .env.example', () => {
    const files = SCANNED.flatMap((entry) => collectFiles(join(REPO_ROOT, entry)));
    // An empty scan would pass vacuously (wrong root, moved directories).
    expect(files.length).toBeGreaterThan(20);

    expect(retiringModelReferences(files)).toStrictEqual([]);
  });
});
