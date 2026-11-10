import React from 'react';
import { render } from '@testing-library/react-native';
import { ReadReceiptIcon } from '../ReadReceiptIcon';

const labels = { sending: 'Sending', sent: 'Sent', seen: 'Seen by everyone' };

function show(status: 'sending' | 'sent' | 'seen') {
  return render(<ReadReceiptIcon status={status} bubbleColor="#1D4ED8" labels={labels} />);
}

it.each([
  ['sending', 'Sending'],
  ['sent', 'Sent'],
  ['seen', 'Seen by everyone'],
] as const)('renders the %s state, named for screen readers', (status, label) => {
  const r = show(status);
  const icon = r.getByTestId(`read-receipt-${status}`);
  expect(icon.props.accessibilityLabel).toBe(label);
});

it('renders only the state it is given', () => {
  const r = show('sent');
  expect(r.queryByTestId('read-receipt-sending')).toBeNull();
  expect(r.queryByTestId('read-receipt-seen')).toBeNull();
});

it('the seen camera is drawn so its lens is cut out in the bubble colour (not a white blob)', () => {
  const r = show('seen');
  const json = JSON.stringify(r.toJSON());
  // react-native-svg's test renderer reports colours as ARGB integers.
  expect(json).toContain('"fill":{"type":0,"payload":4294967295}'); // the body: opaque white
  expect(json).toContain('"fill":{"type":0,"payload":4280110808}'); // the lens: 0xFF1D4ED8, the bubble colour
});

it('sending and sent are tones of white, so they show on a coloured bubble', () => {
  for (const status of ['sending', 'sent'] as const) {
    expect(JSON.stringify(show(status).toJSON())).toContain('rgba(255,255,255,0.7)');
  }
});
