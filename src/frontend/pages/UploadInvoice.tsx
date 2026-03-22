import React, { useState, useCallback } from "react";
import { useApp } from "../utils/context";

const TOKEN = "dev-bypass";

export function UploadInvoice() {
  const { companyId } = useApp();
  const [dragging, setDragging] = useState(false);
  const [status, setStatus] = useState<"idle" | "processing" | "done" | "error">("idle");
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<string | null>(null);

  const processFile = useCallback(async (file: File) => {
    if (!companyId) { setError("No company selected"); return; }
    if (!file.type.startsWith("image/") && file.type !== "application/pdf") {
      setError("Please upload an image (JPG, PNG) or PDF file");
      return;
    }

    setStatus("processing");
    setError("");
    setResult(null);

    // Create preview for images
    if (file.type.startsWith("image/")) {
      const url = URL.createObjectURL(file);
      setPreview(url);
    } else {
      setPreview(null);
    }

    // Convert to base64
    const buffer = await file.arrayBuffer();
    const base64 = btoa(
      new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), "")
    );

    try {
      const res = await fetch(`/api/companies/${companyId}/invoices/upload`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${TOKEN}`,
        },
        body: JSON.stringify({ image: base64, mimeType: file.type }),
      });
      const json = await res.json();

      if (json.error) {
        setError(json.error.message);
        setStatus("error");
      } else {
        setResult(json.data);
        setStatus("done");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
      setStatus("error");
    }
  }, [companyId]);

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  }

  if (!companyId) return (
    <div className="empty-state">
      <div className="icon">🏢</div>
      <h3>No company selected</h3>
    </div>
  );

  return (
    <div>
      <h2 className="page-title">Upload invoice</h2>

      <div
        className={`drop-zone ${dragging ? "active" : ""} ${status === "processing" ? "processing" : ""}`}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => document.getElementById("file-input")?.click()}
      >
        <input
          id="file-input"
          type="file"
          accept="image/*,application/pdf"
          onChange={handleFileInput}
          style={{ display: "none" }}
        />
        {status === "processing" ? (
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

      {error && <p style={{ color: "#FF3B30", fontSize: 13, marginTop: 12 }}>{error}</p>}

      {status === "done" && result && (
        <div className="upload-result">
          <div className="upload-success">
            <span className="success-icon">✅</span>
            <span>{result.message}</span>
          </div>

          <div style={{ display: "flex", gap: 20, marginTop: 20 }}>
            {preview && (
              <div className="invoice-preview">
                <img src={preview} alt="Invoice" />
              </div>
            )}

            <div className="recognized-data" style={{ flex: 1 }}>
              <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: "#1C1C1C" }}>Extracted data</h3>
              <div className="onboarding-details">
                <div className="detail-row"><span className="detail-label">Vendor</span><span><strong>{result.recognized.vendorName}</strong></span></div>
                {result.recognized.vendorRegistrationNumber && (
                  <div className="detail-row"><span className="detail-label">Reg. number</span><span className="mono">{result.recognized.vendorRegistrationNumber}</span></div>
                )}
                {result.recognized.vendorVatNumber && (
                  <div className="detail-row"><span className="detail-label">VAT number</span><span className="mono">{result.recognized.vendorVatNumber}</span></div>
                )}
                <div className="detail-row"><span className="detail-label">Invoice #</span><span className="mono">{result.recognized.invoiceNumber}</span></div>
                <div className="detail-row"><span className="detail-label">Date</span><span>{result.recognized.invoiceDate}</span></div>
                <div className="detail-row"><span className="detail-label">Subtotal</span><span>€{result.recognized.subtotal?.toFixed(2)}</span></div>
                <div className="detail-row"><span className="detail-label">VAT</span><span>€{result.recognized.vatAmount?.toFixed(2)}</span></div>
                <div className="detail-row" style={{ fontWeight: 600 }}><span className="detail-label">Total</span><span>€{result.recognized.total?.toFixed(2)}</span></div>
                <div className="detail-row"><span className="detail-label">Confidence</span>
                  <span className={`badge badge-${result.recognized.confidence === "high" ? "paid" : result.recognized.confidence === "medium" ? "posted" : "overdue"}`}>
                    {result.recognized.confidence}
                  </span>
                </div>
              </div>

              {result.recognized.lines?.length > 0 && (
                <>
                  <h3 style={{ fontSize: 14, fontWeight: 600, marginTop: 16, marginBottom: 8, color: "#1C1C1C" }}>Lines</h3>
                  <table className="data-table">
                    <thead><tr><th>Description</th><th>Qty</th><th>Price</th><th>VAT</th><th>Total</th></tr></thead>
                    <tbody>
                      {result.recognized.lines.map((l: any, i: number) => (
                        <tr key={i}>
                          <td>{l.description}</td>
                          <td className="num">{l.quantity}</td>
                          <td className="num">€{l.unitPrice?.toFixed(2)}</td>
                          <td>{l.vatRate}%</td>
                          <td className="num">€{l.lineTotal?.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}

              <div style={{ marginTop: 16 }}>
                <span className="badge badge-paid">Posted to ledger</span>
                <span style={{ marginLeft: 8, fontSize: 13, color: "#787878" }}>Invoice {result.invoice?.invoiceNumber}</span>
              </div>
            </div>
          </div>

          <button className="btn-secondary" style={{ marginTop: 20 }} onClick={() => { setStatus("idle"); setResult(null); setPreview(null); }}>
            Upload another invoice
          </button>
        </div>
      )}
    </div>
  );
}
