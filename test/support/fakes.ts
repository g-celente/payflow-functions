import { InvocationContext } from '@azure/functions';

import type { WebhookSubscription } from '../../src/domain/payment-event.js';
import type {
  DeliverWebhookPorts,
  WebhookConfigProvider,
  WebhookDelivery,
  WebhookSender,
} from '../../src/features/deliver-webhook/ports.js';

export const MERCHANT_ID = '00000000-0000-0000-0000-000000000001';
export const PAYMENT_ID = '9f8e7d6c-5b4a-4321-8765-0fedcba98765';
export const EVENT_ID = '6b1f2c3d-0a1b-4c2d-9e3f-1a2b3c4d5e6f';
export const NOW = new Date('2026-10-26T20:00:00Z');

// payment.authorized as published by the payment-service (asyncapi.yaml example).
export const CLOUD_EVENT = {
  specversion: '1.0',
  id: EVENT_ID,
  source: '/payflow/payment-service',
  type: 'payment.authorized',
  subject: PAYMENT_ID,
  time: '2026-10-26T19:59:30.123456Z',
  datacontenttype: 'application/json',
  merchantid: MERCHANT_ID,
  data: {
    paymentId: PAYMENT_ID,
    merchantId: MERCHANT_ID,
    method: 'CARD',
    status: 'AUTHORIZED',
    amount: 10000,
    currency: 'BRL',
    refundedAmount: 0,
  },
};

export const SUBSCRIPTION: WebhookSubscription = {
  url: 'https://loja.example/hooks',
  secret: 'store-secret-0123456789',
  events: ['payment.authorized', 'payment.refunded'],
};

export class FakeWebhooks implements WebhookConfigProvider {
  readonly asked: string[] = [];

  constructor(private readonly answer: WebhookSubscription | null | Error = SUBSCRIPTION) {}

  async find(merchantId: string): Promise<WebhookSubscription | null> {
    this.asked.push(merchantId);
    if (this.answer instanceof Error) {
      throw this.answer;
    }
    return this.answer;
  }
}

export class FakeSender implements WebhookSender {
  readonly sent: WebhookDelivery[] = [];

  constructor(private readonly failure?: Error) {}

  async send(delivery: WebhookDelivery): Promise<void> {
    this.sent.push(delivery);
    if (this.failure !== undefined) {
      throw this.failure;
    }
  }
}

export function ports(webhooks = new FakeWebhooks(), sender = new FakeSender()): DeliverWebhookPorts {
  return { webhooks, sender, now: () => NOW };
}

export function invocationContext(triggerMetadata: Record<string, unknown> = {}): InvocationContext {
  return new InvocationContext({
    functionName: 'test',
    invocationId: 'invocation-1',
    triggerMetadata,
    logHandler: () => {},
  });
}

// fetch double: answers in order and records every call.
export function fakeFetch(...answers: Array<Response | Error>) {
  const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
  const impl = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    const answer = answers.shift();
    if (answer === undefined) {
      throw new Error('unexpected fetch');
    }
    if (answer instanceof Error) {
      throw answer;
    }
    return answer;
  }) as typeof fetch;
  return { impl, calls };
}

export function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}
