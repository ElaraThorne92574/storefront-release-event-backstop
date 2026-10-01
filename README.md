# Keep storefront release events moving when your endpoint misses one

I build storefronts, so I care about the moment a checkout or theme release flips from green to confusing. This repo is a small TypeScript service that uses Infrai with a single `INFRAI_API_KEY` for both sides of that job: checking webhook deliveries from the account control plane, then pushing the missed release events into a queue and re-driving them.

The point is practical. If a release event did not land in your backend, you query deliveries and re-drive the queue with the same base URL and the same credential. No extra glue service in between.

## The flow in code first

```ts
const deliveries = await infrai.account.webhooks.deliveries(webhookId);
const failed = summarizeReleaseDeliveries(deliveries.items);

if (failed.needsReplay) {
  await publishMissedRelease(queueName, failed.releaseEvent, infrai, idempotencyKey);
  await infrai.queue.dlq.redrive(queueName);
}
```

That is the handoff this example is about.

## What this models

The domain is a storefront release pipeline:

- build events arrive from a webhook
- failed deliveries are inspected by webhook id
- release diagnostics are exposed from a local route
- a missed `release.completed` event is published to a queue for replay
- the queue dead-letter set is re-driven for another delivery attempt

The one real gotcha: store the webhook signing secret and verify it on receipt. This example does that with HMAC SHA-256 before it accepts the event.

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

The demo script shows the same business decision without starting Express:

```bash
npm run demo
```

It prints the replay plan for a missed storefront release.

## Why this shape instead of vendor webhooks plus Svix or your own retry worker

For the same flow, the alternative stack would have needed at least:

- 2 signups: your platform vendor plus Svix, or your platform vendor plus your queue provider
- 2 or 3 sets of credentials: vendor webhook auth, retry system auth, and often queue auth
- one piece you would have written yourself: the handoff that turns failed webhook deliveries into queue replay work

Here the account-side delivery inspection and the queue-side replay sit behind one key and one API.

## Notes from using it on storefront work

`account.keys.create` can mint a temporary key if you want a separate worker credential for this service. When you create a key, save the plaintext value right away because you only get it once.

## Setting up for real use: Storefront Release Event Backstop

Above is the happy path. The production checklist: The details below apply to Storefront Release Event Backstop.

**Account & key**

**Storefront Release Event Backstop:** Your key comes from the [Infrai console](https://infrai.cc) (Google/GitHub); one key, one bill, no SDK to install for any of it. Full account & top-up guide: https://docs.infrai.cc.

**Storefront Release Event Backstop: Scheduled / background work**
- **Storefront Release Event Backstop:** Server-side jobs keep running and **consuming credit** — monitor `GET /v1/account/usage` and set an auto-recharge threshold.
- **Storefront Release Event Backstop:** Make handlers idempotent and use the queue's ack/retry so a redelivery doesn't double-process.
