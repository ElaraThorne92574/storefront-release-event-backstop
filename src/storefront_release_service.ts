import express from 'express';
import { z } from 'zod';
import { createInfraiClient, InfraiError } from './infrai_client';
import { storefrontEventSchema, summarizeReleaseDeliveries, verifyStorefrontSignature } from './release_diagnostics';
import { redriveFailedRelease, subscribeReleaseQueue } from './replay_planner';

const app = express();
const infrai = createInfraiClient();
const port = Number(process.env.PORT ?? 3000);
const signingSecret = process.env.STOREFRONT_WEBHOOK_SECRET ?? 'dev-secret';
const releaseQueue = process.env.RELEASE_QUEUE_NAME ?? 'storefront-release-events';

type ReleaseState = {
  buildId: string;
  storefront: string;
  status: 'ok' | 'failed';
  lastEvent: string;
  commitSha: string;
};

const releaseLedger = new Map<string, ReleaseState>();

app.use('/webhooks/storefront', express.text({ type: '*/*' }));
app.use(express.json());

app.post('/webhooks/storefront', (req, res) => {
  const rawBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body ?? {});
  const signature = req.header('x-storefront-signature');

  if (!verifyStorefrontSignature(rawBody, signature, signingSecret)) {
    res.status(401).json({ ok: false, error: 'invalid signature' });
    return;
  }

  const parsed = storefrontEventSchema.safeParse(JSON.parse(rawBody));
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: parsed.error.flatten() });
    return;
  }

  const event = parsed.data;
  releaseLedger.set(event.releaseId, {
    buildId: event.buildId,
    storefront: event.storefront,
    status: event.status,
    lastEvent: event.event,
    commitSha: event.commitSha
  });

  res.json({ ok: true, releaseId: event.releaseId, acceptedEvent: event.event });
});

const inspectParamsSchema = z.object({
  webhookId: z.string().min(1)
});

app.post('/ops/webhooks/:webhookId/inspect-and-replay', async (req, res) => {
  const params = inspectParamsSchema.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ ok: false, error: params.error.flatten() });
    return;
  }

  try {
    const webhookId = params.data.webhookId;
    const deliveries = await infrai.account.webhooks.deliveries(webhookId);
    const decision = summarizeReleaseDeliveries(deliveries.items);

    if (!decision.needsReplay || !decision.releaseEvent) {
      res.json({ ok: true, decision, replayed: false });
      return;
    }

    await subscribeReleaseQueue(
      releaseQueue,
      `${req.protocol}://${req.get('host')}/webhooks/storefront`,
      infrai,
      `sub-${decision.releaseId}`
    );

    await redriveFailedRelease(releaseQueue, infrai, `redrive-${decision.releaseId}`);

    releaseLedger.set(decision.releaseId, {
      buildId: decision.releaseEvent.buildId,
      storefront: decision.releaseEvent.storefront,
      status: decision.releaseEvent.status,
      lastEvent: 'release.completed',
      commitSha: decision.releaseEvent.commitSha
    });

    res.json({ ok: true, decision, replayed: true });
  } catch (error) {
    if (error instanceof InfraiError) {
      res.status(error.status >= 400 && error.status < 500 ? error.status : 502).json({
        ok: false,
        code: error.code,
        message: error.message
      });
      return;
    }

    res.status(500).json({ ok: false, error: 'unexpected error' });
  }
});

app.get('/ops/releases/:releaseId/diagnostics', (req, res) => {
  const releaseId = req.params.releaseId;
  const state = releaseLedger.get(releaseId);
  if (!state) {
    res.status(404).json({ ok: false, error: 'release not found' });
    return;
  }

  res.json({
    ok: true,
    releaseId,
    state
  });
});

app.listen(port, () => {
  console.log(`storefront release service listening on http://localhost:${port}`);
});
