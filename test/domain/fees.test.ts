import { describe, expect, it } from 'vitest';

import { calculateFees, InvalidFeeRequestError } from '../../src/domain/fees.js';

describe('calculateFees', () => {
  it('applies the rate and settlement term of each method (README example)', () => {
    expect(calculateFees({ byMethod: { CARD: 90000, PIX: 35000 }, currency: 'BRL' })).toEqual({
      totalFees: 3488,
      netAmount: 121512,
      byMethod: [
        { method: 'CARD', gross: 90000, rate: 0.0349, fee: 3141, settlement: 'D+30' },
        { method: 'PIX', gross: 35000, rate: 0.0099, fee: 347, settlement: 'D+0' },
      ],
    });
  });

  it('keeps the rule order whatever the order of the request', () => {
    const fees = calculateFees({ byMethod: { PIX: 100, CARD: 100 }, currency: 'BRL' });
    expect(fees.byMethod.map((line) => line.method)).toEqual(['CARD', 'PIX']);
  });

  it('answers a zero line for a method without volume and only the methods sent', () => {
    expect(calculateFees({ byMethod: { CARD: 0 }, currency: 'BRL' })).toEqual({
      totalFees: 0,
      netAmount: 0,
      byMethod: [{ method: 'CARD', gross: 0, rate: 0.0349, fee: 0, settlement: 'D+30' }],
    });
    expect(calculateFees({ byMethod: {}, currency: 'BRL' })).toEqual({ totalFees: 0, netAmount: 0, byMethod: [] });
  });

  it('rounds each fee to the nearest cent', () => {
    // 150 * 0.0099 = 1.485 -> 1; 152 * 0.0099 = 1.5048 -> 2
    expect(calculateFees({ byMethod: { PIX: 150 }, currency: 'BRL' }).totalFees).toBe(1);
    expect(calculateFees({ byMethod: { PIX: 152 }, currency: 'BRL' }).totalFees).toBe(2);
  });

  it.each([
    [{ byMethod: { CARD: 100 }, currency: 'USD' }, 'Only BRL'],
    [{ byMethod: { BOLETO: 100 }, currency: 'BRL' }, 'Unknown payment method: BOLETO'],
    [{ byMethod: { CARD: -1 }, currency: 'BRL' }, 'CARD must be a non-negative amount'],
    [{ byMethod: { PIX: 10.5 }, currency: 'BRL' }, 'PIX must be a non-negative amount'],
  ])('refuses %j', (request, message) => {
    expect(() => calculateFees(request)).toThrow(InvalidFeeRequestError);
    expect(() => calculateFees(request)).toThrow(message);
  });
});
