jest.mock('firebase/firestore', () => ({ doc: jest.fn(), onSnapshot: jest.fn() }));
jest.mock('@core/firebase/config', () => ({ db: {} }));
jest.mock('@core/firebase/functions', () => ({ callFunction: jest.fn() }));

import { ownerTransferErrorKey } from '../ownerTransferService';

describe('ownerTransferErrorKey', () => {
  it.each([
    ['offer_expired', 'functions/failed-precondition', 'offer_expired'],
    ['owner_changed', 'functions/failed-precondition', 'owner_changed'],
    ['recipient_left', 'functions/failed-precondition', 'recipient_left'],
    ['target_not_member', 'functions/failed-precondition', 'target_not_member'],
    ['offer_pending', 'functions/failed-precondition', 'offer_pending'],
    ['not_owner', 'functions/permission-denied', 'not_owner'],
    ['email_not_verified', 'functions/failed-precondition', 'email_not_verified'],
    ['demo-isolation', 'functions/failed-precondition', 'demo_isolation'],
    ['rate_limited', 'functions/resource-exhausted', 'rate_limited'],
  ])('%s → %s', (message, code, key) => {
    expect(ownerTransferErrorKey({ code, message })).toBe(key);
  });

  it('maps connection trouble and anything unknown', () => {
    expect(ownerTransferErrorKey({ code: 'functions/unavailable', message: 'x' })).toBe('network');
    expect(ownerTransferErrorKey(new Error('boom'))).toBe('generic');
    expect(ownerTransferErrorKey(undefined)).toBe('generic');
  });
});
