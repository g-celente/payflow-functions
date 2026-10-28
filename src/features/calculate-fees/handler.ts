import { calculateFees, type FeeBreakdown, type FeeRequest } from '../../domain/fees.js';

// Use case: fees, net amount and settlement term for the totals the BFF sends from the payment summary.
// Pure calculation, no ports: the rates live in the domain.
export function handleCalculateFees(request: FeeRequest): FeeBreakdown {
  return calculateFees(request);
}
