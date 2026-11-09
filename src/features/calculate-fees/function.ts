import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from '@azure/functions';
import { z } from 'zod';

import { InvalidFeeRequestError } from '../../domain/fees.js';
import { handleCalculateFees } from './handler.js';

// Shape check only; the domain decides which methods and currency are valid.
const FeeRequestBody = z.object({
  byMethod: z.record(z.string(), z.number()),
  currency: z.string(),
});

// POST /api/fees { byMethod: { CARD: 90000, PIX: 35000 }, currency: "BRL" }, called by the BFF for /aggregated-data.
export async function calculateFeesHttp(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return problem(400, 'Bad Request', 'The body must be JSON');
  }
  const parsed = FeeRequestBody.safeParse(body);
  if (!parsed.success) {
    return problem(400, 'Bad Request', 'Expected { byMethod: { <method>: <cents> }, currency }');
  }
  try {
    return { status: 200, jsonBody: handleCalculateFees(parsed.data) };
  } catch (failure) {
    if (failure instanceof InvalidFeeRequestError) {
      return problem(400, 'Bad Request', failure.message);
    }
    context.error('calculate-fees failed', failure);
    return problem(500, 'Internal Server Error', 'Fees could not be calculated');
  }
}

// authLevel function: callers send the function key in x-functions-key (the BFF's FEES_FUNCTION_KEY).
export function registerCalculateFees(): void {
  app.http('calculate-fees', {
    methods: ['POST'],
    authLevel: 'function',
    route: 'fees',
    handler: calculateFeesHttp,
  });
}

// Errors as RFC 9457 Problem Details, like the other PayFlow APIs.
function problem(status: number, title: string, detail: string): HttpResponseInit {
  return {
    status,
    headers: { 'content-type': 'application/problem+json' },
    body: JSON.stringify({ type: 'about:blank', title, status, detail }),
  };
}
