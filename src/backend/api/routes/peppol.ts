import { Router } from 'express';
import { validate } from '../../middleware/validate.js';
import { DispatchPeppolSchema } from '../schemas.js';
import { getInvoice } from '../../services/invoice.js';
import { getContact } from '../../services/contact.js';
import { buildPeppolInvoiceXml, PeppolBuildError } from '../../services/peppol/ubl-builder.js';
import {
  AccessPointError,
  MockAccessPoint,
  NoOpAccessPoint,
  type PeppolAccessPoint,
} from '../../services/peppol/access-point.js';
import {
  companyToPeppolParty,
  contactToPeppolParty,
  dispatchInvoice,
} from '../../services/peppol/dispatcher.js';
import { containers } from '../../services/cosmos.js';
import { safeError } from '../../middleware/error-handler.js';
import type { ApiResponse, Company, PeppolOutboxEntry } from '@shared/types';

const router = Router();

// ─── PEPPOL outbox ──────────────────────────────────────────
//
// Phase 1 Compliance: autonomous slice — UBL builder + Access Point
// abstraction (NoOp / Mock) + outbox state machine. Vendor wiring
// (Storecove, Tickstar, etc.) is plug-replaceable via the
// PeppolAccessPoint interface.
//
// Provider selection is driven by `process.env.PEPPOL_PROVIDER`:
//   • unset  → NoOpAccessPoint (every send returns NOT_CONFIGURED)
//   • "mock" → MockAccessPoint (in-memory; for local dev / tests)
//   • other  → not yet implemented; falls through to NoOp

function selectPeppolAccessPoint(): PeppolAccessPoint {
  const provider = (process.env.PEPPOL_PROVIDER ?? '').toLowerCase();
  if (provider === 'mock') return new MockAccessPoint();
  return new NoOpAccessPoint();
}

router.post(
  '/companies/:companyId/invoices/:invoiceId/peppol',
  validate(DispatchPeppolSchema.partial()),
  async (req, res) => {
    try {
      const { companyId, invoiceId } = req.params as { companyId: string; invoiceId: string };
      const invoice = await getInvoice(companyId, invoiceId);
      if (!invoice) {
        res
          .status(404)
          .json({ error: { code: 'PEPPOL_INVOICE_NOT_FOUND', message: 'Invoice not found' } });
        return;
      }
      if (invoice.type !== 'sales') {
        res.status(400).json({
          error: {
            code: 'PEPPOL_NOT_SALES',
            message: 'Only sales invoices can be dispatched via PEPPOL',
          },
        });
        return;
      }
      const { resource: company } = await containers
        .companies()
        .item(companyId, companyId)
        .read<Company>();
      if (!company) {
        res
          .status(404)
          .json({ error: { code: 'PEPPOL_COMPANY_NOT_FOUND', message: 'Company not found' } });
        return;
      }
      if (!invoice.contactId) {
        res
          .status(400)
          .json({ error: { code: 'PEPPOL_NO_CONTACT', message: 'Invoice has no contact' } });
        return;
      }
      const customer = await getContact(companyId, invoice.contactId);
      if (!customer) {
        res
          .status(404)
          .json({ error: { code: 'PEPPOL_CONTACT_NOT_FOUND', message: 'Contact not found' } });
        return;
      }

      const accessPoint = selectPeppolAccessPoint();
      const result = await dispatchInvoice(
        { invoice, company, customer },
        {
          accessPoint,
          persistOutbox: async (entry) => {
            await containers.documents().items.upsert(entry);
          },
        },
      );
      res.status(201).json({ data: result.outbox } as ApiResponse);
    } catch (err) {
      if (err instanceof PeppolBuildError) {
        res.status(400).json({ error: { code: `PEPPOL_BUILD_${err.code}`, message: err.message } });
        return;
      }
      if (err instanceof AccessPointError) {
        res.status(502).json({ error: { code: `PEPPOL_AP_${err.code}`, message: err.message } });
        return;
      }
      const e = safeError(err, 'PEPPOL_DISPATCH_FAILED');
      res.status(e.status).json(e.body);
    }
  },
);

router.get('/companies/:companyId/peppol/outbox', async (req, res) => {
  try {
    const { companyId } = req.params;
    const status = (req.query.status as string) || undefined;
    const params: { name: string; value: string }[] = [{ name: '@cid', value: companyId }];
    let query = "SELECT * FROM c WHERE c.companyId = @cid AND c.docType = 'peppol-outbox'";
    if (status) {
      query += ' AND c.status = @status';
      params.push({ name: '@status', value: status });
    }
    query += ' ORDER BY c.createdAt DESC OFFSET 0 LIMIT 100';
    const { resources } = await containers
      .documents()
      .items.query<PeppolOutboxEntry>({ query, parameters: params })
      .fetchAll();
    res.json({ data: resources } as ApiResponse);
  } catch (err) {
    const e = safeError(err, 'PEPPOL_LIST_FAILED');
    res.status(e.status).json(e.body);
  }
});

// Preview-only — generates UBL without persisting anything. Useful for
// agents / UI to inspect the document before pressing Send.
router.get('/companies/:companyId/invoices/:invoiceId/peppol/preview', async (req, res) => {
  try {
    const { companyId, invoiceId } = req.params;
    const invoice = await getInvoice(companyId, invoiceId);
    if (!invoice) {
      res
        .status(404)
        .json({ error: { code: 'PEPPOL_INVOICE_NOT_FOUND', message: 'Invoice not found' } });
      return;
    }
    const { resource: company } = await containers
      .companies()
      .item(companyId, companyId)
      .read<Company>();
    if (!company) {
      res
        .status(404)
        .json({ error: { code: 'PEPPOL_COMPANY_NOT_FOUND', message: 'Company not found' } });
      return;
    }
    const customer = invoice.contactId ? await getContact(companyId, invoice.contactId) : null;
    if (!customer) {
      res
        .status(404)
        .json({ error: { code: 'PEPPOL_CONTACT_NOT_FOUND', message: 'Contact not found' } });
      return;
    }
    const ubl = buildPeppolInvoiceXml({
      invoice,
      supplier: companyToPeppolParty(company),
      customer: contactToPeppolParty(customer),
    });
    res.setHeader('Content-Type', 'application/xml');
    res.send(ubl);
  } catch (err) {
    if (err instanceof PeppolBuildError) {
      res.status(400).json({ error: { code: `PEPPOL_BUILD_${err.code}`, message: err.message } });
      return;
    }
    const e = safeError(err, 'PEPPOL_PREVIEW_FAILED');
    res.status(e.status).json(e.body);
  }
});

export default router;
