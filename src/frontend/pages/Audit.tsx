import React, { useEffect, useState } from 'react';
import { useParams, useLocation, Link } from 'react-router';
import { api, formatApiError } from '../utils/api';
import { useApp } from '../utils/context';
import { formatDateTime, formatDate, formatMoney } from '../utils/format';
import { PageHeader, EmptyState } from '../components/PageControls';
import { GlPostings } from '../components/GlPostings';
// Audit chain shape — mirrors `AuditChain` in backend audit-trail.ts.
// All fields nullable so the page can render whatever is available.
interface AuditChain {
  event: {
    id: string;
    type: string;
    timestamp: string;
    actor?: string;
    documentType?: string;
    documentId?: string;
    journalEntryId?: string;
    traceId?: string;
    data?: Record<string, unknown>;
  } | null;
  chatMessage: {
    id: string;
    role?: string;
    content?: string;
    timestamp?: string;
  } | null;
  journalEntry: {
    id: string;
    entryNumber?: string;
    date?: string;
    description?: string;
    status?: string;
    sourceType?: string;
    sourceId?: string;
    lines?: Array<{
      accountCode: string;
      accountName?: string;
      debit?: number;
      credit?: number;
      postingRuleId?: string;
      postingRuleVersion?: number;
      postingRuleCountry?: string;
      postingRuleDocumentType?: string;
      agentReasoningExcerpt?: string;
    }>;
  } | null;
  invoice: {
    id: string;
    invoiceNumber?: string;
    contactName?: string;
    total?: number;
    currency?: string;
    date?: string;
    type?: string;
  } | null;
  payment: {
    id: string;
    amount?: number;
    currency?: string;
    date?: string;
    description?: string;
  } | null;
  rule: {
    id: string;
    name?: string;
    version?: number;
    country?: string;
    documentType?: string;
    source?: string;
    legalBasis?: string[];
  } | null;
}

type Anchor = 'event' | 'entry';

function Card({
  title,
  icon,
  children,
}: {
  title: string;
  icon: string;
  children: React.ReactNode;
}) {
  return (
    <section
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: 16,
        marginBottom: 16,
      }}
    >
      <h2 style={{ margin: '0 0 12px 0', fontSize: 14, fontWeight: 600 }}>
        <span aria-hidden="true" style={{ marginRight: 6 }}>
          {icon}
        </span>
        {title}
      </h2>
      {children}
    </section>
  );
}

function Field({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  if (value === undefined || value === null || value === '') return null;
  return (
    <div style={{ marginBottom: 6, display: 'flex', gap: 8 }}>
      <span style={{ minWidth: 110, color: 'var(--text-secondary)', fontSize: 12 }}>{label}</span>
      <span
        style={{
          fontSize: 13,
          fontFamily: mono ? 'ui-monospace, Consolas, monospace' : undefined,
        }}
      >
        {value}
      </span>
    </div>
  );
}

export function Audit() {
  const params = useParams<{ id: string }>();
  const location = useLocation();
  const { companyId, dateFormat, dateTimeFormat, numberFormat } = useApp();
  const anchor: Anchor = location.pathname.startsWith('/audit/event/') ? 'event' : 'entry';

  const [chain, setChain] = useState<AuditChain | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [reverting, setReverting] = useState(false);
  const [revertResult, setRevertResult] = useState<
    { kind: 'ok'; entryId: string; entryNumber?: string } | { kind: 'err'; message: string } | null
  >(null);

  async function loadChain(signal?: { cancelled: boolean }) {
    if (!params.id || !companyId) return;
    setLoading(true);
    setError(null);
    try {
      const data = (await (anchor === 'event'
        ? api.auditByEvent(companyId, params.id)
        : api.auditByEntry(companyId, params.id))) as AuditChain;
      if (signal?.cancelled) return;
      setChain(data);
    } catch (e) {
      if (signal?.cancelled) return;
      setError(formatApiError(e));
      setChain(null);
    } finally {
      if (!signal?.cancelled) setLoading(false);
    }
  }

  useEffect(() => {
    const signal = { cancelled: false };
    loadChain(signal);
    return () => {
      signal.cancelled = true;
    };
  }, [anchor, params.id, companyId]);

  async function handleRevert() {
    if (!chain?.journalEntry || !companyId) return;
    const entry = chain.journalEntry;
    const ok = window.confirm(
      `Revert journal entry ${entry.entryNumber ?? entry.id}?\n\nThis posts a counter-entry. The original is preserved and marked "reversed".`,
    );
    if (!ok) return;
    setReverting(true);
    setRevertResult(null);
    try {
      const data = (await api.reverseJournalEntry(companyId, entry.id)) as {
        id: string;
        entryNumber?: string;
      };
      setRevertResult({
        kind: 'ok',
        entryId: data.id,
        entryNumber: data.entryNumber,
      });
      // Refresh the chain so status flips to 'reversed' in UI.
      await loadChain();
    } catch (e) {
      setRevertResult({ kind: 'err', message: formatApiError(e) });
    } finally {
      setReverting(false);
    }
  }

  if (loading) {
    return (
      <div>
        <PageHeader title="Audit trail" />
        <p style={{ color: 'var(--text-secondary)' }}>Loading…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <PageHeader title="Audit trail" />
        <EmptyState icon="⚠️" title="Could not load audit trail" description={error} />
      </div>
    );
  }

  if (!chain) {
    return (
      <div>
        <PageHeader title="Audit trail" />
        <EmptyState icon="🔍" title="No data" description="Audit chain is empty." />
      </div>
    );
  }

  const subtitle =
    anchor === 'event'
      ? `Event ${params.id}`
      : `Journal entry ${chain.journalEntry?.entryNumber ?? params.id}`;

  return (
    <div>
      <PageHeader title="Audit trail" />
      <p style={{ color: 'var(--text-secondary)', marginTop: -8, marginBottom: 16 }}>{subtitle}</p>

      {chain.chatMessage && (
        <Card title="Chat message" icon="💬">
          <Field label="Role" value={chain.chatMessage.role} />
          <Field
            label="Time"
            value={
              chain.chatMessage.timestamp
                ? formatDateTime(chain.chatMessage.timestamp, dateFormat, dateTimeFormat)
                : undefined
            }
          />
          {chain.chatMessage.content && (
            <div
              style={{
                marginTop: 8,
                padding: 10,
                background: 'var(--bg-subtle)',
                borderRadius: 8,
                whiteSpace: 'pre-wrap',
                fontSize: 13,
              }}
            >
              {chain.chatMessage.content}
            </div>
          )}
        </Card>
      )}

      {chain.event ? (
        <Card title="Business event" icon="⚡">
          <Field label="Type" value={chain.event.type} mono />
          <Field
            label="When"
            value={formatDateTime(chain.event.timestamp, dateFormat, dateTimeFormat)}
          />
          <Field label="Actor" value={chain.event.actor} />
          <Field label="Document type" value={chain.event.documentType} />
          <Field label="Document ID" value={chain.event.documentId} mono />
          <Field label="Journal entry" value={chain.event.journalEntryId} mono />
          <Field label="Trace ID" value={chain.event.traceId} mono />
        </Card>
      ) : (
        <Card title="Business event" icon="⚡">
          <p style={{ color: 'var(--text-secondary)', fontSize: 13, margin: 0 }}>
            No business event linked. This entry was likely posted manually.
          </p>
        </Card>
      )}

      {chain.journalEntry ? (
        <Card title="Journal entry" icon="📒">
          <Field label="Number" value={chain.journalEntry.entryNumber} mono />
          <Field
            label="Date"
            value={
              chain.journalEntry.date ? formatDate(chain.journalEntry.date, dateFormat) : undefined
            }
          />
          <Field label="Description" value={chain.journalEntry.description} />
          <Field label="Status" value={chain.journalEntry.status} />
          <Field label="Source" value={chain.journalEntry.sourceType} />
          <div style={{ marginTop: 12 }}>
            <GlPostings
              entries={[chain.journalEntry]}
              loading={false}
              formatMoney={(v) => formatMoney(v, numberFormat)}
              fmt={numberFormat}
            />
          </div>
          {/* Revert action — Phase 2 reversibility */}
          {chain.journalEntry.status !== 'reversed' && (
            <div
              style={{
                marginTop: 12,
                paddingTop: 12,
                borderTop: '1px solid var(--border)',
                display: 'flex',
                gap: 8,
                alignItems: 'center',
                flexWrap: 'wrap',
              }}
            >
              <button
                type="button"
                onClick={handleRevert}
                disabled={reverting}
                style={{
                  fontSize: 13,
                  padding: '6px 12px',
                  borderRadius: 6,
                  border: '1px solid var(--border)',
                  background: reverting ? 'var(--bg-subtle)' : 'var(--bg-card)',
                  cursor: reverting ? 'wait' : 'pointer',
                }}
              >
                {reverting ? 'Reverting…' : '↩️ Revert this entry'}
              </button>
              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                Posts a counter-entry; original is preserved.
              </span>
            </div>
          )}
          {chain.journalEntry.status === 'reversed' && (
            <div
              style={{
                marginTop: 12,
                paddingTop: 12,
                borderTop: '1px solid var(--border)',
                fontSize: 13,
                color: 'var(--text-secondary)',
              }}
            >
              This entry has been reversed. The counter-entry should appear in the event log.
            </div>
          )}
          {revertResult?.kind === 'ok' && (
            <div
              role="status"
              style={{
                marginTop: 8,
                padding: 8,
                borderRadius: 6,
                background: 'var(--bg-subtle)',
                fontSize: 13,
              }}
            >
              ✅ Reversed. Counter-entry{' '}
              <Link to={`/audit/entry/${revertResult.entryId}`}>
                {revertResult.entryNumber ?? revertResult.entryId}
              </Link>{' '}
              posted.
            </div>
          )}
          {revertResult?.kind === 'err' && (
            <div
              role="alert"
              style={{
                marginTop: 8,
                padding: 8,
                borderRadius: 6,
                background: 'var(--bg-subtle)',
                color: 'var(--accent-danger, #C62828)',
                fontSize: 13,
              }}
            >
              ⚠️ {revertResult.message}
            </div>
          )}
        </Card>
      ) : null}

      {chain.invoice && (
        <Card title="Source invoice" icon="📄">
          <Field label="Number" value={chain.invoice.invoiceNumber} mono />
          <Field label="Contact" value={chain.invoice.contactName} />
          <Field
            label="Date"
            value={chain.invoice.date ? formatDate(chain.invoice.date, dateFormat) : undefined}
          />
          <Field
            label="Total"
            value={
              chain.invoice.total !== undefined
                ? `${formatMoney(chain.invoice.total, numberFormat)} ${chain.invoice.currency ?? ''}`.trim()
                : undefined
            }
          />
          <Field label="Type" value={chain.invoice.type} />
          {chain.invoice.id && (
            <div style={{ marginTop: 8 }}>
              <Link to={`/invoices`} style={{ fontSize: 12 }}>
                Open invoices →
              </Link>
            </div>
          )}
        </Card>
      )}

      {chain.payment && (
        <Card title="Source payment" icon="💰">
          <Field
            label="Date"
            value={chain.payment.date ? formatDate(chain.payment.date, dateFormat) : undefined}
          />
          <Field
            label="Amount"
            value={
              chain.payment.amount !== undefined
                ? `${formatMoney(chain.payment.amount, numberFormat)} ${chain.payment.currency ?? ''}`.trim()
                : undefined
            }
          />
          <Field label="Description" value={chain.payment.description} />
          <div style={{ marginTop: 8 }}>
            <Link to={`/bank`} style={{ fontSize: 12 }}>
              Open bank →
            </Link>
          </div>
        </Card>
      )}

      {chain.rule && (
        <Card title="Posting rule" icon="🤖">
          <Field label="Name" value={chain.rule.name} />
          <Field label="Rule ID" value={chain.rule.id} mono />
          <Field label="Version" value={chain.rule.version} />
          <Field label="Country" value={chain.rule.country} />
          <Field label="Document type" value={chain.rule.documentType} />
          <Field label="Source" value={chain.rule.source} />
          {chain.rule.legalBasis && chain.rule.legalBasis.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Legal basis</div>
              <ul style={{ margin: '4px 0', paddingLeft: 18, fontSize: 13 }}>
                {chain.rule.legalBasis.map((basis, i) => (
                  <li key={i}>{basis}</li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

export default Audit;
