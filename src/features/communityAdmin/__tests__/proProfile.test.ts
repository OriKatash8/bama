import { hasUsableProProfile } from '../proProfile';

describe('hasUsableProProfile (derived from the profile data, not a stored flag)', () => {
  it('needs a display name AND at least one role', () => {
    expect(hasUsableProProfile({ name: 'Noa', roleIds: ['editor'] })).toBe(true);
    expect(hasUsableProProfile({ name: 'Noa', roleIds: [] })).toBe(false);
    expect(hasUsableProProfile({ name: '', roleIds: ['editor'] })).toBe(false);
    expect(hasUsableProProfile({ name: '   ', roleIds: ['editor'] })).toBe(false);
  });

  it('does not read proProfileCompleted: that flag is undefined for everyone until the forced-completion work ships', () => {
    // Extra keys are ignored; the answer comes from name + roles only.
    const withFlagFalse = { name: 'Noa', roleIds: ['editor'], proProfileCompleted: false } as { name: string; roleIds: string[] };
    expect(hasUsableProProfile(withFlagFalse)).toBe(true);
  });
});
