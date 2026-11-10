import { createReadMarker } from '../readMarker';

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

function make(minGap = 2500) {
  const write = jest.fn();
  let t = 0;
  const marker = createReadMarker(write, minGap, () => t);
  return { write, marker, advance: (ms: number) => { t += ms; jest.advanceTimersByTime(ms); } };
}

it('writes at once the first time', () => {
  const { write, marker } = make();
  marker.request();
  expect(write).toHaveBeenCalledTimes(1);
});

it('a burst inside the window becomes ONE trailing write', () => {
  const { write, marker, advance } = make();
  marker.request();               // immediate
  advance(500);
  marker.request();
  marker.request();
  marker.request();
  expect(write).toHaveBeenCalledTimes(1);
  expect(marker.pending).toBe(true);
  advance(2000);                  // the gap has now passed
  expect(write).toHaveBeenCalledTimes(2);
  expect(marker.pending).toBe(false);
});

it('writes immediately again once the gap has passed', () => {
  const { write, marker, advance } = make();
  marker.request();
  advance(3000);
  marker.request();
  expect(write).toHaveBeenCalledTimes(2);
});

it('cancel() drops the trailing write — nothing is marked read after leaving', () => {
  const { write, marker, advance } = make();
  marker.request();               // immediate write while the user was there
  advance(500);
  marker.request();               // a new message arrives inside the window
  expect(marker.pending).toBe(true);
  marker.cancel();                // blur / background / unmount
  expect(marker.pending).toBe(false);
  advance(10_000);
  expect(write).toHaveBeenCalledTimes(1);
});

it('cancel() with nothing pending is harmless, and requests work afterwards', () => {
  const { write, marker, advance } = make();
  marker.cancel();
  advance(5000);
  marker.request();
  expect(write).toHaveBeenCalledTimes(1);
});
