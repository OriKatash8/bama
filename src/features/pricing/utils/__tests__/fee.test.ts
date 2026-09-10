import { grossFee, outstandingFee, owesFee, feePercent, isMinimumFee, calculatedFee } from '../fee';
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

describe('grossFee — the commission floor, mirroring the server', () => {
  it('takes the floor when the percentage falls short', () => {
    expect(grossFee(fee({ baseAmount: 100, minFeeApplied: 6 }))).toBe(6); // 3
    expect(grossFee(fee({ baseAmount: 20, minFeeApplied: 6 }))).toBe(6);  // 1
  });

  it('takes the percentage when it clears the floor', () => {
    expect(grossFee(fee({ baseAmount: 5000, minFeeApplied: 6 }))).toBe(150);
  });

  it('holds at the exact boundary', () => {
    expect(grossFee(fee({ baseAmount: 200, minFeeApplied: 6 }))).toBe(6);
    expect(grossFee(fee({ baseAmount: 234, minFeeApplied: 6 }))).toBe(7);
  });

  it('charges the floor on a zero base', () => {
    expect(grossFee(fee({ baseAmount: 0, minFeeApplied: 6 }))).toBe(6);
  });

  it('leaves a record with NO minFeeApplied exactly as it was — no backfill', () => {
    // The real production record at baseAmount 123 must stay 4, not become 6.
    expect(grossFee(fee({ baseAmount: 123 }))).toBe(4);
    expect(grossFee(fee({ baseAmount: 100 }))).toBe(3);
  });

  it('uses the record own floor, not a current constant', () => {
    expect(grossFee(fee({ baseAmount: 100, minFeeApplied: 10 }))).toBe(10);
  });
});

describe('isMinimumFee / calculatedFee — so the pro sees the arithmetic', () => {
  it('is true only when the floor is what set the amount', () => {
    expect(isMinimumFee(fee({ baseAmount: 100, minFeeApplied: 6 }))).toBe(true);
    expect(isMinimumFee(fee({ baseAmount: 5000, minFeeApplied: 6 }))).toBe(false);
  });

  it('is false at the boundary, where the percentage reaches the floor on its own', () => {
    expect(isMinimumFee(fee({ baseAmount: 200, minFeeApplied: 6 }))).toBe(false);
  });

  it('is false for a record with no floor, whatever the amount', () => {
    expect(isMinimumFee(fee({ baseAmount: 1 }))).toBe(false);
    expect(isMinimumFee(null)).toBe(false);
  });

  it('calculatedFee reports the percentage alone, floor NOT applied', () => {
    expect(calculatedFee(fee({ baseAmount: 100, minFeeApplied: 6 }))).toBe(3);
  });
});

describe('the floor never CREATES a fee', () => {
  it('exempt owes nothing even with a floor on the record', () => {
    expect(outstandingFee(fee({ feeStatus: 'exempt', baseAmount: 100, minFeeApplied: 6 }))).toBe(0);
  });

  it('a voided fee (cancelled / removed) owes nothing — feeDue 0 wins', () => {
    // cancelProject and freeSlot write a literal feeDue: 0 and leave feeStatus
    // at 'owed'. The floor must not resurrect those.
    const voided = fee({ feeStatus: 'owed', baseAmount: 100, minFeeApplied: 6, feeDue: 0 });
    expect(outstandingFee(voided)).toBe(0);
    expect(owesFee(voided)).toBe(false);
  });

  it('a paid fee stays paid', () => {
    expect(outstandingFee(fee({ baseAmount: 100, minFeeApplied: 6, feePaid: true }))).toBe(0);
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
