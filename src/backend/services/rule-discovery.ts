// Rule discovery — assistive prototype that ingests Latvian Cabinet
// Regulation amendments and proposes deltas to the LV posting-rule
// catalogue.
//
// Boundary:
//   - This service is a TOOL, not a posting engine. Output is always a
//     human-reviewable Markdown report or a draft GitHub issue. Nothing
//     auto-merges to lv.ts.
//   - Pure helpers live here for testability. The CLI runner that calls
//     Azure OpenAI lives in `era/scripts/rule-discovery.ts`.
//
// Pipeline:
//   1. extractAmendmentParagraphs(text)  — parse §N headings from a
//      pre-extracted amendment text (likumi.lv copy or PDF-to-text).
//   2. findCitingRules(amendments, rules) — match each amendment
//      paragraph to the existing rules that cite it via legalBasis.
//   3. buildAnalysisPrompt(amendments, rules) — construct the system+user
//      prompt for the model, naming each amendment paragraph and
//      surfacing the rules that depend on it.
//   4. parseProposedChanges(modelResponse) — parse the JSON response
//      into typed ProposedChange records.
//   5. renderProposalMarkdown(changes) — produce the human report.

import type { PostingRule } from '@shared/types';

export interface AmendmentParagraph {
  /** Section identifier as printed, e.g. "§50", "§52¹", "§156". */
  id: string;
  /** Numeric portion for ordering; e.g. "50", "52.1", "156". */
  sortKey: string;
  /** Full paragraph text. */
  text: string;
}

export interface ProposedChange {
  kind: 'add-rule' | 'modify-rule' | 'deprecate-rule' | 'add-citation' | 'unclear';
  /** ID of the existing rule (for modify/deprecate/add-citation), or proposed
   *  ID (for add-rule). Empty for "unclear". */
  ruleId: string;
  /** Amendment paragraphs that drove this change, e.g. ["§52", "§52¹"]. */
  citedParagraphs: string[];
  /** Plain-English justification (the model's explanation). */
  rationale: string;
  /** For add-rule / modify-rule: a textual sketch of the new posting (DR/CR
   *  with account codes). For add-citation: the new citation strings. */
  proposedDelta: string;
  /** Self-reported confidence ("high" the change is clearly required by the
   *  amendment, "low" needs a human compliance review). */
  confidence: 'high' | 'medium' | 'low';
}

// Match §N optionally followed by a superscript digit (¹²³⁴⁵) or a
// decimal/comma sub-section (e.g. §52.1 or §156,1). No \b at the end —
// superscript characters are not word chars in JS regex without /u, so
// \b would refuse to terminate after them.
const PARA_HEADER = /(?:^|\n)\s*(§\s*\d+(?:[¹²³⁴⁵]|[.,]\d+)?)/g;

/**
 * Parse a Latvian regulation amendment text into numbered paragraphs.
 * Accepts the format used by likumi.lv (§50, §52¹, §156.1, etc.).
 */
export function extractAmendmentParagraphs(text: string): AmendmentParagraph[] {
  if (!text || !text.trim()) return [];

  // Locate all paragraph markers; build slices between consecutive markers.
  const matches: Array<{ id: string; index: number }> = [];
  let m: RegExpExecArray | null;
  PARA_HEADER.lastIndex = 0;
  while ((m = PARA_HEADER.exec(text))) {
    const rawId = m[1].replace(/\s+/g, '');
    matches.push({ id: rawId, index: m.index + m[0].indexOf(rawId) });
  }
  if (matches.length === 0) return [];

  const paragraphs: AmendmentParagraph[] = [];
  for (let i = 0; i < matches.length; i += 1) {
    const start = matches[i].index;
    const end = i + 1 < matches.length ? matches[i + 1].index : text.length;
    const id = matches[i].id;
    const body = text.slice(start, end).trim();
    paragraphs.push({
      id,
      sortKey: paragraphSortKey(id),
      text: body,
    });
  }
  return paragraphs;
}

function paragraphSortKey(id: string): string {
  // Strip § and superscripts; convert to padded sortable form.
  const cleaned = id
    .replace(/§/g, '')
    .replace(/¹/g, '.1')
    .replace(/²/g, '.2')
    .replace(/³/g, '.3')
    .replace(/⁴/g, '.4')
    .replace(/⁵/g, '.5')
    .replace(/,/g, '.');
  const [whole, frac = '0'] = cleaned.split('.');
  return `${whole.padStart(6, '0')}.${frac.padEnd(2, '0')}`;
}

/**
 * Map each amendment paragraph to the existing posting rules that already
 * cite it via `legalBasis`. Used to populate the LLM prompt with relevant
 * context and to surface "untouched but cited" warnings.
 */
export function findCitingRules(
  amendments: AmendmentParagraph[],
  rules: PostingRule[],
): Map<string, PostingRule[]> {
  const out = new Map<string, PostingRule[]>();
  for (const a of amendments) {
    const hits = rules.filter((r) =>
      (r.legalBasis ?? []).some((cite) => citationMatches(cite, a.id)),
    );
    out.set(a.id, hits);
  }
  return out;
}

function citationMatches(citation: string, paragraphId: string): boolean {
  // Citations look like "Reg 775 §50" or "Reg 775 §52¹"; we must
  // distinguish §105 from §105¹ — substring includes() is too loose.
  // Strategy: escape the paragraph id, then assert the next character
  // (if any) is not a digit or superscript.
  const normalisedCite = citation.replace(/\s+/g, '');
  const normalisedId = paragraphId.replace(/\s+/g, '');
  const escaped = normalisedId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`${escaped}(?![\\d¹²³⁴⁵])`);
  return re.test(normalisedCite);
}

const SYSTEM_PROMPT = `You are an expert Latvian accounting compliance analyst. You receive (a) the text of a Cabinet Regulation No. 775 amendment and (b) the current set of LV posting rules used by an ERP system.

Your job: identify which posting rules need updates, which new rules should be added, and which old rules should be deprecated. Be conservative — when in doubt, mark as "unclear" so a human reviews it. Do NOT invent legal citations.

Return ONLY valid JSON in the following shape (no markdown, no backticks):

{
  "proposedChanges": [
    {
      "kind": "add-rule" | "modify-rule" | "deprecate-rule" | "add-citation" | "unclear",
      "ruleId": "id of existing or proposed rule",
      "citedParagraphs": ["§50", "§52"],
      "rationale": "plain-English justification",
      "proposedDelta": "textual sketch of the change (DR/CR account codes for posting changes; new citation strings for add-citation)",
      "confidence": "high" | "medium" | "low"
    }
  ]
}`;

/**
 * Build the full prompt sent to Azure OpenAI. Pure — does not call the API.
 */
export function buildAnalysisPrompt(
  amendments: AmendmentParagraph[],
  rules: PostingRule[],
  citingMap: Map<string, PostingRule[]>,
): { system: string; user: string } {
  const userLines: string[] = [];

  userLines.push('# Amendment paragraphs');
  userLines.push('');
  for (const a of amendments) {
    userLines.push(`## ${a.id}`);
    userLines.push('');
    userLines.push(a.text);
    userLines.push('');
    const cited = citingMap.get(a.id) ?? [];
    if (cited.length > 0) {
      userLines.push(`**Currently cited by rule(s):** ${cited.map((r) => r.id).join(', ')}`);
      userLines.push('');
    }
  }

  userLines.push('# Current posting rules (id, country, documentType, legalBasis)');
  userLines.push('');
  for (const r of rules) {
    userLines.push(
      `- \`${r.id}\` — ${r.country} / ${r.documentType} — legalBasis: ${(r.legalBasis ?? []).join('; ') || '(none)'}`,
    );
  }

  userLines.push('');
  userLines.push('# Task');
  userLines.push(
    'Analyse the amendments above. For each impactful change, propose a ProposedChange entry. Cite the specific § identifiers. Set confidence honestly.',
  );

  return {
    system: SYSTEM_PROMPT,
    user: userLines.join('\n'),
  };
}

/**
 * Parse the JSON response from the model into typed ProposedChange records.
 * Tolerates markdown fences and minor spacing issues.
 */
export function parseProposedChanges(modelResponse: string): ProposedChange[] {
  let s = modelResponse.trim();
  if (s.startsWith('```')) {
    s = s.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(s);
  } catch {
    throw new Error(`rule-discovery: model response is not valid JSON: ${s.slice(0, 200)}`);
  }
  const root = parsed as { proposedChanges?: unknown };
  if (!root || !Array.isArray(root.proposedChanges)) {
    throw new Error('rule-discovery: response missing proposedChanges array');
  }
  const out: ProposedChange[] = [];
  for (const raw of root.proposedChanges as Array<Record<string, unknown>>) {
    const kind = String(raw.kind ?? 'unclear') as ProposedChange['kind'];
    if (
      kind !== 'add-rule' &&
      kind !== 'modify-rule' &&
      kind !== 'deprecate-rule' &&
      kind !== 'add-citation' &&
      kind !== 'unclear'
    ) {
      continue;
    }
    out.push({
      kind,
      ruleId: String(raw.ruleId ?? ''),
      citedParagraphs: Array.isArray(raw.citedParagraphs)
        ? raw.citedParagraphs.map((p) => String(p))
        : [],
      rationale: String(raw.rationale ?? ''),
      proposedDelta: String(raw.proposedDelta ?? ''),
      confidence: ((): ProposedChange['confidence'] => {
        const v = String(raw.confidence ?? 'low');
        return v === 'high' || v === 'medium' || v === 'low' ? v : 'low';
      })(),
    });
  }
  return out;
}

/**
 * Render proposed changes as a Markdown report ready to commit under
 * era/reports/rule-discovery/ or paste into a GitHub issue.
 */
export function renderProposalMarkdown(
  amendments: AmendmentParagraph[],
  changes: ProposedChange[],
  options: { sourceLabel: string; generatedAt?: string } = { sourceLabel: 'unknown' },
): string {
  const generated = options.generatedAt ?? new Date().toISOString();
  const lines: string[] = [];
  lines.push(`# Rule discovery report`);
  lines.push('');
  lines.push(`- **Source:** ${options.sourceLabel}`);
  lines.push(`- **Generated:** ${generated}`);
  lines.push(`- **Amendment paragraphs detected:** ${amendments.length}`);
  lines.push(`- **Proposed changes:** ${changes.length}`);
  lines.push('');
  lines.push('> ⚠️ This report is an LLM-generated draft. Every change must be');
  lines.push('> reviewed by a qualified accountant before merging into `lv.ts`.');
  lines.push('');

  if (amendments.length > 0) {
    lines.push('## Amendment paragraphs');
    lines.push('');
    for (const a of amendments) {
      lines.push(`### ${a.id}`);
      lines.push('');
      lines.push('```');
      lines.push(a.text);
      lines.push('```');
      lines.push('');
    }
  }

  lines.push('## Proposed changes');
  lines.push('');
  if (changes.length === 0) {
    lines.push('_None — no impactful changes detected._');
  } else {
    const grouped: Record<ProposedChange['kind'], ProposedChange[]> = {
      'add-rule': [],
      'modify-rule': [],
      'deprecate-rule': [],
      'add-citation': [],
      unclear: [],
    };
    for (const c of changes) grouped[c.kind].push(c);
    for (const [kind, list] of Object.entries(grouped)) {
      if (list.length === 0) continue;
      lines.push(`### ${kind} (${list.length})`);
      lines.push('');
      for (const c of list) {
        lines.push(`#### \`${c.ruleId || '(new)'}\``);
        lines.push('');
        lines.push(`- **Confidence:** ${c.confidence}`);
        lines.push(
          `- **Cited paragraphs:** ${c.citedParagraphs.length > 0 ? c.citedParagraphs.join(', ') : '(none)'}`,
        );
        lines.push(`- **Rationale:** ${c.rationale}`);
        lines.push('');
        lines.push('**Proposed delta:**');
        lines.push('');
        lines.push('```');
        lines.push(c.proposedDelta);
        lines.push('```');
        lines.push('');
      }
    }
  }
  return lines.join('\n');
}
