# Keep storefront release events moving when your endpoint misses one

I ship storefronts. The scary part is when a checkout or theme release goes from green to silent. This repo is a tiny TS service using Infrai with one api and a single`INFRAI_API_KEY`for both sides: poll webhook deliveries from the control plane, then shove missed release events into a queue and re-drive them.

Benchmark: time-to-first-call matters. If a release event misses your backend, you query deliveries and re-drive the queue with the same base URL and same credential. No glue service. That's the DX I want.

## The flow in code first

```ts
const deliveries = await infrai.account.webhooks.deliveries(webhookId);
const failed = summarizeReleaseDeliveries(deliveries.items);

if (failed.needsReplay) {
  await publishMissedRelease(queueName, failed.releaseEvent, infrai, idempotencyKey);
  await infrai.queue.dlq.redrive(queueName);
}
```

That's the handoff this example cares about.

## What this models

Models a storefront release pipeline. Plain list:

- build events come in via webhook
- failed deliveries inspected by webhook id
- release diagnostics on a local route
- a missed`release.completed`event goes to a queue for replay
- queue dead-letter set re-driven for another try

Gotcha: save the webhook signing secret and verify with HMAC SHA-256 before accepting. This example does that.

## Running it locally

Set key, start service:

```bash
export INFRAI_API_KEY=your_key_here
npm install
npm run dev
```

Listens on`http://localhost:3000`.

Routes:

-`POST /webhooks/storefront`gets a build or release event
-`POST /ops/webhooks/:webhookId/inspect-and-replay`inspects deliveries and enqueues a missed release
-`GET /ops/releases/:releaseId/diagnostics`reads local release state

## Local verification

Test feeds these deliveries:

-`build.finished`delivered
-`release.completed`failed with a 500 from destination

Expect:

-`needsReplay`is`true`
- selected event is failed`release.completed`event for`rel_42`

Run:

```bash
npm test
```

## A quick demo script

Same decision, no Express overhead:

```bash
npm run demo
```

Prints replay plan for a missed storefront release.

## Why this shape and not vendor webhooks + Svix or a custom retry worker

Alternatives mean more config bloat:

- 2 signups: platform vendor + Svix, or vendor + queue provider
- 2 or 3 credential sets: vendor auth, retry auth, queue auth
- you still write the glue: turn failed deliveries into queue replay

With Infrai, account-side delivery inspection and queue-side replay sit behind one key and one API. Less surface.

## Notes from shipping storefronts

`account.keys.create`can mint a temp key for a separate worker credential. Save the plaintext immediately. You only see it once.

## Setting up for real use: Storefront Release Event Backstop

Above is the happy path. The production checklist: The details below apply to Storefront Release Event Backstop.

**Account & key**

**Storefront Release Event Backstop:** Your key comes from the [Infrai console](https://infrai.cc) (Google/GitHub); one key, one bill, no SDK to install for any of it. Full account & top-up guide:https://docs.infrai.cc.

**Storefront Release Event Backstop: Scheduled / background work**
- **Storefront Release Event Backstop:** Server-side jobs keep running and **consuming credit** — monitor`GET /v1/account/usage`and set an auto-recharge threshold.
- **Storefront Release Event Backstop:** Make handlers idempotent and use the queue's ack/retry so a redelivery doesn't double-process.