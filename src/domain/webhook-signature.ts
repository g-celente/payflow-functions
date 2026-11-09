import { createHmac } from 'node:crypto';

// X-PayFlow-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256(secret, "<t>.<body>")>.
// The store recomputes the HMAC with its secret and rejects old timestamps (replay protection).
// node:crypto is the only import outside the domain: the HMAC is the signing rule itself.
export function signWebhook(secret: string, body: string, signedAt: Date): string {
  const timestamp = Math.floor(signedAt.getTime() / 1000);
  const digest = createHmac('sha256', secret).update(`${timestamp}.${body}`, 'utf8').digest('hex');
  return `t=${timestamp},v1=${digest}`;
}
