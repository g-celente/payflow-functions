import { z } from 'zod';

// Settings of deliver-webhook (App Settings in Azure, local.settings.json locally).
// ServiceBusConnection and SERVICEBUS_QUEUE are read by the Functions host itself, not here.
const EnvSchema = z.object({
  MERCHANT_SERVICE_URL: z.url(),
  INTERNAL_KEY: z.string().min(32).max(256),
  MERCHANT_SERVICE_TIMEOUT_MS: z.coerce.number().int().min(100).max(60_000).default(5000),
  WEBHOOK_TIMEOUT_MS: z.coerce.number().int().min(100).max(60_000).default(10_000),
});

export interface Config {
  readonly merchantServiceUrl: string;
  readonly internalKey: string;
  readonly merchantServiceTimeoutMs: number;
  readonly webhookTimeoutMs: number;
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

// Names the invalid variables without ever printing their values (INTERNAL_KEY is a secret).
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const result = EnvSchema.safeParse(env);
  if (!result.success) {
    const problems = result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
    throw new ConfigError(`Invalid environment: ${problems.join('; ')}`);
  }
  const value = result.data;
  return {
    merchantServiceUrl: value.MERCHANT_SERVICE_URL,
    internalKey: value.INTERNAL_KEY,
    merchantServiceTimeoutMs: value.MERCHANT_SERVICE_TIMEOUT_MS,
    webhookTimeoutMs: value.WEBHOOK_TIMEOUT_MS,
  };
}
