// MDR (merchant discount rate) and settlement term per payment method. Fictitious rates for the demo.
export const FEE_RULES = {
  CARD: { rate: 0.0349, settlementDays: 30 },
  PIX: { rate: 0.0099, settlementDays: 0 },
} as const;

export type PaymentMethod = keyof typeof FEE_RULES;

export const PAYMENT_METHODS = Object.keys(FEE_RULES) as PaymentMethod[];

// The rates above are for the Brazilian real; the payment-service only charges in BRL.
export const SUPPORTED_CURRENCY = 'BRL';

export interface FeeRequest {
  // Gross approved volume per method, in cents (the payment-service summary's byMethod).
  readonly byMethod: Readonly<Record<string, number>>;
  readonly currency: string;
}

export interface FeeLine {
  readonly method: PaymentMethod;
  readonly gross: number;
  readonly rate: number;
  readonly fee: number;
  readonly settlement: string;
}

// Answer of POST /api/fees, read by the BFF for the panel. Amounts in cents.
export interface FeeBreakdown {
  readonly totalFees: number;
  readonly netAmount: number;
  readonly byMethod: readonly FeeLine[];
}

export class InvalidFeeRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidFeeRequestError';
  }
}

// One line per method sent, in the order of FEE_RULES. The fee is rounded to the nearest cent.
export function calculateFees(request: FeeRequest): FeeBreakdown {
  if (request.currency !== SUPPORTED_CURRENCY) {
    throw new InvalidFeeRequestError(`Only ${SUPPORTED_CURRENCY} is supported`);
  }
  const unknown = Object.keys(request.byMethod).filter((method) => !(PAYMENT_METHODS as string[]).includes(method));
  if (unknown.length > 0) {
    throw new InvalidFeeRequestError(`Unknown payment method: ${unknown.join(', ')}`);
  }
  const lines: FeeLine[] = [];
  for (const method of PAYMENT_METHODS) {
    const gross = request.byMethod[method];
    if (gross === undefined) {
      continue;
    }
    if (!Number.isSafeInteger(gross) || gross < 0) {
      throw new InvalidFeeRequestError(`${method} must be a non-negative amount in cents`);
    }
    const { rate, settlementDays } = FEE_RULES[method];
    lines.push({ method, gross, rate, fee: Math.round(gross * rate), settlement: `D+${settlementDays}` });
  }
  const totalFees = lines.reduce((sum, line) => sum + line.fee, 0);
  const grossTotal = lines.reduce((sum, line) => sum + line.gross, 0);
  return { totalFees, netAmount: grossTotal - totalFees, byMethod: lines };
}
