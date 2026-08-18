import { Router } from 'express';
import { validate } from '../../middleware/validate.js';
import { CreateContactSchema } from '../schemas.js';
import {
  createContact,
  getContact,
  findContactByName,
  updateContact,
  mergeContacts,
  findDuplicateContacts,
  checkContactRegister,
  applyRegisterData,
} from '../../services/contact.js';
import { parseContactDescription } from '../../services/agent.js';
import { containers } from '../../services/cosmos.js';
import {
  parsePagination,
  paginationClause,
  paginatedResponse,
} from '../../middleware/pagination.js';
import { safeError } from '../../middleware/error-handler.js';
import type { ApiResponse } from '@shared/types';

const router = Router();

// Contacts
router.get('/companies/:companyId/contacts', async (req, res) => {
  try {
    const pg = parsePagination(req);
    const { resources } = await containers
      .contacts()
      .items.query({
        query: `SELECT * FROM c WHERE c.companyId = @companyId ORDER BY c.name ${paginationClause(pg)}`,
        parameters: [{ name: '@companyId', value: req.params.companyId }],
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

router.patch('/companies/:companyId/contacts/:contactId', async (req, res) => {
  try {
    const contact = await updateContact(req.params.companyId, req.params.contactId, req.body);
    if (!contact) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Contact not found' } });
      return;
    }
    res.json({ data: contact } as ApiResponse);
  } catch (err) {
    {
      const e = safeError(err, 'UPDATE_FAILED');
      res.status(e.status).json(e.body);
    }
  }
});

// ─── Contacts (CRUD) ────────────────────────────────────────

router.get('/companies/:companyId/contacts/find', async (req, res) => {
  try {
    const name = (req.query.name as string) || '';
    const regNumber = req.query.registrationNumber as string | undefined;
    if (!name && !regNumber) {
      res.json({ data: null } as ApiResponse);
      return;
    }
    const contact = await findContactByName(req.params.companyId, name, regNumber);
    res.json({ data: contact } as ApiResponse);
  } catch (err) {
    {
      const e = safeError(err, 'QUERY_FAILED');
      res.status(e.status).json(e.body);
    }
  }
});

router.post('/companies/:companyId/contacts', validate(CreateContactSchema), async (req, res) => {
  try {
    const contact = await createContact({
      companyId: req.params.companyId,
      ...req.body,
      createdBy: req.user!.id,
    });
    res.status(201).json({ data: contact } as ApiResponse);
  } catch (err) {
    {
      const e = safeError(err, 'CREATE_FAILED');
      res.status(e.status).json(e.body);
    }
  }
});

router.get('/companies/:companyId/contacts/:contactId', async (req, res) => {
  const contact = await getContact(req.params.companyId, req.params.contactId);
  if (!contact) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Contact not found' } });
    return;
  }
  res.json({ data: contact } as ApiResponse);
});

router.get('/companies/:companyId/contacts/:contactId/transactions', async (req, res) => {
  try {
    const cid = req.params.companyId;
    const contactId = req.params.contactId;

    // Get invoices for this contact
    const { resources: invoices } = await containers
      .documents()
      .items.query({
        query:
          "SELECT * FROM c WHERE c.companyId = @cid AND c.contactId = @contactId AND (c.docType = 'invoice' OR IS_DEFINED(c.invoiceNumber)) ORDER BY c.date DESC",
        parameters: [
          { name: '@cid', value: cid },
          { name: '@contactId', value: contactId },
        ],
      })
      .fetchAll();

    // Get payments for this contact
    const { resources: payments } = await containers
      .documents()
      .items.query({
        query:
          "SELECT * FROM c WHERE c.companyId = @cid AND c.contactId = @contactId AND (c.docType = 'payment' OR IS_DEFINED(c.bankAccountIban)) ORDER BY c.date DESC",
        parameters: [
          { name: '@cid', value: cid },
          { name: '@contactId', value: contactId },
        ],
      })
      .fetchAll();

    // Calculate totals
    const totalInvoiced = invoices
      .filter((i: any) => i.status !== 'cancelled')
      .reduce((s: number, i: any) => s + (i.total || 0), 0);
    const totalPaid = payments.reduce((s: number, p: any) => s + (p.amount || 0), 0);
    const balance = Math.round((totalInvoiced - totalPaid) * 100) / 100;

    res.json({
      data: { invoices, payments, totalInvoiced, totalPaid, balance },
    } as ApiResponse);
  } catch (err) {
    {
      const e = safeError(err, 'QUERY_FAILED');
      res.status(e.status).json(e.body);
    }
  }
});

// ─── Contact Merge & Register ───────────────────────────────

router.post('/companies/:companyId/contacts/merge', async (req, res) => {
  try {
    const { sourceContactId, targetContactId } = req.body;
    if (!sourceContactId || !targetContactId) {
      res.status(400).json({
        error: {
          code: 'VAL-001',
          message: 'sourceContactId and targetContactId are required',
        },
      });
      return;
    }
    const result = await mergeContacts(
      req.params.companyId,
      sourceContactId,
      targetContactId,
      req.user!.id,
    );
    res.json({ data: result } as ApiResponse);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(400).json({ error: { code: 'BIZ-001', message } });
  }
});

router.get('/companies/:companyId/contacts/duplicates', async (req, res) => {
  try {
    const groups = await findDuplicateContacts(req.params.companyId);
    res.json({ data: groups } as ApiResponse);
  } catch (err) {
    {
      const e = safeError(err, 'QUERY_FAILED');
      res.status(e.status).json(e.body);
    }
  }
});

router.get('/companies/:companyId/contacts/:contactId/check-register', async (req, res) => {
  try {
    const result = await checkContactRegister(req.params.companyId, req.params.contactId);
    res.json({ data: result } as ApiResponse);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(400).json({ error: { code: 'BIZ-001', message } });
  }
});

router.post('/companies/:companyId/contacts/:contactId/apply-register', async (req, res) => {
  try {
    const updated = await applyRegisterData(
      req.params.companyId,
      req.params.contactId,
      req.body,
      req.user!.id,
    );
    if (!updated) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Contact not found' } });
      return;
    }
    res.json({ data: updated } as ApiResponse);
  } catch (err) {
    {
      const e = safeError(err, 'SYS-001');
      res.status(e.status).json(e.body);
    }
  }
});

router.post('/companies/:companyId/contacts/parse-description', async (req, res) => {
  try {
    const description = req.body.description as string;
    if (!description?.trim()) {
      res.status(400).json({
        error: { code: 'VAL-001', message: 'Description is required' },
      });
      return;
    }
    const fields = await parseContactDescription(description.trim());
    res.json({ data: fields } as ApiResponse);
  } catch (err) {
    {
      const e = safeError(err, 'PARSE_FAILED');
      res.status(e.status).json(e.body);
    }
  }
});

export default router;
