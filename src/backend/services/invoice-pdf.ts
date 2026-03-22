// Invoice PDF generation — Latvian-compliant invoice layout
// Uses PDFKit to generate server-side PDF

import PDFDocument from "pdfkit";
import { containers } from "./cosmos.js";
import { GLError } from "./ledger.js";
import type { Invoice, Company } from "@shared/types";

export async function generateInvoicePdf(
  companyId: string,
  invoiceId: string
): Promise<Buffer> {
  const [{ resource: invoice }, { resource: company }] = await Promise.all([
    containers.documents().item(invoiceId, companyId).read<Invoice>(),
    containers.companies().item(companyId, companyId).read<Company>(),
  ]);

  if (!invoice) throw new GLError("NOT_FOUND", "Invoice not found");
  if (!company) throw new GLError("COMPANY_NOT_FOUND", "Company not found");

  // Get contact details
  let contactAddress = "";
  let contactRegNumber = "";
  let contactVatNumber = "";
  try {
    const { resource: contact } = await containers.contacts()
      .item(invoice.contactId, companyId).read<any>();
    if (contact) {
      contactAddress = [contact.address?.line1, contact.address?.city, contact.address?.postalCode].filter(Boolean).join(", ");
      contactRegNumber = contact.registrationNumber || "";
      contactVatNumber = contact.vatNumber || "";
    }
  } catch { /* contact may not exist */ }

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const chunks: Buffer[] = [];

    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const isSales = invoice.type === "sales";
    const pageWidth = 595.28 - 100; // A4 width minus margins

    // ─── Header ─────────────────────────────────────────
    doc.fontSize(20).font("Helvetica-Bold").text(company.name, { align: "left" });
    doc.fontSize(9).font("Helvetica").fillColor("#666666");
    doc.text(`Reg. Nr. ${company.registrationNumber}`);
    if (company.vatNumber) doc.text(`PVN Nr. ${company.vatNumber}`);
    const addr = company.legalAddress;
    doc.text([addr.line1, addr.city, addr.postalCode, addr.country].filter(Boolean).join(", "));
    if (company.bankAccounts?.[0]) {
      doc.text(`IBAN: ${company.bankAccounts[0].iban}  SWIFT: ${company.bankAccounts[0].swift}`);
    }

    doc.moveDown(1.5);

    // ─── Invoice Title ──────────────────────────────────
    const title = (invoice as any).creditNoteFor
      ? `CREDIT NOTE / KREDĪTNOTA`
      : isSales ? "INVOICE / RĒĶINS" : "PURCHASE INVOICE";
    doc.fontSize(16).font("Helvetica-Bold").fillColor("#1C1C1C").text(title);
    doc.moveDown(0.5);

    // ─── Invoice Meta ───────────────────────────────────
    doc.fontSize(10).font("Helvetica").fillColor("#333333");
    const metaY = doc.y;
    doc.text(`Nr: ${invoice.invoiceNumber}`, 50, metaY);
    doc.text(`Date: ${invoice.date}`, 50, metaY + 14);
    doc.text(`Due date: ${invoice.dueDate}`, 50, metaY + 28);

    const recipientLabel = isSales ? "Bill to:" : "From:";
    doc.font("Helvetica-Bold").text(recipientLabel, 300, metaY);
    doc.font("Helvetica").text(invoice.contactName, 300, metaY + 14);
    if (contactRegNumber) doc.text(`Reg. Nr. ${contactRegNumber}`, 300, metaY + 28);
    if (contactVatNumber) doc.text(`PVN Nr. ${contactVatNumber}`, 300, metaY + 42);
    if (contactAddress) doc.text(contactAddress, 300, metaY + 56);

    doc.y = Math.max(doc.y, metaY + 76);
    doc.moveDown(1);

    // ─── Line Items Table ───────────────────────────────
    const tableTop = doc.y;
    const col = { desc: 50, qty: 300, price: 350, vat: 420, total: 470 };

    // Header row
    doc.fontSize(8).font("Helvetica-Bold").fillColor("#888888");
    doc.text("DESCRIPTION", col.desc, tableTop);
    doc.text("QTY", col.qty, tableTop, { width: 40, align: "right" });
    doc.text("PRICE", col.price, tableTop, { width: 60, align: "right" });
    doc.text("VAT %", col.vat, tableTop, { width: 40, align: "right" });
    doc.text("TOTAL", col.total, tableTop, { width: 75, align: "right" });

    doc.moveTo(50, tableTop + 14).lineTo(50 + pageWidth, tableTop + 14).strokeColor("#E0E0E0").stroke();

    let y = tableTop + 22;
    doc.fontSize(9).font("Helvetica").fillColor("#333333");

    for (const line of invoice.lines) {
      if (y > 720) {
        doc.addPage();
        y = 50;
      }
      doc.text(line.description, col.desc, y, { width: 240 });
      doc.text(String(line.quantity), col.qty, y, { width: 40, align: "right" });
      doc.text(`€${line.unitPrice.toFixed(2)}`, col.price, y, { width: 60, align: "right" });
      doc.text(`${line.vatRate}%`, col.vat, y, { width: 40, align: "right" });
      doc.text(`€${line.lineTotal.toFixed(2)}`, col.total, y, { width: 75, align: "right" });
      y += 18;
    }

    // ─── Totals ─────────────────────────────────────────
    y += 8;
    doc.moveTo(350, y).lineTo(50 + pageWidth, y).strokeColor("#E0E0E0").stroke();
    y += 10;

    const subtotal = Math.abs(invoice.subtotal);
    const vatAmount = Math.abs(invoice.vatAmount);
    const total = Math.abs(invoice.total);
    const sign = invoice.total < 0 ? "-" : "";

    doc.fontSize(9).font("Helvetica");
    doc.text("Subtotal:", 350, y, { width: 100, align: "right" });
    doc.text(`${sign}€${subtotal.toFixed(2)}`, col.total, y, { width: 75, align: "right" });
    y += 16;

    doc.text(`VAT:`, 350, y, { width: 100, align: "right" });
    doc.text(`${sign}€${vatAmount.toFixed(2)}`, col.total, y, { width: 75, align: "right" });
    y += 16;

    doc.moveTo(350, y).lineTo(50 + pageWidth, y).strokeColor("#1C1C1C").lineWidth(1).stroke();
    y += 8;

    doc.fontSize(12).font("Helvetica-Bold");
    doc.text("Total:", 350, y, { width: 100, align: "right" });
    doc.text(`${sign}€${total.toFixed(2)}`, col.total, y, { width: 75, align: "right" });

    // ─── Footer ─────────────────────────────────────────
    if ((invoice as any).creditNoteFor) {
      doc.moveDown(2);
      doc.fontSize(9).font("Helvetica").fillColor("#666666");
      doc.text(`Credit note for invoice: ${(invoice as any).creditNoteFor}`);
      if ((invoice as any).creditNoteReason) {
        doc.text(`Reason: ${(invoice as any).creditNoteReason}`);
      }
    }

    // Payment info for sales invoices
    if (isSales && company.bankAccounts?.[0]) {
      const bank = company.bankAccounts[0];
      doc.y = 730;
      doc.fontSize(8).font("Helvetica").fillColor("#888888");
      doc.text(`Payment: ${bank.bankName} | IBAN: ${bank.iban} | SWIFT: ${bank.swift}`, 50, doc.y, { align: "center", width: pageWidth });
    }

    doc.end();
  });
}
