import React, { useState, useCallback } from "react";
import { useApp } from "../utils/context";

const TOKEN = "dev-bypass";

// Convert PDF first page to PNG using canvas (no external dependencies)
async function pdfToImage(file: File): Promise<{ base64: string; dataUrl: string }> {
  // Use the browser's built-in PDF rendering via an iframe/embed workaround
  // For a reliable approach, we render to canvas using a simple PDF.js-free method
  // by creating an object URL and drawing via an image element from a screenshot
  // Actually, the most reliable way without pdf.js is to ask the user to screenshot,
  // but let's try the canvas approach with pdf.js from CDN
  const pdfjsLib = await loadPdfJs();
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const page = await pdf.getPage(1);
  const scale = 2; // High resolution
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

// Lazy-load pdf.js from CDN
let pdfJsPromise: Promise<any> | null = null;
function loadPdfJs(): Promise<any> {
  if (pdfJsPromise) return pdfJsPromise;
  pdfJsPromise = new Promise((resolve, reject) => {
    if ((window as any).pdfjsLib) { resolve((window as any).pdfjsLib); return; }
    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.9.155/pdf.min.mjs";
    script.type = "module";
    // Use the classic script approach instead
    const scriptClassic = document.createElement("script");
    scriptClassic.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
    scriptClassic.onload = () => {
      const lib = (window as any).pdfjsLib;
      if (lib) {
        lib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
        resolve(lib);
      } else {
        reject(new Error("pdf.js failed to load"));
      }
    };
    scriptClassic.onerror = () => reject(new Error("Failed to load pdf.js"));
    document.head.appendChild(scriptClassic);
  });
  return pdfJsPromise;
}

export function UploadInvoice() {
  const { companyId } = useApp();
  const [dragging, setDragging] = useState(false);
  const [status, setStatus] = useState<"idle" | "processing" | "done" | "error">("idle");
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<string | null>(null);

  const processFile = useCallback(async (file: File) => {
    if (!companyId) { setError("No company selected"); return; }

    const supportedImages = ["image/jpeg", "image/png", "image/gif", "image/webp"];
    const isPdf = file.type === "application/pdf";

    if (!supportedImages.includes(file.type) && !isPdf) {
      setError("Please upload an image (JPG, PNG, WebP) or PDF file");
      return;
    }

    setStatus("processing");
    setError("");
    setResult(null);

    let base64: string;
    let mimeType: string;

    if (isPdf) {
      // For PDFs: convert first page to PNG using canvas
      try {
        const pdfData = await pdfToImage(file);
        base64 = pdfData.base64;
        mimeType = "image/png";
        setPreview(pdfData.dataUrl);
      } catch {
        setError("Could not render PDF. Try uploading a screenshot or photo of the invoice instead.");
        setStatus("error");
        return;
      }
    } else {
      // For images: use directly
      const buffer = await file.arrayBuffer();
      base64 = btoa(
        new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), "")
      );
      mimeType = file.type;
      setPreview(URL.createObjectURL(file));
    }

    try {
      const res = await fetch(`/api/companies/${companyId}/invoices/upload`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${TOKEN}`,
        },
        body: JSON.stringify({ image: base64, mimeType }),
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
