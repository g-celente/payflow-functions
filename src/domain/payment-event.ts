// Payment events published by the payment-service (CloudEvents 1.0, structured mode).
// Contract: payflow-payment-service/docs/asyncapi.yaml.
export const PAYMENT_EVENT_TYPES = [
  'payment.authorized',
  'payment.declined',
  'payment.pending',
  'payment.confirmed',
  'payment.refunded',
  'payment.canceled',
] as const;

export type PaymentEventType = (typeof PAYMENT_EVENT_TYPES)[number];

// What deliver-webhook needs from the event; the store receives the whole event, untouched, as `body`.
export interface PaymentEvent {
  readonly id: string;
  readonly type: PaymentEventType;
  readonly merchantId: string;
  readonly paymentId: string;
  // Serialized CloudEvent: exactly the bytes that are signed and posted.
  readonly body: string;
}

// Where and what to send for one merchant (merchant-service GET /v1/merchants/{id}/webhook).
export interface WebhookSubscription {
  readonly url: string;
  readonly secret: string;
  readonly events: readonly string[];
}

export function isSubscribed(subscription: WebhookSubscription, type: PaymentEventType): boolean {
  return subscription.events.includes(type);
}
