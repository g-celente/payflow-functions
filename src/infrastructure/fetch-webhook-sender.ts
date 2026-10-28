import { DependencyUnavailableError } from '../domain/errors.js';
import type { WebhookDelivery, WebhookSender } from '../features/deliver-webhook/ports.js';

export interface FetchWebhookSenderOptions {
  readonly timeoutMs: number;
  readonly fetchImpl?: typeof fetch;
}

// POST to the store. Only a 2xx counts as delivered; redirects are not followed, so the signed body never
// reaches a URL the merchant did not configure.
export class FetchWebhookSender implements WebhookSender {
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: FetchWebhookSenderOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async send(delivery: WebhookDelivery): Promise<void> {
    const signal = AbortSignal.timeout(this.options.timeoutMs);
    let status: number;
    try {
      const response = await this.fetchImpl(delivery.url, {
        method: 'POST',
        headers: { ...delivery.headers, 'user-agent': 'PayFlow-Webhooks/1.0' },
        body: delivery.body,
        redirect: 'manual',
        signal,
      });
      status = response.status;
      // The store's answer is not used; reading it frees the connection.
      await response.arrayBuffer();
    } catch (failure) {
      if (signal.aborted) {
        throw new DependencyUnavailableError('webhook', 'timeout', `The store did not answer in ${this.options.timeoutMs} ms`);
      }
      throw new DependencyUnavailableError('webhook', 'unreachable',
        `The store is unreachable (${(failure as Error).message})`);
    }
    if (status < 200 || status >= 300) {
      throw new DependencyUnavailableError('webhook', 'rejected', `The store answered HTTP ${status}`);
    }
  }
}
