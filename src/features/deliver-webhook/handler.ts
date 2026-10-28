import { isSubscribed, type PaymentEvent } from '../../domain/payment-event.js';
import { signWebhook } from '../../domain/webhook-signature.js';
import type { DeliverWebhookPorts } from './ports.js';

export type DeliveryOutcome = 'delivered' | 'not-configured' | 'not-subscribed';

// Use case: send one payment event to the merchant's webhook, signed with the merchant's secret.
// Events nobody asked for are dropped (not-configured, not-subscribed). Failures of the merchant-service or
// of the store escape as errors, so the Service Bus redelivers the message (5 times, then the DLQ).
export async function deliverWebhook(event: PaymentEvent, ports: DeliverWebhookPorts): Promise<DeliveryOutcome> {
  const subscription = await ports.webhooks.find(event.merchantId);
  if (subscription === null) {
    return 'not-configured';
  }
  if (!isSubscribed(subscription, event.type)) {
    return 'not-subscribed';
  }
  await ports.sender.send({
    url: subscription.url,
    body: event.body,
    headers: {
      'content-type': 'application/json',
      // The store drops repeats by this id: the queue delivers at least once.
      'x-payflow-event-id': event.id,
      'x-payflow-event-type': event.type,
      'x-payflow-signature': signWebhook(subscription.secret, event.body, ports.now()),
    },
  });
  return 'delivered';
}
