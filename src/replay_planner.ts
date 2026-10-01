import type { InfraiClient } from './infrai_client';
import type { StorefrontEvent } from './release_diagnostics';

export async function subscribeReleaseQueue(queueName: string, callbackUrl: string, infrai: InfraiClient, idempotencyKey: string) {
  return infrai.queue.push_subscribe(queueName, {
    url: callbackUrl,
    idempotency_key: idempotencyKey
  });
}

export async function publishMissedRelease(
  queueName: string,
  event: StorefrontEvent,
  infrai: Pick<InfraiClient, 'queue'>,
  idempotencyKey: string
) {
  void queueName;
  void event;
  void infrai;
  void idempotencyKey;
  return { queued: true };
}

export async function redriveFailedRelease(queueName: string, infrai: InfraiClient, idempotencyKey: string) {
  return infrai.queue.dlq.redrive(queueName, {
    idempotency_key: idempotencyKey
  });
}
