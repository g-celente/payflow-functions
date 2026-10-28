import { describe, expect, it } from 'vitest';

import { DependencyUnavailableError, InvalidEventError } from '../../src/domain/errors.js';
import { signWebhook } from '../../src/domain/webhook-signature.js';
import { createDeliverWebhookHandler, readPaymentEvent } from '../../src/features/deliver-webhook/function.js';
import { deliverWebhook } from '../../src/features/deliver-webhook/handler.js';
import {
  CLOUD_EVENT,
  EVENT_ID,
  FakeSender,
  FakeWebhooks,
  invocationContext,
  MERCHANT_ID,
  NOW,
  PAYMENT_ID,
  ports,
  SUBSCRIPTION,
} from '../support/fakes.js';

const BODY = JSON.stringify(CLOUD_EVENT);
const EVENT = readPaymentEvent(BODY);

describe('deliverWebhook', () => {
  it('posts the event, signed with the merchant secret, to the merchant URL', async () => {
    const webhooks = new FakeWebhooks();
    const sender = new FakeSender();

    expect(await deliverWebhook(EVENT, ports(webhooks, sender))).toBe('delivered');

    expect(webhooks.asked).toEqual([MERCHANT_ID]);
    expect(sender.sent).toEqual([{
      url: SUBSCRIPTION.url,
      body: BODY,
      headers: {
        'content-type': 'application/json',
        'x-payflow-event-id': EVENT_ID,
        'x-payflow-event-type': 'payment.authorized',
        'x-payflow-signature': signWebhook(SUBSCRIPTION.secret, BODY, NOW),
      },
    }]);
  });

  it('drops the event when the merchant has no webhook', async () => {
    const sender = new FakeSender();
    expect(await deliverWebhook(EVENT, ports(new FakeWebhooks(null), sender))).toBe('not-configured');
    expect(sender.sent).toEqual([]);
  });

  it('drops event types the merchant did not subscribe to', async () => {
    const sender = new FakeSender();
    const webhooks = new FakeWebhooks({ ...SUBSCRIPTION, events: ['payment.refunded'] });
    expect(await deliverWebhook(EVENT, ports(webhooks, sender))).toBe('not-subscribed');
    expect(sender.sent).toEqual([]);
  });

  it('lets merchant-service and store failures escape, so the Service Bus delivers again', async () => {
    const down = new DependencyUnavailableError('merchant-service', 'timeout', 'slow');
    await expect(deliverWebhook(EVENT, ports(new FakeWebhooks(down)))).rejects.toBe(down);

    const refused = new DependencyUnavailableError('webhook', 'rejected', 'HTTP 500');
    await expect(deliverWebhook(EVENT, ports(new FakeWebhooks(), new FakeSender(refused)))).rejects.toBe(refused);
  });
});

describe('readPaymentEvent', () => {
  it('reads the CloudEvent text and keeps it as the body', () => {
    expect(EVENT).toEqual({
      id: EVENT_ID,
      type: 'payment.authorized',
      merchantId: MERCHANT_ID,
      paymentId: PAYMENT_ID,
      body: BODY,
    });
  });

  it('accepts the message as bytes or as an object parsed by the host', () => {
    expect(readPaymentEvent(new TextEncoder().encode(BODY))).toEqual(EVENT);
    expect(readPaymentEvent(CLOUD_EVENT)).toEqual(EVENT);
  });

  it('falls back to data.merchantId without the merchantid extension', () => {
    const withoutExtension = JSON.stringify({ ...CLOUD_EVENT, merchantid: undefined });
    expect(withoutExtension).not.toContain('merchantid');
    expect(readPaymentEvent(withoutExtension).merchantId).toBe(MERCHANT_ID);
  });

  it.each([
    ['not JSON', 'nope'],
    ['another event type', JSON.stringify({ ...CLOUD_EVENT, type: 'merchant.created' })],
    ['no data', JSON.stringify({ ...CLOUD_EVENT, data: undefined })],
  ])('refuses %s', (_case, message) => {
    expect(() => readPaymentEvent(message)).toThrow(InvalidEventError);
  });
});

describe('deliver-webhook trigger', () => {
  it('reads the message and delivers it', async () => {
    const sender = new FakeSender();
    const handler = createDeliverWebhookHandler(() => ports(new FakeWebhooks(), sender));
    await handler(BODY, invocationContext({ deliveryCount: 1 }));
    expect(sender.sent).toHaveLength(1);
  });

  it('fails the invocation for a message it cannot read (it ends in the DLQ)', async () => {
    const handler = createDeliverWebhookHandler(() => ports());
    await expect(handler('nope', invocationContext())).rejects.toBeInstanceOf(InvalidEventError);
  });
});
