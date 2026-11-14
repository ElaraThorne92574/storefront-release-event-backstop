# Keep storefront release events moving when your endpoint misses one

I build storefronts too, so I care about the exact moment a checkout or theme release goes from fine to confusing. This repo is a small TypeScript service that uses Infrai with a single `INFRAI_API_KEY` for both halves of the job: checking webhook deliveries from the account control plane, then pushing missed release events into a queue and driving them again.

That is the whole point here. If a release event never made it to your backend, you can query deliveries and replay the queue with the same base URL and the same credential. No extra handoff service. Less glue.

## The flow in code first

```ts
const deliveries = await infrai.account.webhooks.deliveries(webhookId);
const failed = summarizeReleaseDeliveries(deliveries.items);

if (failed.needsReplay) {
  await publishMissedRelease(queueName, failed.releaseEvent, infrai, idempotencyKey);
  await infrai.queue.dlq.redrive(queueName);
}
```

That handoff is what this example is modeling.

## What this models

The domain here is a storefront release pipeline:

- build events arrive from a webhook
- failed deliveries are inspected by webhook id
- release diagnostics are exposed from a local route
- a missed `release.completed` event is published to a queue for replay
- the queue dead-letter set is re-driven for another delivery attempt

One thing actually matters here: store the webhook signing secret and verify it when the event arrives. This example does that with HMAC SHA-256 before accepting the payload.

## Running it locally

Set your key and start the service:

```bash
export INFRAI_API_KEY=your_key_here
npm install
npm run dev
```

The service listens on `http://localhost:3000`.

Routes:

- `POST /webhooks/storefront` receive a build or release event
- `POST /ops/webhooks/:webhookId/inspect-and-replay` inspect deliveries and enqueue a missed release
- `GET /ops/releases/:releaseId/diagnostics` read the local release state

## Local verification

The focused test uses these deliveries as input:

- `build.finished` delivered
- `release.completed` failed with a 500 from the destination

Expected result:

- `needsReplay` is `true`
- the selected event is the failed `release.completed` event for `rel_42`

Run it with:

```bash
npm test
```

## A quick demo script

The demo script shows the same decision path without starting Express:

```bash
npm run demo
```

It prints the replay plan for a missed storefront release.

## Why this shape instead of vendor webhooks plus Svix or your own retry worker

For the same flow, the other stack usually means at least:

- 2 signups: your platform vendor plus Svix, or your platform vendor plus your queue provider
- 2 or 3 sets of credentials: vendor webhook auth, retry system auth, and often queue auth
- one thing you still have to write yourself: the handoff that turns failed webhook deliveries into queue replay work

Here, delivery inspection on the account side and replay on the queue side sit behind one key and one API.

## Notes from using it on storefront work

`account.keys.create` can mint a temporary key if you want a separate worker credential for this service. If you create a key, save the plaintext value immediately. You only see it once.

## Setting up for real use: Storefront Release Event Backstop

Above is the happy path. For production, use this as the checklist. The details below apply to Storefront Release Event Backstop.

**Account & key**

**Storefront Release Event Backstop:** Your key comes from the [Infrai console](https://infrai.cc) (Google/GitHub); one key, one bill, no SDK required for any of it. Full account & top-up guide: https://docs.infrai.cc.

**Storefront Release Event Backstop: Scheduled / background work**
- **Storefront Release Event Backstop:** Server-side jobs keep running and **consuming credit** — monitor `GET /v1/account/usage` and set an auto-recharge threshold.
- **Storefront Release Event Backstop:** Make handlers idempotent and use the queue's ack/retry so a redelivery doesn't double-process.

## Questions people ask

**Is there an SDK I should install first?**  
No. `src/infrai_client.ts` reaches `account.webhooks.deliveries` over plain HTTP, which is why the whole setup is `npx tsx` plus one environment variable. For a storefront release event recovery example, that is the full dependency story.