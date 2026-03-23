import React, { useEffect, useMemo, useState, useRef, useCallback } from "react";
import { useLocation } from "react-router-dom";
import { api } from "../utils/api";
import { useApp } from "../utils/context";
import { formatMoney } from "../utils/format";
import { GlPostings } from "../components/GlPostings";
import { AiInput } from "../components/AiInput";

type SortKey = "invoiceNumber" | "vendorInvoiceNumber" | "type" | "contactName" | "date" | "subtotal" | "vatAmount" | "total" | "status";
type SortDir = "asc" | "desc";

const TOKEN = "dev-bypass";

// ─── PDF rendering helpers (from UploadInvoice) ─────────────

async function pdfToImage(file: File): Promise<{ base64: string; dataUrl: string }> {
  const pdfjsLib = await loadPdfJs();
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const page = await pdf.getPage(1);
  const scale = 2;
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext("2d")!;
  await page.render({ canvasContext: ctx, viewport }).promise;
  const dataUrl = canvas.toDataURL("image/png");
  const base64 = dataUrl.split(",")[1];
  return { base64, dataUrl };
}

let pdfJsPromise: Promise<any> | null = null;
function loadPdfJs(): Promise<any> {
  if (pdfJsPromise) return pdfJsPromise;
  pdfJsPromise = new Promise((resolve, reject) => {
    if ((window as any).pdfjsLib) { resolve((window as any).pdfjsLib); return; }
    const scriptClassic = document.createElement("script");
    scriptClassic.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
    scriptClassic.onload = () => {
      const lib = (window as any).pdfjsLib;
      if (lib) {
        lib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
        resolve(lib);
      } else { reject(new Error("pdf.js failed to load")); }
    };
    scriptClassic.onerror = () => reject(new Error("Failed to load pdf.js"));
    document.head.appendChild(scriptClassic);
  });
  return pdfJsPromise;
}

// ─── Label style ────────────────────────────────────────────

const labelStyle: React.CSSProperties = {
  display: "block", fontSize: 11, fontWeight: 500, color: "var(--text-tertiary)",
  textTransform: "uppercase", letterSpacing: "0.02em", marginBottom: 4,
};

export function Invoices() {
  const { companyId, numberFormat: fmt } = useApp();
  const location = useLocation();
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<any>(null);
  const [postings, setPostings] = useState<any[]>([]);
  const [loadingPostings, setLoadingPostings] = useState(false);
  const [filter, setFilter] = useState<"" | "sales" | "purchase">("");
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [statusFilter, setStatusFilter] = useState<string>("");

  // Action panels
  const [activePanel, setActivePanel] = useState<"" | "create" | "upload" | "pay">("");

  // Create invoice state
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [parsedInvoice, setParsedInvoice] = useState<any>(null);
  const [creating, setCreating] = useState(false);
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<any>(null);

  // Upload invoice state
  const [dragging, setDragging] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<"idle" | "processing" | "done" | "error">("idle");
  const [uploadResult, setUploadResult] = useState<any>(null);
  const [uploadError, setUploadError] = useState("");
  const [_uploadPreview, setUploadPreview] = useState<string | null>(null);

  // Pay invoice state
  const [payInvoice, setPayInvoice] = useState<any>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payDate, setPayDate] = useState(new Date().toISOString().slice(0, 10));
  const [payReference, setPayReference] = useState("");
  const [paying, setPaying] = useState(false);

  useEffect(() => {
    if (!companyId) { setLoading(false); return; }
    loadInvoices();
  }, [companyId, filter]);

  // Auto-select invoice when navigated from Dashboard
  useEffect(() => {
    const navState = location.state as { selectedInvoiceId?: string } | null;
    if (navState?.selectedInvoiceId && companyId && invoices.length > 0) {
      const inv = invoices.find((i: any) => i.id === navState.selectedInvoiceId);
      if (inv && selected?.id !== inv.id) handleSelect(inv);
    }
  }, [location.state, invoices]);

  function loadInvoices() {
    setLoading(true);
    api.invoices(companyId, filter || undefined).then((data: any) => { setInvoices(data); setLoading(false); }).catch(() => setLoading(false));
  }

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir(key === "date" ? "desc" : "asc");
    }
  }

  const filteredInvoices = useMemo(() => {
    const q = search.toLowerCase().trim();
    let list = invoices;

    if (q) {
      list = list.filter(inv =>
        inv.invoiceNumber?.toLowerCase().includes(q) ||
        inv.vendorInvoiceNumber?.toLowerCase().includes(q) ||
        inv.contactName?.toLowerCase().includes(q)
      );
    }

    if (statusFilter) {
      list = list.filter(inv => inv.status === statusFilter);
    }

    list = [...list].sort((a, b) => {
      let av = a[sortKey] ?? "";
      let bv = b[sortKey] ?? "";
      if (typeof av === "number" && typeof bv === "number") {
        return sortDir === "asc" ? av - bv : bv - av;
      }
      av = String(av).toLowerCase();
      bv = String(bv).toLowerCase();
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });

    return list;
  }, [invoices, search, statusFilter, sortKey, sortDir]);

  async function handleSelect(inv: any) {
    setSelected(inv);
    setLoadingPostings(true);
    try {
      const p = await api.invoicePostings(companyId, inv.id);
      setPostings(p as any[]);
    } catch { setPostings([]); }
    setLoadingPostings(false);
  }

  async function handlePost(inv: any) {
    try {
      await api.postInvoice(companyId, inv.id);
      loadInvoices();
      if (selected?.id === inv.id) handleSelect(inv);
    } catch (e: any) { console.error(e.message); }
  }

  async function handleCancel(inv: any) {
    if (!confirm(`Cancel invoice ${inv.invoiceNumber}? This will reverse the GL entries.`)) return;
    try {
      await api.cancelInvoice(companyId, inv.id, "Cancelled by user");
      loadInvoices();
      setSelected(null);
    } catch (e: any) { console.error(e.message); }
  }

  // Credit note state
  const [creditNoteInv, setCreditNoteInv] = useState<any>(null);
  const [creditReason, setCreditReason] = useState("");
  const [creditCorrect, setCreditCorrect] = useState(false);
  const [creditProcessing, setCreditProcessing] = useState(false);

  async function handleCreditNote(inv: any) {
    setCreditNoteInv(inv);
    setCreditReason("");
    setCreditCorrect(false);
  }

  async function submitCreditNote() {
    if (!creditNoteInv || !creditReason.trim()) return;
    setCreditProcessing(true);
    try {
      await api.createCreditNote(companyId, creditNoteInv.id, creditReason);

      // If "create corrected invoice" is checked, create a new invoice with AI from the reason
      if (creditCorrect) {
        try {
          const fields = await api.parseInvoiceDescription(companyId,
            `Corrected invoice for ${creditNoteInv.contactName}, originally ${creditNoteInv.invoiceNumber}. ${creditReason}`
          ) as any;
          if (fields?.lines?.length > 0) {
            const contactId = creditNoteInv.contactId || "";
            const corrected = await api.createInvoice(companyId, {
              type: creditNoteInv.type,
              contactId,
              contactName: fields.contactName || creditNoteInv.contactName,
              date: new Date().toISOString().slice(0, 10),
              dueDate: fields.dueDate,
              lines: fields.lines,
            }) as any;
            try { await api.postInvoice(companyId, corrected.id); } catch { /* ok */ }
          }
        } catch { /* corrected invoice creation is best-effort */ }
      }

      loadInvoices();
      setSelected(null);
      setCreditNoteInv(null);
    } catch (e: any) { alert(e.message); }
    finally { setCreditProcessing(false); }
  }

  // ─── Toggle panel ─────────────────────────────────────────

  function togglePanel(panel: "create" | "upload" | "pay") {
    setActivePanel(prev => prev === panel ? "" : panel);
    // Reset states when closing
    if (activePanel === panel) return;
    setParsedInvoice(null);
    setAiPrompt("");
    setUploadStatus("idle");
    setUploadResult(null);
    setUploadError("");
    setUploadPreview(null);
    setPayInvoice(null);
  }

  // ─── Create invoice via AI ────────────────────────────────

  async function handleAiDescribe(text?: string) {
    const desc = text || aiPrompt;
    if (!desc.trim() || !companyId) return;
    setAiLoading(true);
    try {
      const fields = await api.parseInvoiceDescription(companyId, desc) as any;
      setParsedInvoice(fields);
    } catch (err: any) {
      alert(err.message || "Failed to parse description");
    } finally {
      setAiLoading(false);
    }
  }

  function toggleVoice() {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Speech recognition is not supported in this browser. Please use Chrome or Edge.");
      return;
    }
    if (listening && recognitionRef.current) {
      recognitionRef.current.stop();
      setListening(false);
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setAiPrompt(transcript);
      setListening(false);
      handleAiDescribe(transcript);
    };
    recognition.onerror = () => setListening(false);
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  }

  async function handleCreateInvoice() {
    if (!parsedInvoice || !companyId) return;
    setCreating(true);
    try {
      // Search for existing contact first to avoid duplicates
      let contactId = "";
      if (parsedInvoice.contactName) {
        try {
          const existing = await api.findContact(companyId, parsedInvoice.contactName) as any;
          if (existing) {
            contactId = existing.id;
          } else {
            const contact = await api.createContact(companyId, {
              type: parsedInvoice.type === "sales" ? "customer" : "vendor",
              name: parsedInvoice.contactName,
              address: { line1: "", city: "", postalCode: "", country: "LV" },
            }) as any;
            contactId = contact.id;
          }
        } catch { /* proceed without contact id */ }
      }
      const invoice = await api.createInvoice(companyId, {
        type: parsedInvoice.type,
        contactId,
        contactName: parsedInvoice.contactName,
        date: parsedInvoice.date,
        dueDate: parsedInvoice.dueDate,
        lines: parsedInvoice.lines,
      }) as any;
      // Auto-post
      try { await api.postInvoice(companyId, invoice.id); } catch { /* draft is fine */ }
      setActivePanel("");
      setParsedInvoice(null);
      setAiPrompt("");
      loadInvoices();
    } catch (err: any) {
      alert(err.message || "Failed to create invoice");
    } finally {
      setCreating(false);
    }
  }

  // ─── Upload invoice ───────────────────────────────────────

  const processFile = useCallback(async (file: File) => {
    if (!companyId) { setUploadError("No company selected"); return; }
    const supportedImages = ["image/jpeg", "image/png", "image/gif", "image/webp"];
    const isPdf = file.type === "application/pdf";
    if (!supportedImages.includes(file.type) && !isPdf) {
      setUploadError("Please upload an image (JPG, PNG, WebP) or PDF file");
      return;
    }
    setUploadStatus("processing");
    setUploadError("");
    setUploadResult(null);
    let base64: string;
    let mimeType: string;
    if (isPdf) {
      try {
        const pdfData = await pdfToImage(file);
        base64 = pdfData.base64;
        mimeType = "image/png";
        setUploadPreview(pdfData.dataUrl);
      } catch {
        setUploadError("Could not render PDF. Try uploading a photo of the invoice instead.");
        setUploadStatus("error");
        return;
      }
    } else {
      const buffer = await file.arrayBuffer();
      base64 = btoa(new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), ""));
      mimeType = file.type;
      setUploadPreview(URL.createObjectURL(file));
    }
    try {
      const res = await fetch(`/api/companies/${companyId}/invoices/upload`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN}` },
        body: JSON.stringify({ image: base64, mimeType }),
      });
      const json = await res.json();
      if (json.error) { setUploadError(json.error.message); setUploadStatus("error"); }
      else { setUploadResult(json.data); setUploadStatus("done"); loadInvoices(); }
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed");
      setUploadStatus("error");
    }
  }, [companyId]);

  // ─── Pay invoice ──────────────────────────────────────────

  function startPay(inv: any) {
    setPayInvoice(inv);
    setPayAmount(String(Math.round(((inv.total || 0) - (inv.amountPaid || 0)) * 100) / 100));
    setPayDate(new Date().toISOString().slice(0, 10));
    setPayReference("");
    setActivePanel("pay");
  }

  async function handlePayInvoice() {
    if (!payInvoice || !companyId) return;
    const amount = parseFloat(payAmount);
    if (isNaN(amount) || amount <= 0) return;
    setPaying(true);
    try {
      await api.createPayment(companyId, {
        type: payInvoice.type === "sales" ? "incoming" : "outgoing",
        contactId: payInvoice.contactId,
        contactName: payInvoice.contactName,
        date: payDate,
        amount,
        bankAccountIban: "",
        reference: payReference || `Payment for ${payInvoice.invoiceNumber}`,
        invoiceAllocations: [{
          invoiceId: payInvoice.id,
          invoiceNumber: payInvoice.invoiceNumber,
          amount,
        }],
      });
      setActivePanel("");
      setPayInvoice(null);
      loadInvoices();
    } catch (err: any) {
      alert(err.message || "Failed to record payment");
    } finally {
      setPaying(false);
    }
  }

  if (!companyId) return <NoCompany />;

  // Detail view
  if (selected) {
    return (
      <div>
        <button className="btn-secondary" style={{ marginBottom: 16 }} onClick={() => setSelected(null)}>← Back to list</button>
        <h2 className="page-title">Invoice {selected.invoiceNumber}</h2>

        <div className="detail-layout">
          <div style={{ flex: 1 }}>
            <div className="settings-card">
              <div className="onboarding-details">
                <div className="detail-row"><span className="detail-label">ERA number</span><span className="mono">{selected.invoiceNumber}</span></div>
                {selected.vendorInvoiceNumber && (
                  <div className="detail-row"><span className="detail-label">Vendor invoice #</span><span className="mono">{selected.vendorInvoiceNumber}</span></div>
                )}
                <div className="detail-row"><span className="detail-label">Type</span><span className="badge">{selected.type}</span></div>
                <div className="detail-row"><span className="detail-label">Contact</span><span>{selected.contactName}</span></div>
                <div className="detail-row"><span className="detail-label">Date</span><span>{selected.date}</span></div>
                <div className="detail-row"><span className="detail-label">Due date</span><span>{selected.dueDate}</span></div>
                <div className="detail-row"><span className="detail-label">Subtotal</span><span>{formatMoney(selected.subtotal, fmt)}</span></div>
                <div className="detail-row"><span className="detail-label">VAT</span><span>{formatMoney(selected.vatAmount, fmt)}</span></div>
                <div className="detail-row" style={{ fontWeight: 600 }}><span className="detail-label">Total</span><span>{formatMoney(selected.total, fmt)}</span></div>
                <div className="detail-row"><span className="detail-label">Paid</span><span>{formatMoney(selected.amountPaid, fmt)}</span></div>
                <div className="detail-row"><span className="detail-label">Status</span><span className={`badge badge-${selected.status}`}>{selected.status}</span></div>
                {selected.recognitionConfidence && (
                  <div className="detail-row"><span className="detail-label">AI confidence</span><span className={`badge badge-${selected.recognitionConfidence === "high" ? "paid" : "posted"}`}>{selected.recognitionConfidence}</span></div>
                )}
              </div>

              <div className="btn-row" style={{ marginTop: 16 }}>
                {selected.status === "draft" && (
                  <button className="btn-primary" onClick={() => handlePost(selected)}>Post to ledger</button>
                )}
                {(selected.status === "posted" || selected.status === "overdue") && (
                  <button className="btn-primary" onClick={() => startPay(selected)}>Record payment</button>
                )}
                {selected.status !== "cancelled" && selected.status !== "draft" && (
                  <button className="btn-secondary" onClick={() => handleCreditNote(selected)}>Credit note</button>
                )}
                <a href={api.invoicePdfUrl(companyId, selected.id)} target="_blank" rel="noopener noreferrer" className="btn-secondary" style={{ display: "inline-flex", alignItems: "center", textDecoration: "none" }}>
                  PDF ↓
                </a>
                {selected.status !== "cancelled" && (
                  <button className="btn-secondary" style={{ color: "#FF3B30" }} onClick={() => handleCancel(selected)}>Cancel invoice</button>
                )}
              </div>
            </div>
          </div>

          <div style={{ flex: 1 }}>
            {selected.lines?.length > 0 && (
              <div className="settings-card">
                <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Line items</h3>
                <table className="data-table">
                  <thead><tr><th>Description</th><th>Qty</th><th>Price</th><th>VAT</th><th>Total</th></tr></thead>
                  <tbody>
                    {selected.lines.map((l: any, i: number) => (
                      <tr key={i}>
                        <td>{l.description}</td>
                        <td className="num">{l.quantity}</td>
                        <td className="num">{formatMoney(l.unitPrice, fmt)}</td>
                        <td>{l.vatRate}%</td>
                        <td className="num">{formatMoney(l.lineTotal, fmt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="settings-card" style={{ marginTop: 16 }}>
              <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>GL postings</h3>
              <GlPostings entries={postings} loading={loadingPostings} emptyMessage="No GL entries (invoice not yet posted)" formatMoney={formatMoney} fmt={fmt} />
            </div>

            {/* Pay invoice inline panel (from detail view) */}
            {activePanel === "pay" && payInvoice?.id === selected.id && (
              <div className="settings-card" style={{ marginTop: 16 }}>
                <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Record payment</h3>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
                  <div>
                    <label style={labelStyle}>Amount</label>
                    <input type="number" step="0.01" value={payAmount} onChange={e => setPayAmount(e.target.value)} className="form-input" style={{ width: "100%" }} aria-label="Payment amount" />
                  </div>
                  <div>
                    <label style={labelStyle}>Date</label>
                    <input type="date" value={payDate} onChange={e => setPayDate(e.target.value)} className="form-input" style={{ width: "100%" }} aria-label="Payment date" />
                  </div>
                  <div style={{ gridColumn: "span 2" }}>
                    <label style={labelStyle}>Reference</label>
                    <input type="text" value={payReference} onChange={e => setPayReference(e.target.value)} placeholder="Bank reference or note" className="form-input" style={{ width: "100%" }} aria-label="Payment reference" />
                  </div>
                </div>
                <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
                  <button className="btn-primary" onClick={handlePayInvoice} disabled={paying || !payAmount}>
                    {paying ? "Processing..." : "Record payment"}
                  </button>
                  <button className="btn-secondary" onClick={() => { setActivePanel(""); setPayInvoice(null); }}>Cancel</button>
                </div>
              </div>
            )}

            {/* Credit note dialog */}
            {creditNoteInv?.id === selected.id && (
              <div className="settings-card" style={{ marginTop: 16 }}>
                <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Credit note for {creditNoteInv.invoiceNumber}</h3>
                <div style={{ marginBottom: 12 }}>
                  <label style={labelStyle}>Reason for credit note</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. Price was incorrect, should be €100 instead of €120"
                    value={creditReason}
                    onChange={e => setCreditReason(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter" && creditReason.trim() && !creditProcessing) submitCreditNote(); }}
                    style={{ width: "100%", fontSize: 16 }}
                    aria-label="Reason for credit note"
                  />
                </div>
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "var(--text-sm)", marginBottom: 12 }}>
                  <input type="checkbox" checked={creditCorrect} onChange={e => setCreditCorrect(e.target.checked)} />
                  Also create a corrected invoice based on the description
                </label>
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="btn-primary" onClick={submitCreditNote} disabled={creditProcessing || !creditReason.trim()}>
                    {creditProcessing ? "Processing..." : creditCorrect ? "Issue credit note + corrected invoice" : "Issue credit note"}
                  </button>
                  <button className="btn-secondary" onClick={() => setCreditNoteInv(null)}>Cancel</button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header-bar">
        <h2 className="page-title" style={{ marginBottom: 0 }}>Invoices</h2>
        <div className="action-buttons" style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <button className={`btn-primary ${activePanel === "create" ? "active" : ""}`} onClick={() => togglePanel("create")}>
            {activePanel === "create" ? "Cancel" : "+ Create invoice"}
          </button>
          <button className={`btn-secondary ${activePanel === "upload" ? "active" : ""}`} onClick={() => togglePanel("upload")}>
            {activePanel === "upload" ? "Cancel" : "📄 Upload"}
          </button>
        </div>
      </div>

      {/* ─── Create Invoice Panel ─────────────────────────── */}
      {activePanel === "create" && (
        <div className="settings-card" style={{ marginBottom: 20 }}>
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Describe the invoice you want to create</label>
            <div style={{ display: "flex", gap: 8, alignItems: "stretch", flexWrap: "wrap" }}>
              <input
                type="text"
                value={aiPrompt}
                onChange={e => setAiPrompt(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") handleAiDescribe(); }}
                placeholder='e.g. "Sales invoice for SIA Klient, consulting 10h at €120/h"'
                className="form-input"
                style={{ flex: 1, minWidth: 0, fontSize: 16 }}
                aria-label="Describe invoice"
              />
              <button className="btn-primary" onClick={() => handleAiDescribe()} disabled={aiLoading || !aiPrompt.trim()} style={{ whiteSpace: "nowrap" }}>
                {aiLoading ? "Thinking..." : "✨ Generate"}
              </button>
              <button
                className={listening ? "btn-primary" : "btn-secondary"}
                onClick={toggleVoice}
                title={listening ? "Stop listening" : "Voice input"}
                aria-label={listening ? "Stop voice input" : "Start voice input"}
                style={{
                  width: 40, minWidth: 40, padding: 0,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 18,
                  ...(listening ? { animation: "pulse 1.5s ease-in-out infinite" } : {}),
                }}
              >
                🎙
              </button>
            </div>
            {listening && (
              <p style={{ fontSize: "var(--text-sm)", color: "var(--accent)", marginTop: 4, marginBottom: 0 }}>
                Listening... speak now
              </p>
            )}
          </div>

          {parsedInvoice && (
            <div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 12 }}>
                <div>
                  <label style={labelStyle}>Type</label>
                  <select
                    value={parsedInvoice.type}
                    onChange={e => setParsedInvoice((p: any) => ({ ...p, type: e.target.value }))}
                    className="table-filter-select"
                    aria-label="Invoice type"
                  >
                    <option value="sales">Sales</option>
                    <option value="purchase">Purchase</option>
                  </select>
                </div>
                <div style={{ gridColumn: "span 2" }}>
                  <label style={labelStyle}>Contact</label>
                  <input type="text" value={parsedInvoice.contactName} onChange={e => setParsedInvoice((p: any) => ({ ...p, contactName: e.target.value }))} className="form-input" style={{ width: "100%" }} aria-label="Contact name" />
                </div>
                <div>
                  <label style={labelStyle}>Date</label>
                  <input type="date" value={parsedInvoice.date} onChange={e => setParsedInvoice((p: any) => ({ ...p, date: e.target.value }))} className="form-input" style={{ width: "100%" }} aria-label="Invoice date" />
                </div>
                <div>
                  <label style={labelStyle}>Due date</label>
                  <input type="date" value={parsedInvoice.dueDate} onChange={e => setParsedInvoice((p: any) => ({ ...p, dueDate: e.target.value }))} className="form-input" style={{ width: "100%" }} aria-label="Due date" />
                </div>
              </div>

              {parsedInvoice.lines?.length > 0 && (
                <table className="data-table" style={{ marginBottom: 12 }}>
                  <thead><tr><th>Description</th><th>Qty</th><th>Unit price</th><th>VAT %</th><th>Account</th></tr></thead>
                  <tbody>
                    {parsedInvoice.lines.map((l: any, i: number) => (
                      <tr key={i}>
                        <td>
                          <input type="text" value={l.description} onChange={e => {
                            const lines = [...parsedInvoice.lines];
                            lines[i] = { ...lines[i], description: e.target.value };
                            setParsedInvoice((p: any) => ({ ...p, lines }));
                          }} className="form-input" style={{ width: "100%", minWidth: 120 }} aria-label={`Line ${i + 1} description`} />
                        </td>
                        <td>
                          <input type="number" value={l.quantity} onChange={e => {
                            const lines = [...parsedInvoice.lines];
                            lines[i] = { ...lines[i], quantity: Number(e.target.value) };
                            setParsedInvoice((p: any) => ({ ...p, lines }));
                          }} className="form-input" style={{ width: 70 }} aria-label={`Line ${i + 1} quantity`} />
                        </td>
                        <td>
                          <input type="number" step="0.01" value={l.unitPrice} onChange={e => {
                            const lines = [...parsedInvoice.lines];
                            lines[i] = { ...lines[i], unitPrice: Number(e.target.value) };
                            setParsedInvoice((p: any) => ({ ...p, lines }));
                          }} className="form-input" style={{ width: 100 }} aria-label={`Line ${i + 1} unit price`} />
                        </td>
                        <td>
                          <input type="number" value={l.vatRate} onChange={e => {
                            const lines = [...parsedInvoice.lines];
                            lines[i] = { ...lines[i], vatRate: Number(e.target.value) };
                            setParsedInvoice((p: any) => ({ ...p, lines }));
                          }} className="form-input" style={{ width: 60 }} aria-label={`Line ${i + 1} VAT rate`} />
                        </td>
                        <td className="mono" style={{ fontSize: "var(--text-sm)" }}>{l.accountCode}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn-primary" onClick={handleCreateInvoice} disabled={creating || !parsedInvoice.contactName}>
                  {creating ? "Creating..." : "Create & post invoice"}
                </button>
                <button className="btn-secondary" onClick={() => setParsedInvoice(null)}>Reset</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── Upload Invoice Panel ─────────────────────────── */}
      {activePanel === "upload" && (
        <div className="settings-card" style={{ marginBottom: 20 }}>
          <div
            className={`drop-zone ${dragging ? "active" : ""} ${uploadStatus === "processing" ? "processing" : ""}`}
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={e => { e.preventDefault(); setDragging(false); const file = e.dataTransfer.files[0]; if (file) processFile(file); }}
            onClick={() => document.getElementById("invoice-file-input")?.click()}
          >
            <input id="invoice-file-input" type="file" accept="image/*,application/pdf" onChange={e => { const file = e.target.files?.[0]; if (file) processFile(file); }} style={{ display: "none" }} />
            {uploadStatus === "processing" ? (
              <div className="drop-zone-content">
                <div className="drop-zone-icon">⏳</div>
                <div className="drop-zone-title">Recognizing invoice...</div>
                <div className="drop-zone-subtitle">GPT-4o is extracting data from your document</div>
              </div>
            ) : (
              <div className="drop-zone-content">
                <div className="drop-zone-icon">📄</div>
                <div className="drop-zone-title">Drop invoice here or click to upload</div>
                <div className="drop-zone-subtitle">Supports JPG, PNG, or PDF</div>
              </div>
            )}
          </div>
          {uploadError && <p style={{ color: "#FF3B30", fontSize: 13, marginTop: 12 }}>{uploadError}</p>}
          {uploadStatus === "done" && uploadResult && (
            <div style={{ marginTop: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--success)", fontSize: 13, marginBottom: 12 }}>
                <span>✅</span> {uploadResult.message}
                {uploadResult.invoice?.invoiceNumber && (
                  <span className="mono" style={{ color: "var(--text-secondary)" }}>— {uploadResult.invoice.invoiceNumber}</span>
                )}
              </div>
              <button className="btn-secondary" onClick={() => { setUploadStatus("idle"); setUploadResult(null); setUploadPreview(null); }}>
                Upload another
              </button>
            </div>
          )}
        </div>
      )}

      {/* ─── Type Filter ─────────────────────────────────── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div className="coa-level-controls">
          <button className={`coa-level-btn ${!filter ? "active" : ""}`} onClick={() => setFilter("")}>All</button>
          <button className={`coa-level-btn ${filter === "purchase" ? "active" : ""}`} onClick={() => setFilter("purchase")}>Purchase</button>
          <button className={`coa-level-btn ${filter === "sales" ? "active" : ""}`} onClick={() => setFilter("sales")}>Sales</button>
        </div>
      </div>

      <div className="filter-bar">
        <input
          type="text"
          placeholder="Search invoices..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="table-search-input"
          aria-label="Search invoices"
        />
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="table-filter-select"
          aria-label="Filter by status"
        >
          <option value="">All statuses</option>
          <option value="draft">Draft</option>
          <option value="posted">Posted</option>
          <option value="paid">Paid</option>
          <option value="overdue">Overdue</option>
          <option value="cancelled">Cancelled</option>
        </select>
        {(search || statusFilter) && (
          <span style={{ fontSize: "var(--text-sm)", color: "var(--text-tertiary)" }}>
            {filteredInvoices.length} result{filteredInvoices.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {loading ? <p style={{ color: "#A0A0A0" }}>Loading...</p> : filteredInvoices.length === 0 ? (
        invoices.length === 0 ? (
          <div className="empty-state">
            <div className="icon">📄</div>
            <h3>No invoices yet</h3>
            <p>Create an invoice, upload a document, or use the agent chat.</p>
          </div>
        ) : (
          <div className="empty-state">
            <div className="icon">🔍</div>
            <h3>No matching invoices</h3>
            <p>Try adjusting your search or filters.</p>
          </div>
        )
      ) : (
        <>
        {/* Desktop table */}
        <table className="data-table desktop-only-table">
          <thead>
            <tr>
              {([
                ["invoiceNumber", "Number"],
                ["type", "Type"],
                ["contactName", "Contact"],
                ["date", "Date"],
                ["total", "Total"],
                ["status", "Status"],
              ] as [SortKey, string][]).map(([key, label]) => (
                <th
                  key={key}
                  className={`sortable-th ${sortKey === key ? "sorted" : ""}`}
                  onClick={() => handleSort(key)}
                  aria-sort={sortKey === key ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
                >
                  {label}
                  {sortKey === key && (
                    <span className="sort-indicator">{sortDir === "asc" ? " ↑" : " ↓"}</span>
                  )}
                </th>
              ))}
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filteredInvoices.map((inv: any) => (
              <tr key={inv.id} onClick={() => handleSelect(inv)} style={{ cursor: "pointer" }}>
                <td className="mono">{inv.invoiceNumber}</td>
                <td><span className="badge">{inv.type}</span></td>
                <td>{inv.contactName}</td>
                <td>{inv.date}</td>
                <td className="num" style={{ fontWeight: 500 }}>{formatMoney(inv.total, fmt)}</td>
                <td><span className={`badge badge-${inv.status}`}>{inv.status}</span></td>
                <td>
                  {(inv.status === "posted" || inv.status === "overdue") && (
                    <button className="btn-secondary" style={{ fontSize: 11, padding: "2px 8px" }} onClick={e => { e.stopPropagation(); startPay(inv); }} aria-label={`Pay ${inv.invoiceNumber}`}>
                      Pay
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Mobile card view */}
        <div className="mobile-card-list">
          {filteredInvoices.map((inv: any) => (
            <div key={inv.id} className="mobile-card" onClick={() => handleSelect(inv)}>
              <div className="mobile-card-header">
                <span className="mobile-card-title">{inv.contactName || inv.invoiceNumber}</span>
                <span className="mobile-card-amount">{formatMoney(inv.total, fmt)}</span>
              </div>
              <div className="mobile-card-meta">
                <span className="mono">{inv.invoiceNumber}</span>
                <span className="badge">{inv.type}</span>
                <span>{inv.date}</span>
                <span className={`badge badge-${inv.status}`}>{inv.status}</span>
              </div>
            </div>
          ))}
        </div>
        </>
      )}
    </div>
  );
}

function NoCompany() {
  return (
    <div className="empty-state">
      <div className="icon">🏢</div>
      <h3>No company selected</h3>
      <p>Use the agent chat to create a company first.</p>
    </div>
  );
}
