import { v4 as uuidv4 } from "uuid";
import { containers } from "./cosmos.js";
import type { BusinessEvent } from "@shared/types";

export async function emitEvent(event: Omit<BusinessEvent, "id" | "timestamp">): Promise<void> {
  const record: BusinessEvent = {
    id: uuidv4(),
    timestamp: new Date().toISOString(),
    ...event,
  };
  try {
    await containers.events().items.create(record);
  } catch {
    // Event logging should never break business operations
    console.error("Failed to emit event:", record.type, record.documentId);
  }
}
