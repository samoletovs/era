import { describe, expect, it } from 'vitest';

import {
  arrayBufferToBase64,
  buildInvoiceUploadRequestBody,
} from '../../src/frontend/utils/invoice-upload';

describe('buildInvoiceUploadRequestBody', () => {
  it('uses the legacy single-page payload for one page', () => {
    expect(
      buildInvoiceUploadRequestBody([{ image: 'page-1', mimeType: 'image/png' }]),
    ).toEqual({ image: 'page-1', mimeType: 'image/png' });
  });

  it('uses the multi-page payload when more than one page is present', () => {
    expect(
      buildInvoiceUploadRequestBody([
        { image: 'page-1', mimeType: 'image/png' },
        { image: 'page-2', mimeType: 'image/png' },
      ]),
    ).toEqual({
      pages: [
        { image: 'page-1', mimeType: 'image/png' },
        { image: 'page-2', mimeType: 'image/png' },
      ],
    });
  });

  it('throws when no pages are provided', () => {
    expect(() => buildInvoiceUploadRequestBody([])).toThrow('At least one invoice page is required');
  });
});

describe('arrayBufferToBase64', () => {
  it('encodes binary data without truncation', () => {
    const bytes = new Uint8Array([69, 82, 65, 45, 105, 110, 118, 111, 105, 99, 101]);
    expect(arrayBufferToBase64(bytes.buffer)).toBe('RVJBLWludm9pY2U=');
  });
});
