import { grossFee, outstandingFee, owesFee, feePercent } from '../fee';
import type { ProjectFee } from '@core/types/project';

const fee = (over: Partial<ProjectFee> = {}): ProjectFee => ({
  professionalId: 'pro1',
  feeStatus: 'owed',
  feeRate: 0.03,
  baseAmount: 1000,
  slotActive: true,
  ...over,
});

describe('grossFee', () => {
  it('is the rate applied to this pro own amount, rounded', () => {
    expect(grossFee(fee({ baseAmount: 500 }))).toBe(15);
    expect(grossFee(fee({ baseAmount: 3000 }))).toBe(90);
  });

  it('rounds to the nearest shekel', () => {
    expect(grossFee(fee({ baseAmount: 333 }))).toBe(10); // 9.99
  });

  it('uses the fee doc own rate, not the current constant', () => {
    expect(grossFee(fee({ baseAmount: 1000, feeRate: 0.05 }))).toBe(50);
  });
});

describe('outstandingFee / owesFee — the three completed-row states', () => {
  it('NON-SUBSCRIBER who owes: outstanding is the full fee', () => {
    const f = fee({ feeStatus: 'owed', baseAmount: 500, feeDue: 15 });
    expect(outstandingFee(f)).toBe(15);
    expect(owesFee(f)).toBe(true);
  });

  it('SUBSCRIBER (feeStatus "included"): owes nothing, so the trash stays', () => {
    const f = fee({ feeStatus: 'included', baseAmount: 500 });
    expect(outstandingFee(f)).toBe(0);
    expect(owesFee(f)).toBe(false);
  });

  it('EXEMPT legacy project WITH a fee doc: owes nothing', () => {
    const f = fee({ feeStatus: 'exempt', baseAmount: 500 });
    expect(outstandingFee(f)).toBe(0);
    expect(owesFee(f)).toBe(false);
  });

  it('EXEMPT legacy project with NO fee doc at all: owes nothing', () => {
    // listenToMyFees returns nothing for these, so the row gets undefined/null.
    expect(outstandingFee(null)).toBe(0);
    expect(outstandingFee(undefined)).toBe(0);
    expect(owesFee(null)).toBe(false);
    expect(owesFee(undefined)).toBe(false);
  });

  it('already paid: owes nothing even while feeStatus stays "owed"', () => {
    // feeStatus is immutable by design and remains 'owed' forever after payment.
    const f = fee({ feeStatus: 'owed', feeDue: 0, feePaid: true, paidAmount: 30 });
    expect(outstandingFee(f)).toBe(0);
    expect(owesFee(f)).toBe(false);
  });
});

describe('outstandingFee before completion (feeDue unset)', () => {
  it('derives from baseAmount when the server has not set feeDue yet', () => {
    expect(outstandingFee(fee({ baseAmount: 3000 }))).toBe(90);
  });

  it('credits an early payment — the §5 top-up case', () => {
    // Paid 90 early at 3,000; price rose to 5,000 -> gross 150, owes the delta.
    expect(outstandingFee(fee({ baseAmount: 5000, paidAmount: 90 }))).toBe(60);
  });

  it('floors at zero when the price fell after an early payment (no refund)', () => {
    expect(outstandingFee(fee({ baseAmount: 1000, paidAmount: 90 }))).toBe(0);
  });

  it('prefers the server feeDue once completion has set it', () => {
    // feeDue is stored NET of paidAmount, so it wins over any local derivation.
    expect(outstandingFee(fee({ baseAmount: 5000, paidAmount: 90, feeDue: 60 }))).toBe(60);
  });
});

describe('feePercent', () => {
  it('renders the rate as a whole number for interpolation', () => {
    expect(feePercent(fee())).toBe(3);
    expect(feePercent(fee({ feeRate: 0.05 }))).toBe(5);
    expect(feePercent(null)).toBe(3); // falls back to the pricing constant
  });
});
