// Invoice recognition using Azure OpenAI GPT-4o vision
// Extracts structured data from uploaded invoice images/PDFs

import { AzureOpenAI } from "openai";

let client: AzureOpenAI;

function getClient(): AzureOpenAI {
  if (!client) {
    client = new AzureOpenAI({
      endpoint: process.env.AZURE_OPENAI_ENDPOINT!,
      apiKey: process.env.AZURE_OPENAI_API_KEY!,
      apiVersion: "2024-10-21",
    });
  }
  return client;
}

export interface RecognizedInvoice {
  vendorName: string;
  vendorRegistrationNumber?: string;
  vendorVatNumber?: string;
  vendorAddress?: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate?: string;
  currency: string;
  lines: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
    vatRate: number;
    lineTotal: number;
  }>;
  subtotal: number;
  vatAmount: number;
  total: number;
  bankAccount?: string;
  reference?: string;
  confidence: "high" | "medium" | "low";
  rawText?: string;
}

const EXTRACTION_PROMPT = `You are an expert invoice data extractor for Latvian companies. Extract structured data from this invoice image.

Return ONLY valid JSON with this exact structure (no markdown, no backticks):
{
  "vendorName": "full company name as shown on invoice",
  "vendorRegistrationNumber": "11-digit number or null",
  "vendorVatNumber": "LV + number or null",
  "vendorAddress": "full address or null",
  "invoiceNumber": "invoice number/ID",
  "invoiceDate": "YYYY-MM-DD",
  "dueDate": "YYYY-MM-DD or null",
  "currency": "EUR",
  "lines": [
    {
      "description": "item/service description",
      "quantity": 1,
      "unitPrice": 100.00,
      "vatRate": 21,
      "lineTotal": 121.00
    }
  ],
  "subtotal": 100.00,
  "vatAmount": 21.00,
  "total": 121.00,
  "bankAccount": "IBAN or null",
  "reference": "payment reference or null",
  "confidence": "high"
}

Rules:
- All amounts in EUR (convert if needed)
- VAT rates in Latvia: 21% (standard), 12% (reduced), 5% (super-reduced), 0% (exempt)
- Dates in YYYY-MM-DD format
- If you can't read a field clearly, set it to null
- Set confidence to "high" if all key fields are clear, "medium" if some are unclear, "low" if many are unreadable
- lineTotal should be the gross amount (net + VAT) for that line
- subtotal is sum of all net amounts, vatAmount is total VAT, total is subtotal + vatAmount`;

export async function recognizeInvoice(imageBase64: string, mimeType: string): Promise<RecognizedInvoice> {
  const deployment = process.env.AZURE_OPENAI_DEPLOYMENT || "gpt-4o";

  const response = await getClient().chat.completions.create({
    model: deployment,
    messages: [
      { role: "system", content: EXTRACTION_PROMPT },
      {
        role: "user",
        content: [
          {
            type: "image_url",
            image_url: {
              url: `data:${mimeType};base64,${imageBase64}`,
              detail: "high",
            },
          },
          {
            type: "text",
            text: "Please extract all invoice data from this image.",
          },
        ],
      },
    ],
    temperature: 0,
    max_tokens: 2000,
  });

  const content = response.choices[0]?.message?.content || "";

  // Parse JSON from response (handle potential markdown wrapping)
  let jsonStr = content.trim();
  if (jsonStr.startsWith("```")) {
    jsonStr = jsonStr.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  }

  try {
    const parsed = JSON.parse(jsonStr) as RecognizedInvoice;

    // Validate and set defaults
    if (!parsed.invoiceDate) parsed.invoiceDate = new Date().toISOString().slice(0, 10);
    if (!parsed.currency) parsed.currency = "EUR";
    if (!parsed.lines) parsed.lines = [];
    if (!parsed.confidence) parsed.confidence = "medium";

    // Recalculate totals if needed
    if (parsed.lines.length > 0 && !parsed.subtotal) {
      parsed.subtotal = parsed.lines.reduce((s, l) => s + (l.unitPrice * l.quantity), 0);
      parsed.vatAmount = parsed.lines.reduce((s, l) => s + (l.unitPrice * l.quantity * l.vatRate / 100), 0);
      parsed.total = parsed.subtotal + parsed.vatAmount;
    }

    parsed.rawText = content;
    return parsed;
  } catch {
    throw new Error(`Failed to parse invoice data: ${content.slice(0, 200)}`);
  }
}
