import { createHmac } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { signWebhook } from '../../src/domain/webhook-signature.js';

describe('signWebhook', () => {
  const signedAt = new Date('2026-10-26T20:00:00.900Z');
  const body = '{"id":"e1","type":"payment.authorized"}';

  it('signs "<unix seconds>.<body>" with HMAC-SHA256 of the merchant secret', () => {
    const expected = createHmac('sha256', 'store-secret-0123456789').update(`1793044800.${body}`).digest('hex');
    expect(signWebhook('store-secret-0123456789', body, signedAt)).toBe(`t=1793044800,v1=${expected}`);
  });

  it('changes with the secret, the body and the time', () => {
    const base = signWebhook('secret-a-0123456789', body, signedAt);
    expect(signWebhook('secret-b-0123456789', body, signedAt)).not.toBe(base);
    expect(signWebhook('secret-a-0123456789', `${body} `, signedAt)).not.toBe(base);
    expect(signWebhook('secret-a-0123456789', body, new Date('2026-10-26T20:00:01Z'))).not.toBe(base);
  });
});
