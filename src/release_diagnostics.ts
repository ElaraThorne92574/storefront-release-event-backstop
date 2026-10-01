import { z } from 'zod';
import type { DeliveryRecord } from './infrai_client';

export const storefrontEventSchema = z.object({
  event: z.enum(['build.finished', 'release.started', 'release.completed']),
  releaseId: z.string(),
  buildId: z.string(),
  storefront: z.string(),
  commitSha: z.string(),
  status: z.enum(['ok', 'failed']),
  createdAt: z.string()
});

export type StorefrontEvent = z.infer<typeof storefrontEventSchema>;

export type ReleaseDecision = {
  releaseId: string;
  needsReplay: boolean;
  reason: string;
  releaseEvent?: StorefrontEvent;
};

export function summarizeReleaseDeliveries(items: DeliveryRecord[]): ReleaseDecision {
  const releaseFailure = items.find((item) => {
    if (item.event !== 'release.completed' || item.status !== 'failed' || !item.payload) {
      return false;
    }
    const parsed = storefrontEventSchema.safeParse(item.payload);
    return parsed.success;
  });

  if (!releaseFailure) {
    return {
      releaseId: 'unknown',
      needsReplay: false,
      reason: 'No failed release completion event was found.'
    };
  }

  const parsed = storefrontEventSchema.parse(releaseFailure.payload);
  return {
    releaseId: parsed.releaseId,
    needsReplay: true,
    reason: `Replay release.completed for ${parsed.releaseId}.`,
    releaseEvent: parsed
  };
}

export function verifyStorefrontSignature(rawBody: string, headerValue: string | undefined, secret: string): boolean {
  if (!headerValue) return false;
  const { createHmac, timingSafeEqual } = awaitCrypto();
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  const provided = headerValue.trim();
  const left = Buffer.from(expected);
  const right = Buffer.from(provided);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function awaitCrypto() {
  return require('node:crypto') as typeof import('node:crypto');
}
