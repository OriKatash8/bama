import { createDevTimer, startPickTiming } from '../pickTiming';

describe('dev timers', () => {
  const g = global as { __DEV__?: boolean };
  const dev = g.__DEV__;
  afterEach(() => { g.__DEV__ = dev; jest.restoreAllMocks(); });

  it('log "[prefix] step +Xms (total Yms)" in dev', () => {
    const log = jest.spyOn(console, 'log').mockImplementation(() => {});
    createDevTimer('trim').mark('showEditor called');
    expect(String(log.mock.calls[0][0])).toMatch(/^\[trim\] showEditor called \+\d+ms \(total \d+ms\)$/);
  });

  it('startPickTiming keeps its [pick:label] tag', () => {
    const log = jest.spyOn(console, 'log').mockImplementation(() => {});
    startPickTiming('chat').mark('picker resolved');
    expect(String(log.mock.calls[0][0])).toMatch(/^\[pick:chat\] picker resolved /);
  });

  it('log nothing in a release build', () => {
    g.__DEV__ = false;
    const log = jest.spyOn(console, 'log').mockImplementation(() => {});
    createDevTimer('trim').mark('x');
    startPickTiming('chat').mark('y');
    expect(log).not.toHaveBeenCalled();
  });
});
