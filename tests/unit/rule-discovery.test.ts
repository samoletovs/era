// Unit tests for the rule-discovery prototype helpers.
//
// All five exported functions are pure — no Cosmos, no OpenAI, no FS.
// The CLI runner (scripts/rule-discovery.ts) is exercised manually
// because it requires Azure OpenAI credentials.

import { describe, expect, it } from 'vitest';

import {
  buildAnalysisPrompt,
  extractAmendmentParagraphs,
  findCitingRules,
  parseProposedChanges,
  renderProposalMarkdown,
  type ProposedChange,
} from '../../src/backend/services/rule-discovery';
import type { PostingRule } from '../../src/shared/types/entities';

function makeRule(overrides: Partial<PostingRule>): PostingRule {
  const now = new Date().toISOString();
  return {
    id: 'r-1',
    country: 'LV',
    documentType: 'sales-invoice',
    name: 'Test rule',
    description: 'desc',
    version: 1,
    conditions: [],
    lines: [],
    effectiveFrom: '2026-01-01',
    isActive: true,
    createdAt: now,
    updatedAt: now,
    createdBy: 'u-1',
    legalBasis: [],
    ...overrides,
  };
}

describe('extractAmendmentParagraphs', () => {
  it('returns [] for empty input', () => {
    expect(extractAmendmentParagraphs('')).toEqual([]);
    expect(extractAmendmentParagraphs('   \n\n  ')).toEqual([]);
  });

  it('parses simple §N headings', () => {
    const text = `Some preamble.

§50. New text describing the net turnover.

§52. Updated rules for VAT exclusion.`;
    const result = extractAmendmentParagraphs(text);
    expect(result.map((p) => p.id)).toEqual(['§50', '§52']);
    expect(result[0].text).toContain('net turnover');
    expect(result[1].text).toContain('VAT exclusion');
  });

  it('handles superscript variants (§52¹)', () => {
    const text = `§52. Foo.\n§52¹. Inserted between §52 and §53.\n§53. Bar.`;
    const result = extractAmendmentParagraphs(text);
    expect(result.map((p) => p.id)).toEqual(['§52', '§52¹', '§53']);
  });

  it('produces sortKey suitable for ordering', () => {
    const result = extractAmendmentParagraphs(
      `§9. Nine.\n§50. Fifty.\n§52¹. Fifty-two-one.\n§156. One-five-six.`,
    );
    const sortKeys = result.map((p) => p.sortKey);
    const sorted = [...sortKeys].sort();
    expect(sortKeys).toEqual(sorted);
  });

  it('returns the full paragraph body including leading marker', () => {
    const text = `§50. Net turnover means the sum of revenue from ordinary activities net of returns and discounts.`;
    const [p] = extractAmendmentParagraphs(text);
    expect(p.text.startsWith('§50')).toBe(true);
    expect(p.text).toContain('Net turnover');
  });
});

describe('findCitingRules', () => {
  it('matches rules by exact paragraph identifier in legalBasis', () => {
    const rules = [
      makeRule({ id: 'lv-sales-v1', legalBasis: ['Reg 775 §50', 'Reg 775 §52'] }),
      makeRule({ id: 'lv-fx-v1', legalBasis: ['Reg 775 §38', 'Reg 775 §105¹'] }),
      makeRule({ id: 'lv-purchase-v1', legalBasis: ['Reg 775 §156'] }),
    ];
    const amendments = extractAmendmentParagraphs(`§50. ...\n§38. ...\n§99. ...`);
    const map = findCitingRules(amendments, rules);
    expect(map.get('§50')?.map((r) => r.id)).toEqual(['lv-sales-v1']);
    expect(map.get('§38')?.map((r) => r.id)).toEqual(['lv-fx-v1']);
    expect(map.get('§99')).toEqual([]);
  });

  it('treats rules with no legalBasis as not citing anything', () => {
    const rules = [makeRule({ id: 'lv-x-v1', legalBasis: undefined })];
    const amendments = extractAmendmentParagraphs(`§50. ...`);
    const map = findCitingRules(amendments, rules);
    expect(map.get('§50')).toEqual([]);
  });

  it('matches superscript paragraphs correctly', () => {
    const rules = [makeRule({ id: 'lv-fx-v1', legalBasis: ['Reg 775 §105¹'] })];
    const amendments = extractAmendmentParagraphs(`§105. base.\n§105¹. inserted.`);
    const map = findCitingRules(amendments, rules);
    expect(map.get('§105¹')?.map((r) => r.id)).toEqual(['lv-fx-v1']);
    // §105 alone should NOT match §105¹ citation.
    expect(map.get('§105')?.map((r) => r.id) ?? []).toEqual([]);
  });
});

describe('buildAnalysisPrompt', () => {
  it('includes the system + user halves and lists each amendment paragraph', () => {
    const amendments = extractAmendmentParagraphs(`§50. New text.\n§52. Other text.`);
    const rules = [makeRule({ id: 'lv-sales-v1', legalBasis: ['Reg 775 §50'] })];
    const map = findCitingRules(amendments, rules);
    const { system, user } = buildAnalysisPrompt(amendments, rules, map);
    expect(system).toContain('Latvian accounting compliance analyst');
    expect(user).toContain('## §50');
    expect(user).toContain('## §52');
    expect(user).toContain('lv-sales-v1');
  });

  it('marks paragraphs with no current rule citation', () => {
    const amendments = extractAmendmentParagraphs(`§99. Brand new section.`);
    const rules = [makeRule({ id: 'lv-x-v1', legalBasis: ['Reg 775 §50'] })];
    const map = findCitingRules(amendments, rules);
    const { user } = buildAnalysisPrompt(amendments, rules, map);
    // §99 has no citing rules — the "Currently cited by" footer must be absent.
    const block = user.slice(user.indexOf('## §99'));
    expect(block.includes('Currently cited by')).toBe(false);
  });
});

describe('parseProposedChanges', () => {
  it('parses a clean JSON response', () => {
    const json = JSON.stringify({
      proposedChanges: [
        {
          kind: 'modify-rule',
          ruleId: 'lv-sales-invoice-v1',
          citedParagraphs: ['§52'],
          rationale: 'New paragraph clarifies VAT third-party collection.',
          proposedDelta: 'Add a CR line for 4232 when X applies.',
          confidence: 'high',
        },
      ],
    });
    const result = parseProposedChanges(json);
    expect(result).toHaveLength(1);
    expect(result[0].kind).toBe('modify-rule');
    expect(result[0].confidence).toBe('high');
    expect(result[0].citedParagraphs).toEqual(['§52']);
  });

  it('strips markdown fences', () => {
    const json = '```json\n' + JSON.stringify({ proposedChanges: [] }) + '\n```';
    expect(parseProposedChanges(json)).toEqual([]);
  });

  it('throws on invalid JSON', () => {
    expect(() => parseProposedChanges('not valid')).toThrow();
  });

  it('throws when proposedChanges is missing', () => {
    expect(() => parseProposedChanges('{"foo": []}')).toThrow(/proposedChanges/);
  });

  it('drops entries with unknown kind', () => {
    const json = JSON.stringify({
      proposedChanges: [
        { kind: 'wibble', ruleId: 'x', citedParagraphs: [], rationale: '', proposedDelta: '', confidence: 'low' },
        { kind: 'add-rule', ruleId: 'y', citedParagraphs: [], rationale: '', proposedDelta: '', confidence: 'low' },
      ],
    });
    expect(parseProposedChanges(json)).toHaveLength(1);
  });

  it('coerces invalid confidence to "low"', () => {
    const json = JSON.stringify({
      proposedChanges: [
        {
          kind: 'add-rule',
          ruleId: 'x',
          citedParagraphs: [],
          rationale: '',
          proposedDelta: '',
          confidence: 'super-high',
        },
      ],
    });
    expect(parseProposedChanges(json)[0].confidence).toBe('low');
  });
});

describe('renderProposalMarkdown', () => {
  it('renders an empty-changes report', () => {
    const md = renderProposalMarkdown([], [], { sourceLabel: 'Test' });
    expect(md).toContain('# Rule discovery report');
    expect(md).toContain('Test');
    expect(md).toContain('_None — no impactful changes detected._');
  });

  it('groups changes by kind and shows confidence', () => {
    const amendments = extractAmendmentParagraphs(`§50. Foo.`);
    const changes: ProposedChange[] = [
      {
        kind: 'modify-rule',
        ruleId: 'lv-sales-v1',
        citedParagraphs: ['§50'],
        rationale: 'New definition',
        proposedDelta: 'Update legalBasis',
        confidence: 'high',
      },
      {
        kind: 'add-rule',
        ruleId: 'lv-new-rule-v1',
        citedParagraphs: ['§50'],
        rationale: 'Brand new posting',
        proposedDelta: 'DR 6110, CR 4220',
        confidence: 'medium',
      },
    ];
    const md = renderProposalMarkdown(amendments, changes, { sourceLabel: 'Test' });
    expect(md).toContain('### add-rule (1)');
    expect(md).toContain('### modify-rule (1)');
    expect(md).toContain('lv-sales-v1');
    expect(md).toContain('lv-new-rule-v1');
    expect(md).toContain('**Confidence:** high');
    expect(md).toContain('**Confidence:** medium');
    expect(md).toContain('### §50');
  });

  it('always emits the human-review warning', () => {
    const md = renderProposalMarkdown([], [], { sourceLabel: 'Test' });
    expect(md).toMatch(/reviewed by a qualified accountant/);
  });
});
