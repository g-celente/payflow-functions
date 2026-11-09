import { describe, expect, it } from 'vitest';

import { DependencyUnavailableError } from '../../src/domain/errors.js';
import { ConfigError, loadConfig } from '../../src/infrastructure/config.js';
import { FetchWebhookSender } from '../../src/infrastructure/fetch-webhook-sender.js';
import { HttpMerchantClient } from '../../src/infrastructure/http-merchant-client.js';
import { fakeFetch, json, MERCHANT_ID, SUBSCRIPTION } from '../support/fakes.js';

const INTERNAL_KEY = 'internal-key-0123456789abcdef0123456789';

function merchantClient(fetchImpl: typeof fetch, timeoutMs = 1000) {
  return new HttpMerchantClient({ baseUrl: 'http://merchant:8080', internalKey: INTERNAL_KEY, timeoutMs, fetchImpl });
}

describe('HttpMerchantClient', () => {
  it('reads the webhook with the internal key', async () => {
    const fetch = fakeFetch(json(200, { merchantId: MERCHANT_ID, ...SUBSCRIPTION }));
    expect(await merchantClient(fetch.impl).find(MERCHANT_ID)).toEqual(SUBSCRIPTION);
    expect(fetch.calls[0]?.url).toBe(`http://merchant:8080/v1/merchants/${MERCHANT_ID}/webhook`);
    expect(fetch.calls[0]?.init?.headers).toMatchObject({ 'x-internal-key': INTERNAL_KEY });
  });

  it('answers null on 404 (unknown merchant or no webhook)', async () => {
    const fetch = fakeFetch(json(404, { title: 'Not Found' }));
    expect(await merchantClient(fetch.impl).find(MERCHANT_ID)).toBeNull();
  });

  it.each([
    ['an error status', json(500, {}), 'bad-response'],
    ['an unexpected body', json(200, { url: 'not a url' }), 'bad-response'],
    ['no connection', new TypeError('fetch failed'), 'unreachable'],
  ])('throws DependencyUnavailableError on %s', async (_case, answer, reason) => {
    const fetch = fakeFetch(answer);
    await expect(merchantClient(fetch.impl).find(MERCHANT_ID)).rejects.toMatchObject({
      name: 'DependencyUnavailableError',
      dependency: 'merchant-service',
      reason,
    });
  });

  it('gives up after the timeout', async () => {
    const hanging = ((_url: string | URL | Request, init?: RequestInit) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
    })) as typeof fetch;
    await expect(merchantClient(hanging, 100).find(MERCHANT_ID)).rejects.toMatchObject({ reason: 'timeout' });
  });
});

describe('FetchWebhookSender', () => {
  const delivery = { url: 'https://loja.example/hooks', body: '{"id":"e1"}', headers: { 'x-payflow-event-id': 'e1' } };

  it('posts the body and headers without following redirects', async () => {
    const fetch = fakeFetch(new Response(null, { status: 204 }));
    await new FetchWebhookSender({ timeoutMs: 1000, fetchImpl: fetch.impl }).send(delivery);
    expect(fetch.calls[0]?.url).toBe(delivery.url);
    expect(fetch.calls[0]?.init).toMatchObject({
      method: 'POST',
      body: delivery.body,
      redirect: 'manual',
      headers: { 'x-payflow-event-id': 'e1' },
    });
  });

  it.each([
    ['a 5xx', new Response('down', { status: 503 }), 'rejected'],
    ['a redirect', new Response(null, { status: 302, headers: { location: 'https://elsewhere.example' } }), 'rejected'],
    ['no connection', new TypeError('fetch failed'), 'unreachable'],
  ])('throws on %s, so the message is delivered again', async (_case, answer, reason) => {
    const fetch = fakeFetch(answer);
    const sending = new FetchWebhookSender({ timeoutMs: 1000, fetchImpl: fetch.impl }).send(delivery);
    await expect(sending).rejects.toBeInstanceOf(DependencyUnavailableError);
    await expect(sending).rejects.toMatchObject({ dependency: 'webhook', reason });
  });
});

describe('loadConfig', () => {
  it('reads the settings with defaults for the timeouts', () => {
    expect(loadConfig({ MERCHANT_SERVICE_URL: 'http://merchant:8080', INTERNAL_KEY })).toEqual({
      merchantServiceUrl: 'http://merchant:8080',
      internalKey: INTERNAL_KEY,
      merchantServiceTimeoutMs: 5000,
      webhookTimeoutMs: 10000,
    });
  });

  it('names the invalid settings without printing their values', () => {
    const load = () => loadConfig({ MERCHANT_SERVICE_URL: 'nope', INTERNAL_KEY: 'short' });
    expect(load).toThrow(ConfigError);
    expect(load).toThrow(/MERCHANT_SERVICE_URL.*INTERNAL_KEY/);
    expect(load).not.toThrow(/short/);
  });
});
