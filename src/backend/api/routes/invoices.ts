import { Router } from 'express';
import { validate } from '../../middleware/validate.js';
import { CreateInvoiceSchema } from '../schemas.js';
import {
  createInvoice,
  postInvoice,
  getInvoice,
  findDuplicateInvoice,
  cancelInvoice,
  getInvoicePostings,
  createCreditNote,
} from '../../services/invoice.js';
import { createContact, findContactByName } from '../../services/contact.js';
import { markOverdueInvoices } from '../../services/reporting.js';
import { recognizeInvoice, recognizeInvoiceMultiPage } from '../../services/invoice-recognition.js';
import { parseInvoiceDescription } from '../../services/agent.js';
import { generateInvoicePdf } from '../../services/invoice-pdf.js';
import { containers } from '../../services/cosmos.js';
import {
  parsePagination,
  paginationClause,
  paginatedResponse,
} from '../../middleware/pagination.js';
import { safeError } from '../../middleware/error-handler.js';
import type { ApiResponse } from '@shared/types';
import { InvoicesQuerySchema, handleGLError } from './common.js';

const router = Router();

// Invoices
router.get('/companies/:companyId/invoices', async (req, res) => {
  try {
    const queryValidation = InvoicesQuerySchema.safeParse(req.query);
    if (!queryValidation.success) {
      res.status(400).json({
        error: { code: 'VAL-001', message: 'Invalid query parameters' },
        meta: { issues: queryValidation.error.issues },
      });
      return;
    }

    const pg = parsePagination(req);
    const typeFilter = queryValidation.data.type ? 'AND c.type = @type' : '';
    const params: { name: string; value: string }[] = [
      { name: '@companyId', value: req.params.companyId },
    ];
    if (queryValidation.data.type) {
      params.push({ name: '@type', value: queryValidation.data.type });
    }
    const { resources } = await containers
      .documents()
      .items.query({
        query: `SELECT * FROM c WHERE c.companyId = @companyId AND (c.docType = 'invoice' OR IS_DEFINED(c.invoiceNumber)) ${typeFilter} ORDER BY c.date DESC ${paginationClause(pg)}`,
        parameters: params,
      })
      .fetchAll();
    res.json(paginatedResponse(resources, pg));
  } catch (err) {
    {
      const e = safeError(err, 'QUERY_FAILED');
      res.status(e.status).json(e.body);
    }
  }
});

// ─── Invoice Upload & Recognition ───────────────────────────

router.post('/companies/:companyId/invoices/upload', async (req, res) => {
  try {
    const { image, mimeType, pages } = req.body as {
      image?: string;
      mimeType?: string;
      pages?: Array<{ image: string; mimeType: string }>;
    };
    // Multi-page mode if `pages` is provided; otherwise single-image legacy.
    const hasPages = Array.isArray(pages) && pages.length > 0;
    if (!hasPages && (!image || !mimeType)) {
      res.status(400).json({
        error: {
          code: 'MISSING_DATA',
          message: 'image+mimeType (single page) or pages[] (multi-page) required',
        },
      });
      return;
    }

    // Step 1: Recognize invoice with GPT-4o vision (multi-page if provided).
    const recognized = hasPages
      ? await recognizeInvoiceMultiPage(
          pages!.map((p) => ({ imageBase64: p.image, mimeType: p.mimeType })),
        )
      : await recognizeInvoice(image!, mimeType!);

    // Step 2: Find or create vendor contact
    let contactId = '';
    const contactName = recognized.vendorName || 'Unknown vendor';

    if (recognized.vendorName) {
      const existing = await findContactByName(
        req.params.companyId,
        recognized.vendorName,
        recognized.vendorRegistrationNumber,
      );

      if (existing) {
        contactId = existing.id;
      } else {
        const newContact = await createContact({
          companyId: req.params.companyId,
          type: 'vendor',
          name: recognized.vendorName,
          registrationNumber: recognized.vendorRegistrationNumber,
          vatNumber: recognized.vendorVatNumber,
          address: {
            line1: recognized.vendorAddress || '',
            city: '',
            postalCode: '',
            country: 'LV',
          },
          createdBy: req.user!.id,
        });
        contactId = newContact.id;
      }
    }

    // Step 2b: Check for duplicate invoice (same vendor + same invoice number)
    if (contactId && recognized.invoiceNumber) {
      const duplicate = await findDuplicateInvoice(
        req.params.companyId,
        contactId,
        recognized.invoiceNumber,
      );
      if (duplicate) {
        // Auto-cancel the old duplicate and continue with new one
        try {
          await cancelInvoice(
            req.params.companyId,
            duplicate.id,
            'Replaced by re-upload',
            req.user!.id,
          );
        } catch {
          // If cancel fails (e.g. has payments), warn but continue
        }
      }
    }

    // Step 3: Create purchase invoice — filter out zero-amount lines
    const invoiceLines = recognized.lines
      .filter((l) => l.quantity > 0 && l.unitPrice > 0)
      .map((l) => ({
        description: l.description || 'Item',
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        vatRate: [0, 5, 12, 21].includes(l.vatRate) ? l.vatRate : 21,
        accountCode: '6350', // Default: professional services
      }));

    // If no valid lines, fall back to using the total as a single line
    if (invoiceLines.length === 0 && recognized.total > 0) {
      const net = recognized.subtotal || recognized.total / 1.21;
      invoiceLines.push({
        description: `Invoice ${recognized.invoiceNumber || ''}`.trim(),
        quantity: 1,
        unitPrice: Math.round(net * 100) / 100,
        vatRate: 21,
        accountCode: '6350',
      });
    }

    if (invoiceLines.length === 0) {
      res.status(400).json({
        error: {
          code: 'NO_LINES',
          message: 'Could not extract any line items with amounts from the invoice.',
        },
      });
      return;
    }

    const invoice = await createInvoice({
      companyId: req.params.companyId,
      type: 'purchase',
      contactId,
      contactName,
      date: recognized.invoiceDate,
      dueDate:
        recognized.dueDate || new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
      vendorInvoiceNumber: recognized.invoiceNumber,
      recognitionConfidence: recognized.confidence,
      lines: invoiceLines,
      createdBy: req.user!.id,
    });

    // Step 4: Auto-post to ledger
    const postedInvoice = await postInvoice(req.params.companyId, invoice.id, req.user!.id);

    res.status(201).json({
      data: {
        recognized,
        invoice: postedInvoice,
        contactId,
        message: `Invoice ${postedInvoice.invoiceNumber} from ${contactName} for €${postedInvoice.total.toFixed(2)} created and posted to ledger.`,
      },
    } as ApiResponse);
  } catch (err) {
    {
      const e = safeError(err, 'UPLOAD_FAILED');
      res.status(e.status).json(e.body);
    }
  }
});

// ─── Finance: Invoices (CRUD + post) ────────────────────────

router.post('/companies/:companyId/invoices', validate(CreateInvoiceSchema), async (req, res) => {
  try {
    const invoice = await createInvoice({
      companyId: req.params.companyId,
      ...req.body,
      createdBy: req.user!.id,
    });
    res.status(201).json({
      data: invoice,
      meta: {
        operation: {
          operation: 'create',
          entityType: 'invoice',
          entityId: invoice.id,
          status: 'success',
          message: `Invoice ${invoice.invoiceNumber} created`,
          suggestedActions: ['post', 'edit', 'attach-document'],
        },
      },
    } as ApiResponse);
  } catch (err) {
    handleGLError(err, res);
  }
});

router.get('/companies/:companyId/invoices/:invoiceId', async (req, res) => {
  const invoice = await getInvoice(req.params.companyId, req.params.invoiceId);
  if (!invoice) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Invoice not found' } });
    return;
  }
  res.json({ data: invoice } as ApiResponse);
});

router.post('/companies/:companyId/invoices/:invoiceId/post', async (req, res) => {
  try {
    const invoice = await postInvoice(req.params.companyId, req.params.invoiceId, req.user!.id);
    res.json({ data: invoice } as ApiResponse);
  } catch (err) {
    handleGLError(err, res);
  }
});

router.post('/companies/:companyId/invoices/:invoiceId/cancel', async (req, res) => {
  try {
    const invoice = await cancelInvoice(
      req.params.companyId,
      req.params.invoiceId,
      req.body.reason || 'Cancelled by user',
      req.user!.id,
    );
    res.json({ data: invoice } as ApiResponse);
  } catch (err) {
    handleGLError(err, res);
  }
});

router.get('/companies/:companyId/invoices/:invoiceId/postings', async (req, res) => {
  try {
    const postings = await getInvoicePostings(req.params.companyId, req.params.invoiceId);
    res.json({ data: postings } as ApiResponse);
  } catch (err) {
    {
      const e = safeError(err, 'QUERY_FAILED');
      res.status(e.status).json(e.body);
    }
  }
});

router.post('/companies/:companyId/invoices/parse-description', async (req, res) => {
  try {
    const description = req.body.description as string;
    if (!description?.trim()) {
      res.status(400).json({
        error: { code: 'VAL-001', message: 'Description is required' },
      });
      return;
    }
    const fields = await parseInvoiceDescription(description.trim());
    res.json({ data: fields } as ApiResponse);
  } catch (err) {
    {
      const e = safeError(err, 'PARSE_FAILED');
      res.status(e.status).json(e.body);
    }
  }
});

// ─── Credit Notes ───────────────────────────────────────────

router.post('/companies/:companyId/invoices/:invoiceId/credit-note', async (req, res) => {
  try {
    const creditNote = await createCreditNote({
      companyId: req.params.companyId,
      originalInvoiceId: req.params.invoiceId,
      reason: req.body.reason || 'Credit note',
      lines: req.body.lines,
      createdBy: req.user!.id,
    });
    res.status(201).json({ data: creditNote } as ApiResponse);
  } catch (err) {
    handleGLError(err, res);
  }
});

// ─── Invoice PDF ────────────────────────────────────────────

router.get('/companies/:companyId/invoices/:invoiceId/pdf', async (req, res) => {
  try {
    const pdf = await generateInvoicePdf(req.params.companyId, req.params.invoiceId);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="invoice-${req.params.invoiceId}.pdf"`);
    res.send(pdf);
  } catch (err) {
    {
      const e = safeError(err, 'PDF_FAILED');
      res.status(e.status).json(e.body);
    }
  }
});

// ─── Mark Overdue Invoices ──────────────────────────────────

router.post('/companies/:companyId/invoices/mark-overdue', async (req, res) => {
  try {
    const count = await markOverdueInvoices(req.params.companyId);
    res.json({ data: { updated: count } } as ApiResponse);
  } catch (err) {
    {
      const e = safeError(err, 'UPDATE_FAILED');
      res.status(e.status).json(e.body);
    }
  }
});

export default router;
