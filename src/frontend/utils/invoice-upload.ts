interface PdfJsViewport {
  width: number;
  height: number;
}

interface PdfJsPage {
  getViewport(options: { scale: number }): PdfJsViewport;
  render(options: { canvasContext: CanvasRenderingContext2D; viewport: PdfJsViewport }): {
    promise: Promise<void>;
  };
}

interface PdfJsDocument {
  numPages: number;
  getPage(pageNumber: number): Promise<PdfJsPage>;
}

interface PdfJsLibrary {
  GlobalWorkerOptions: {
    workerSrc: string;
  };
  getDocument(options: { data: ArrayBuffer }): {
    promise: Promise<PdfJsDocument>;
  };
}

export interface InvoiceUploadPage {
  image: string;
  mimeType: string;
}

export type InvoiceUploadRequestBody =
  | { image: string; mimeType: string }
  | { pages: InvoiceUploadPage[] };

export interface PreparedInvoiceUpload {
  requestBody: InvoiceUploadRequestBody;
  previewUrl: string;
}

let pdfJsPromise: Promise<PdfJsLibrary> | null = null;

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';

  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }

  return btoa(binary);
}

function buildPdfJsScriptUrl(fileName: string): string {
  return `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/${fileName}`;
}

function loadPdfJs(): Promise<PdfJsLibrary> {
  if (pdfJsPromise) return pdfJsPromise;

  pdfJsPromise = new Promise((resolve, reject) => {
    const existing = (window as Window & { pdfjsLib?: PdfJsLibrary }).pdfjsLib;
    if (existing) {
      resolve(existing);
      return;
    }

    const script = document.createElement('script');
    script.src = buildPdfJsScriptUrl('pdf.min.js');
    script.onload = () => {
      const lib = (window as Window & { pdfjsLib?: PdfJsLibrary }).pdfjsLib;
      if (!lib) {
        reject(new Error('pdf.js failed to load'));
        return;
      }

      lib.GlobalWorkerOptions.workerSrc = buildPdfJsScriptUrl('pdf.worker.min.js');
      resolve(lib);
    };
    script.onerror = () => reject(new Error('Failed to load pdf.js'));
    document.head.appendChild(script);
  });

  return pdfJsPromise;
}

async function renderPdfPages(file: File): Promise<InvoiceUploadPage[]> {
  const pdfjsLib = await loadPdfJs();
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const pages: InvoiceUploadPage[] = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 2 });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const context = canvas.getContext('2d');

    if (!context) {
      throw new Error('Could not render PDF page');
    }

    await page.render({ canvasContext: context, viewport }).promise;

    const dataUrl = canvas.toDataURL('image/png');
    pages.push({
      image: dataUrl.split(',')[1],
      mimeType: 'image/png',
    });
  }

  return pages;
}

export function buildInvoiceUploadRequestBody(
  pages: InvoiceUploadPage[],
): InvoiceUploadRequestBody {
  if (pages.length === 0) {
    throw new Error('At least one invoice page is required');
  }

  if (pages.length === 1) {
    return {
      image: pages[0].image,
      mimeType: pages[0].mimeType,
    };
  }

  return {
    pages,
  };
}

export async function prepareInvoiceUpload(file: File): Promise<PreparedInvoiceUpload> {
  if (file.type === 'application/pdf') {
    const pages = await renderPdfPages(file);
    return {
      requestBody: buildInvoiceUploadRequestBody(pages),
      previewUrl: `data:${pages[0].mimeType};base64,${pages[0].image}`,
    };
  }

  const buffer = await file.arrayBuffer();
  return {
    requestBody: {
      image: arrayBufferToBase64(buffer),
      mimeType: file.type,
    },
    previewUrl: URL.createObjectURL(file),
  };
}

export { arrayBufferToBase64 };
