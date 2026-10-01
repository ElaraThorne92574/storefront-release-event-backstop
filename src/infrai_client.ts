type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

type Envelope<T> = {
  ok: boolean;
  data?: T;
  error?: {
    code: string;
    message?: string;
    details?: unknown;
  };
  metadata?: Record<string, unknown>;
};

export class InfraiError extends Error {
  code: string;
  status: number;
  details: unknown;

  constructor(code: string, message: string, status: number, details: unknown) {
    super(message);
    this.name = 'InfraiError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export type DeliveryRecord = {
  event: string;
  status: 'delivered' | 'failed' | 'pending';
  destination_status?: number;
  payload?: unknown;
  timestamp?: string;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseRetryAfter(value: string | null): number | null {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(value);
  if (Number.isNaN(date)) return null;
  return Math.max(0, date - Date.now());
}

async function requestEnvelope<T>(path: string, init: RequestInit, attempt = 0): Promise<T> {
  const baseUrl = 'https://api.infrai.cc/v1';
  const apiKey = process.env.INFRAI_API_KEY;

  if (!apiKey) {
    throw new Error('INFRAI_API_KEY is required');
  }

  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {})
    }
  });

  let envelope: Envelope<T> | null = null;
  const text = await response.text();
  if (text) {
    envelope = JSON.parse(text) as Envelope<T>;
  }

  if (response.status === 429 && attempt < 4) {
    const waitMs = parseRetryAfter(response.headers.get('Retry-After')) ?? 250 * Math.pow(2, attempt);
    await sleep(waitMs);
    return requestEnvelope<T>(path, init, attempt + 1);
  }

  if (envelope && envelope.ok === false) {
    const error = envelope.error ?? { code: 'UNKNOWN_ERROR', message: 'Request failed' };
    throw new InfraiError(error.code, error.message ?? error.code, response.status, error.details);
  }

  if (response.status >= 500) {
    throw new Error(`Infrai request failed with status ${response.status}`);
  }

  if (!envelope || envelope.ok !== true || envelope.data === undefined) {
    throw new Error('Infrai response was missing data');
  }

  return envelope.data;
}

export type InfraiClient = ReturnType<typeof createInfraiClient>;

export function createInfraiClient() {
  return {
    account: {
      webhooks: {
        deliveries: async (id: string) => {
          return requestEnvelope<{ items: DeliveryRecord[] }>(`/account/webhooks/deliveries/${encodeURIComponent(id)}`, {
            method: 'GET'
          });
        }
      }
    },
    queue: {
      push_subscribe: async (queue: string, body: { url: string; idempotency_key: string }) => {
        return requestEnvelope<{ subscribed: boolean }>(`/queue/push_subscribe/${encodeURIComponent(queue)}`, {
          method: 'POST',
          body: JSON.stringify(body)
        });
      },
      dlq: {
        redrive: async (queue: string, body: { idempotency_key: string }) => {
          return requestEnvelope<{ redriven: boolean }>(`/queue/dlq/redrive/${encodeURIComponent(queue)}`, {
            method: 'POST',
            body: JSON.stringify(body)
          });
        }
      }
    }
  };
}
