#!/usr/bin/env tsx
// Rule-discovery prototype CLI.
//
// Usage:
//
//   # From a likumi.lv text copy
//   tsx scripts/rule-discovery.ts --text path/to/amendment.txt
//
//   # From a downloaded amendment PDF
//   tsx scripts/rule-discovery.ts --pdf path/to/amendment.pdf
//
//   # Open a draft PR with the report under reports/rule-discovery/
//   tsx scripts/rule-discovery.ts --pdf foo.pdf --pr
//
// Output: a Markdown report at the given path (or stdout if --out is
// omitted) containing the LLM's proposed deltas to the LV posting-rule
// catalogue. NEVER auto-merges into lv.ts — human review required.
//
// PDF support uses pdf-parse (pure-JS); large PDFs may take a few
// seconds. The text path remains the easy/canonical input — likumi.lv
// exposes amendments as plain text and that is preferred when available.

import { execFile } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { argv, env, exit } from 'node:process';
import { promisify } from 'node:util';

import { AzureOpenAI } from 'openai';

import {
  buildAnalysisPrompt,
  extractAmendmentParagraphs,
  findCitingRules,
  parseProposedChanges,
  renderProposalMarkdown,
} from '../src/backend/services/rule-discovery.js';
import { LV_POSTING_RULES } from '../src/shared/rules/lv.js';

const execFileAsync = promisify(execFile);

interface CliArgs {
  textPath?: string;
  pdfPath?: string;
  outPath?: string;
  label: string;
  deployment: string;
  dryRun: boolean;
  pr: boolean;
}

function parseArgs(): CliArgs {
  const a = argv.slice(2);
  const args: CliArgs = {
    label: 'Cabinet Reg 775 amendment',
    deployment: env.AZURE_OPENAI_DEPLOYMENT ?? 'gpt-4o',
    dryRun: false,
    pr: false,
  };
  for (let i = 0; i < a.length; i += 1) {
    const k = a[i];
    if (k === '--text') args.textPath = a[++i];
    else if (k === '--pdf') args.pdfPath = a[++i];
    else if (k === '--out') args.outPath = a[++i];
    else if (k === '--label') args.label = a[++i];
    else if (k === '--deployment') args.deployment = a[++i];
    else if (k === '--dry-run') args.dryRun = true;
    else if (k === '--pr') args.pr = true;
    else if (k === '--help' || k === '-h') {
      printHelp();
      exit(0);
    }
  }
  if (!args.textPath && !args.pdfPath) {
    console.error('error: one of --text <path> or --pdf <path> is required');
    printHelp();
    exit(1);
  }
  if (args.textPath && args.pdfPath) {
    console.error('error: pass either --text or --pdf, not both');
    exit(1);
  }
  return args;
}

function printHelp(): void {
  console.error(`Usage: tsx scripts/rule-discovery.ts [--text <path> | --pdf <path>] [options]

One of:
  --text <path>          Path to a text file with the amendment (likumi.lv copy)
  --pdf <path>           Path to an amendment PDF (parsed via pdf-parse)

Options:
  --label <string>       Human label for the source (used in the report header)
  --out <path>           Output Markdown path (defaults to a timestamped path
                         under reports/rule-discovery/ when --pr is used,
                         otherwise stdout)
  --deployment <name>    Azure OpenAI deployment (default: env AZURE_OPENAI_DEPLOYMENT or gpt-4o)
  --dry-run              Run extraction + prompt build, but skip the OpenAI call
  --pr                   After writing the report, create a branch + commit +
                         draft PR via the \`gh\` CLI (requires gh auth + clean tree)
  -h, --help             Show this help

Required env (when not --dry-run):
  AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_API_KEY, AZURE_OPENAI_DEPLOYMENT
`);
}

async function loadAmendmentText(args: CliArgs): Promise<string> {
  if (args.textPath) {
    return readFile(resolve(args.textPath), 'utf8');
  }
  // PDF path. Imported dynamically so users without --pdf don't pay the cost.
  const mod = (await import('pdf-parse')) as unknown as {
    default: (data: Buffer) => Promise<{ text: string }>;
  };
  const buf = await readFile(resolve(args.pdfPath!));
  const parsed = await mod.default(buf);
  return parsed.text;
}

async function openDraftPr(reportPath: string, label: string): Promise<void> {
  try {
    await execFileAsync('gh', ['--version']);
  } catch {
    throw new Error('--pr requires the GitHub CLI (`gh`) on PATH and authenticated');
  }
  const { stdout: status } = await execFileAsync('git', ['status', '--porcelain']);
  const dirty = status
    .split('\n')
    .filter((l) => l.trim() && !l.includes(reportPath));
  if (dirty.length > 0) {
    throw new Error(
      `--pr requires a clean working tree (apart from the report). Dirty:\n${dirty.join('\n')}`,
    );
  }

  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const branch = `rule-discovery/${ts}`;
  console.error(`Creating branch ${branch} and committing report...`);
  await execFileAsync('git', ['checkout', '-b', branch]);
  await execFileAsync('git', ['add', reportPath]);
  await execFileAsync('git', [
    'commit',
    '-m',
    `chore(era): rule-discovery report \u2014 ${label}`,
    '-m',
    'LLM-drafted analysis of a Cabinet Regulation amendment. Requires human review before any change to src/shared/rules/lv.ts.',
  ]);
  await execFileAsync('git', ['push', '-u', 'origin', branch]);
  const { stdout: prUrl } = await execFileAsync('gh', [
    'pr',
    'create',
    '--draft',
    '--title',
    `rule-discovery: ${label}`,
    '--body',
    `Automated rule-discovery report. **Draft** \u2014 every proposed change must be reviewed by a qualified accountant before merging.\n\nSee \`${reportPath}\` for the full analysis.`,
  ]);
  console.error(`Draft PR opened: ${prUrl.trim()}`);
}

async function main(): Promise<void> {
  const args = parseArgs();
  const text = await loadAmendmentText(args);

  const amendments = extractAmendmentParagraphs(text);
  console.error(`Extracted ${amendments.length} paragraph(s) from amendment.`);
  if (amendments.length === 0) {
    console.error('No paragraphs detected. Ensure the source uses \u00a7 markers.');
    exit(1);
  }

  const citingMap = findCitingRules(amendments, LV_POSTING_RULES);
  const { system, user } = buildAnalysisPrompt(amendments, LV_POSTING_RULES, citingMap);

  if (args.dryRun) {
    console.error('--dry-run: skipping OpenAI call, printing prompt to stdout');
    console.log('# SYSTEM\n\n' + system + '\n\n# USER\n\n' + user);
    return;
  }

  if (!env.AZURE_OPENAI_ENDPOINT || !env.AZURE_OPENAI_API_KEY) {
    console.error('error: AZURE_OPENAI_ENDPOINT and AZURE_OPENAI_API_KEY are required');
    exit(1);
  }

  const client = new AzureOpenAI({
    endpoint: env.AZURE_OPENAI_ENDPOINT,
    apiKey: env.AZURE_OPENAI_API_KEY,
    apiVersion: '2024-10-21',
  });

  console.error(`Calling Azure OpenAI (deployment=${args.deployment})...`);
  const response = await client.chat.completions.create({
    model: args.deployment,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    temperature: 0,
    max_tokens: 4000,
  });

  const content = response.choices[0]?.message?.content ?? '';
  if (!content) {
    console.error('error: empty response from Azure OpenAI');
    exit(1);
  }

  const changes = parseProposedChanges(content);
  console.error(`Parsed ${changes.length} proposed change(s).`);

  const md = renderProposalMarkdown(amendments, changes, { sourceLabel: args.label });

  // Decide output path. --pr forces a file under reports/rule-discovery/.
  let outPath = args.outPath;
  if (!outPath && args.pr) {
    const ts = new Date().toISOString().slice(0, 10);
    const slug = args.label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    outPath = `reports/rule-discovery/${ts}-${slug}.md`;
  }

  if (outPath) {
    const out = resolve(outPath);
    await mkdir(dirname(out), { recursive: true });
    await writeFile(out, md, 'utf8');
    console.error(`Wrote report: ${out}`);
    if (args.pr) {
      await openDraftPr(outPath, args.label);
    }
  } else {
    console.log(md);
  }
}

main().catch((err) => {
  console.error('rule-discovery failed:', err);
  exit(1);
});
