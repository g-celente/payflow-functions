import { registerCalculateFees } from './features/calculate-fees/function.js';
import { registerDeliverWebhook } from './features/deliver-webhook/function.js';
import type { DeliverWebhookPorts } from './features/deliver-webhook/ports.js';
import { loadConfig } from './infrastructure/config.js';
import { FetchWebhookSender } from './infrastructure/fetch-webhook-sender.js';
import { HttpMerchantClient } from './infrastructure/http-merchant-client.js';

// Composition root (package.json "main"): builds the adapters and registers both Functions.
// deliver-webhook's settings are read on its first message, so a missing one does not stop calculate-fees.
let deliveryPorts: DeliverWebhookPorts | undefined;

function deliverWebhookPorts(): DeliverWebhookPorts {
  if (deliveryPorts === undefined) {
    const config = loadConfig();
    deliveryPorts = {
      webhooks: new HttpMerchantClient({
        baseUrl: config.merchantServiceUrl,
        internalKey: config.internalKey,
        timeoutMs: config.merchantServiceTimeoutMs,
      }),
      sender: new FetchWebhookSender({ timeoutMs: config.webhookTimeoutMs }),
      now: () => new Date(),
    };
  }
  return deliveryPorts;
}

registerCalculateFees();
registerDeliverWebhook(deliverWebhookPorts);
