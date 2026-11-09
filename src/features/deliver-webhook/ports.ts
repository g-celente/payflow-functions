import type { WebhookSubscription } from '../../domain/payment-event.js';

// Implemented by the merchant-service client. null: the merchant does not exist or has no webhook.
export interface WebhookConfigProvider {
  find(merchantId: string): Promise<WebhookSubscription | null>;
}

export interface WebhookDelivery {
  readonly url: string;
  readonly body: string;
  readonly headers: Readonly<Record<string, string>>;
}

// Implemented by the HTTP sender. Resolves only on a 2xx; anything else throws DependencyUnavailableError.
export interface WebhookSender {
  send(delivery: WebhookDelivery): Promise<void>;
}

export interface DeliverWebhookPorts {
  readonly webhooks: WebhookConfigProvider;
  readonly sender: WebhookSender;
  readonly now: () => Date;
}
