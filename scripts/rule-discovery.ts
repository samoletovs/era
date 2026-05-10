#!/usr/bin/env tsx
// Rule-discovery prototype CLI.
//
// Usage:
//
//   tsx scripts/rule-discovery.ts \
//     --text path/to/amendment.txt \
//     [--label "Cabinet Reg 775 amendment 2026-04"] \
//     [--out reports/rule-discovery/2026-04-amendment.md]
//
// Output: a Markdown report at the given path (or stdout if --out is
// omitted) containing the LLM's proposed deltas to the LV posting-rule
// catalogue. NEVER auto-merges into lv.ts — human review required.
//
// Why text-input only (no PDF parsing): the prototype is opinionated
// about the easy path. likumi.lv exposes amendments as plain text and
// the user can copy the relevant section into a .txt file. Adding a PDF
// dep is left for a follow-on if this prototype proves valuable.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { argv, exit, env } from 'node:process';

import { AzureOpenAI } from 'openai';

import {
  buildAnalysisPrompt,
  extractAmendmentParagraphs,
  findCitingRules,
  parseProposedChanges,
  renderProposalMarkdown,
} from '../src/backend/services/rule-discovery.js';
import { LV_POSTING_RULES } from '../src/shared/rules/lv.js';

interface CliArgs {
  textPath?: string;
  outPath?: string;
  label: string;
  deployment: string;
  dryRun: boolean;
}

function parseArgs(): CliArgs {
  const a = argv.slice(2);
  const args: CliArgs = {
    label: 'Cabinet Reg 775 amendment',
    deployment: env.AZURE_OPENAI_DEPLOYMENT ?? 'gpt-4o',
    dryRun: false,
  };
  for (let i = 0; i < a.length; i += 1) {
    const k = a[i];
    if (k === '--text') args.textPath = a[++i];
    else if (k === '--out') args.outPath = a[++i];
    else if (k === '--label') args.label = a[++i];
    else if (k === '--deployment') args.deployment = a[++i];
    else if (k === '--dry-run') args.dryRun = true;
    else if (k === '--help' || k === '-h') {
      printHelp();
      exit(0);
    }
  }
  if (!args.textPath) {
    console.error('error: --text <path> is required');
    printHelp();
    exit(1);
  }
  return args;
}

function printHelp(): void {
  console.error(`Usage: tsx scripts/rule-discovery.ts --text <path> [options]

Required:
  --text <path>          Path to a text file with the amendment text (likumi.lv copy)

Options:
  --label <string>       Human label for the source (used in the report header)
  --out <path>           Output Markdown path (defaults to stdout)
  --deployment <name>    Azure OpenAI deployment (default: env AZURE_OPENAI_DEPLOYMENT or gpt-4o)
  --dry-run              Run extraction + prompt build, but skip the OpenAI call
  -h, --help             Show this help

Required env (when not --dry-run):
  AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_API_KEY, AZURE_OPENAI_DEPLOYMENT
`);
}

async function main(): Promise<void> {
  const args = parseArgs();
  const text = await readFile(resolve(args.textPath!), 'utf8');

  const amendments = extractAmendmentParagraphs(text);
  console.error(`Extracted ${amendments.length} paragraph(s) from amendment text.`);
  if (amendments.length === 0) {
    console.error('No paragraphs detected. Ensure the text uses § markers.');
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

  if (args.outPath) {
    const out = resolve(args.outPath);
    await mkdir(dirname(out), { recursive: true });
    await writeFile(out, md, 'utf8');
    console.error(`Wrote report: ${out}`);
  } else {
    console.log(md);
  }
}

main().catch((err) => {
  console.error('rule-discovery failed:', err);
  exit(1);
});
