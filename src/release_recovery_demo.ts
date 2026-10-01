import { summarizeReleaseDeliveries } from './release_diagnostics';
import type { DeliveryRecord } from './infrai_client';

const sampleDeliveries: DeliveryRecord[] = [
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

const decision = summarizeReleaseDeliveries(sampleDeliveries);
console.log(JSON.stringify(decision, null, 2));
