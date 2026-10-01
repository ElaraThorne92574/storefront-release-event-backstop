import { describe, expect, it } from 'vitest';
import { summarizeReleaseDeliveries } from '../src/release_diagnostics';
import type { DeliveryRecord } from '../src/infrai_client';

describe('summarizeReleaseDeliveries', () => {
  it('flags a failed release completion for replay', () => {
    const input: DeliveryRecord[] = [
      {
        event: 'build.finished',
        status: 'delivered',
        destination_status: 200,
        payload: {
          event: 'build.finished',
          releaseId: 'rel_42',
          buildId: 'build_9001',
          storefront: 'spring-drop',
          commitSha: 'abc1234',
          status: 'ok',
          createdAt: '2026-01-10T09:00:00Z'
        }
      },
      {
        event: 'release.completed',
        status: 'failed',
        destination_status: 500,
        payload: {
          event: 'release.completed',
          releaseId: 'rel_42',
          buildId: 'build_9001',
          storefront: 'spring-drop',
          commitSha: 'abc1234',
          status: 'ok',
          createdAt: '2026-01-10T09:01:00Z'
        }
      }
    ];

    const result = summarizeReleaseDeliveries(input);

    expect(result.needsReplay).toBe(true);
    expect(result.releaseId).toBe('rel_42');
    expect(result.releaseEvent?.event).toBe('release.completed');
  });
});
