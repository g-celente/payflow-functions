import { HttpRequest } from '@azure/functions';
import { describe, expect, it } from 'vitest';

import { calculateFeesHttp } from '../../src/features/calculate-fees/function.js';
import { invocationContext } from '../support/fakes.js';

function post(body: string): HttpRequest {
  return new HttpRequest({ method: 'POST', url: 'http://localhost:7071/api/fees', body: { string: body } });
}

describe('calculate-fees (POST /api/fees)', () => {
  it('answers the fees in the format the BFF reads', async () => {
    const response = await calculateFeesHttp(
      post(JSON.stringify({ byMethod: { CARD: 90000, PIX: 35000 }, currency: 'BRL' })),
      invocationContext(),
    );
    expect(response.status).toBe(200);
    expect(response.jsonBody).toMatchObject({ totalFees: 3488, netAmount: 121512 });
  });

  it.each([
    ['not JSON', 'nope', 'The body must be JSON'],
    ['wrong shape', JSON.stringify({ byMethod: [], currency: 'BRL' }), 'Expected { byMethod'],
    ['unknown method', JSON.stringify({ byMethod: { BOLETO: 1 }, currency: 'BRL' }), 'Unknown payment method'],
    ['other currency', JSON.stringify({ byMethod: { CARD: 1 }, currency: 'USD' }), 'Only BRL'],
  ])('answers 400 Problem Details for %s', async (_case, body, detail) => {
    const response = await calculateFeesHttp(post(body), invocationContext());
    expect(response.status).toBe(400);
    expect(response.headers).toEqual({ 'content-type': 'application/problem+json' });
    expect(JSON.parse(String(response.body))).toMatchObject({ status: 400, title: 'Bad Request' });
    expect(String(response.body)).toContain(detail);
  });
});
