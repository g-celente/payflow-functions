import { app, type InvocationContext } from '@azure/functions';
import { z } from 'zod';

import { InvalidEventError } from '../../domain/errors.js';
import { PAYMENT_EVENT_TYPES, type PaymentEvent } from '../../domain/payment-event.js';
import { deliverWebhook } from './handler.js';
import type { DeliverWebhookPorts } from './ports.js';

// Fields read from the CloudEvent; everything else is forwarded to the store untouched.
const CloudEventFields = z.object({
  id: z.string().min(1),
  type: z.enum(PAYMENT_EVENT_TYPES),
  merchantid: z.string().min(1).optional(),
  data: z.object({
    paymentId: z.string().min(1),
    merchantId: z.string().min(1),
  }),
});

// Ports come from a factory so a missing setting fails only this Function (each message ends in the DLQ),
// not the whole Function App: calculate-fees keeps answering.
export function createDeliverWebhookHandler(ports: () => DeliverWebhookPorts) {
  return async (message: unknown, context: InvocationContext): Promise<void> => {
    const event = readPaymentEvent(message);
    const deliveryCount = context.triggerMetadata?.deliveryCount;
    const outcome = await deliverWebhook(event, ports());
    context.log(`deliver-webhook ${outcome}`, {
      eventId: event.id,
      type: event.type,
      merchantId: event.merchantId,
      paymentId: event.paymentId,
      deliveryCount,
    });
  };
}

// Triggered by every message on the payment-events queue. A thrown error abandons the message; the
// Service Bus redelivers it and, after MaxDeliveryCount (5), moves it to the dead-letter queue.
export function registerDeliverWebhook(ports: () => DeliverWebhookPorts): void {
  app.serviceBusQueue('deliver-webhook', {
    connection: 'ServiceBusConnection',
    queueName: '%SERVICEBUS_QUEUE%',
    handler: createDeliverWebhookHandler(ports),
  });
}

// The payment-service sends the CloudEvent as a JSON string. Depending on the content type the Functions
// host hands it over as text, bytes or an already parsed object; the body posted to the store keeps the
// original text whenever there is one, so the signature covers exactly what was published.
export function readPaymentEvent(message: unknown): PaymentEvent {
  let body: string;
  let value: unknown;
  if (typeof message === 'string' || message instanceof Uint8Array) {
    body = typeof message === 'string' ? message : new TextDecoder().decode(message);
    try {
      value = JSON.parse(body);
    } catch {
      throw new InvalidEventError('The message is not JSON');
    }
  } else {
    value = message;
    body = JSON.stringify(message);
  }
  const parsed = CloudEventFields.safeParse(value);
  if (!parsed.success) {
    throw new InvalidEventError('The message is not a PayFlow payment event (CloudEvents payment.*)');
  }
  const fields = parsed.data;
  return {
    id: fields.id,
    type: fields.type,
    merchantId: fields.merchantid ?? fields.data.merchantId,
    paymentId: fields.data.paymentId,
    body,
  };
}
