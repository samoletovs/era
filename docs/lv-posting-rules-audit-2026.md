# LV Posting Rules Audit — May 2026

**Scope:** Verify that every Latvian posting rule in `src/shared/rules/lv.ts` cites the exact regulatory paragraph that justifies the recognition pattern.

**Status:** Complete. All five rules now carry `legalBasis` paragraph citations.

## Background

Cabinet Regulation No. 775 of 22 December 2015 — *"Gada pārskatu un konsolidēto gada pārskatu likuma piemērošanas noteikumi"* (likumi.lv id 278844) — is the application rules for the **Annual Reports and Consolidated Annual Reports Law**. It governs recognition, valuation and presentation of items in statutory financial reports.

It does **not** define a chart of accounts. The 4-digit account codes used throughout era (2210, 2310, 2420, 4220, 4230, 5220, 6420 etc.) follow the **conventional Latvian commercial chart of accounts** that companies adopt as their accounting policy under Reg 775 §29–§30. Reg 775 mandates that the policy be consistent and faithful to the regulation, but the specific code numbers are not regulatory.

## Findings

### F1 — Header comment misdescribed the regulation (fixed)

The previous header in [`lv.ts`](../src/shared/rules/lv.ts) stated:

> Based on Cabinet Regulation No. 775 — Latvian Chart of Accounts

This was incorrect. Reg 775 is the application rules for the Annual Reports Law, not a chart-of-accounts regulation. The header has been rewritten to describe the actual legal framework and to clarify that account codes are commercial convention.

### F2 — No paragraph-level traceability (fixed)

Rules carried only a top-level `source: "LV-Cabinet-Regulation-775"` string. There was no way for a reviewer or auditor to see *which paragraph* justifies *which line of a posting*.

A new optional `legalBasis: string[]` field was added to the `PostingRule` interface in [`entities.ts`](../src/shared/types/entities.ts) and populated for all five LV rules.

### F3 — Inline rule descriptions were generic (fixed)

Rule `description` strings now reference the specific paragraphs. Per-line `description` fields explain the legal reason for each debit/credit (e.g. "third-party collection (Reg 775 §52)" for VAT payable).

## Per-rule legal mapping

| Rule | Paragraphs cited |
|------|------------------|
| `lv-sales-invoice-v1` | Reg 775 §50 (Net turnover), §51 (revenue definition), §52 (third-party collections excluded → VAT), §53 (recognition criteria), §156 (debtor balances); VAT Law (output VAT) |
| `lv-purchase-invoice-v1` | Reg 775 §156 (creditor balances); Annual Reports Law (cost classification); VAT Law (input VAT) |
| `lv-incoming-payment-v1` | Reg 775 §156 (debtor settlement) |
| `lv-outgoing-payment-v1` | Reg 775 §156 (creditor settlement) |
| `lv-fx-revaluation-v1` | Reg 775 §38, §39 (accounting estimates), §105¹ (FX revaluation distinction); Annual Reports Law (foreign-currency monetary items) |

## Out of scope

The following are real but separate workstreams; not addressed here:

- **PEPPOL e-invoice mapping** — needs vendor selection.
- **VID submission of annual report** — needs production credentials.
- **Annual report polish (line-item formatting)** — covered under "annual report polish" roadmap item.
- **Latvian-language UI strings** — handled by i18n, not posting rules.

## How to extend

When adding a new posting rule (LV or other country):

1. Cite the **specific** paragraph(s) of the governing regulation in `legalBasis`.
2. In each line's `description`, mention the paragraph or principle behind that debit/credit.
3. If the regulation does not mandate a specific account code, do not pretend it does — state in the file header that codes are commercial convention.
4. The [`posting-rules` skill](../.github/skills/posting-rules/SKILL.md) documents the full convention.

## References

- Likumi.lv — [Cabinet Regulation No. 775 (2015)](https://likumi.lv/ta/id/278844)
- Likumi.lv — [Annual Reports Law](https://likumi.lv/ta/id/277779)
- VAT Law — [Pievienotās vērtības nodokļa likums](https://likumi.lv/ta/id/253451)
