import { z } from 'zod';

import { DependencyUnavailableError } from '../domain/errors.js';
import type { WebhookSubscription } from '../domain/payment-event.js';
import type { WebhookConfigProvider } from '../features/deliver-webhook/ports.js';

const WebhookAnswer = z.object({
  url: z.url(),
  secret: z.string().min(1),
  events: z.array(z.string()),
});

export interface HttpMerchantClientOptions {
  readonly baseUrl: string;
  readonly internalKey: string;
  readonly timeoutMs: number;
  readonly fetchImpl?: typeof fetch;
}

// merchant-service GET /v1/merchants/{id}/webhook (internal route, X-Internal-Key). It answers 404 both for an
// unknown merchant and for one without webhook: either way there is nowhere to deliver, so the event is dropped.
export class HttpMerchantClient implements WebhookConfigProvider {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: HttpMerchantClientOptions) {
    this.baseUrl = options.baseUrl.endsWith('/') ? options.baseUrl : `${options.baseUrl}/`;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async find(merchantId: string): Promise<WebhookSubscription | null> {
    const url = new URL(`v1/merchants/${encodeURIComponent(merchantId)}/webhook`, this.baseUrl);
    const signal = AbortSignal.timeout(this.options.timeoutMs);
    let response: Response;
    let body: unknown;
    try {
      response = await this.fetchImpl(url, {
        headers: { accept: 'application/json', 'x-internal-key': this.options.internalKey },
        signal,
      });
      body = response.status === 200 ? await response.json() : await response.text();
    } catch (failure) {
      if (signal.aborted) {
        throw new DependencyUnavailableError('merchant-service', 'timeout',
          `merchant-service did not answer in ${this.options.timeoutMs} ms`);
      }
      throw new DependencyUnavailableError('merchant-service', 'unreachable',
        `merchant-service is unreachable (${(failure as Error).message})`);
    }
    if (response.status === 404) {
      return null;
    }
    if (response.status !== 200) {
      throw new DependencyUnavailableError('merchant-service', 'bad-response',
        `merchant-service answered HTTP ${response.status}`);
    }
    const parsed = WebhookAnswer.safeParse(body);
    if (!parsed.success) {
      throw new DependencyUnavailableError('merchant-service', 'bad-response',
        'merchant-service answered an unexpected webhook body');
    }
    return parsed.data;
  }
}
