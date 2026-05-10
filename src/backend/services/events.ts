import { v4 as uuidv4 } from 'uuid';
import { containers } from './cosmos.js';
import { currentTraceId } from '../observability.js';
import type { BusinessEvent } from '@shared/types';

export async function emitEvent(event: Omit<BusinessEvent, 'id' | 'timestamp'>): Promise<void> {
  const traceId = event.traceId ?? currentTraceId();
  const record: BusinessEvent = {
    id: uuidv4(),
    timestamp: new Date().toISOString(),
    ...event,
    ...(traceId ? { traceId } : {}),
  };
  try {
    await containers.events().items.create(record);
  } catch (err) {
    // Event logging should never break business operations, but log with structured context
    console.error('Failed to emit event:', {
      type: record.type,
      documentId: record.documentId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
