import { EMPTY_DEMO_CONFIG, isCommunityOnSide, isCourseOnSide, isSameSide, parseDemoConfig } from '../demoSides';

const cfg = parseDemoConfig({ uids: ['d1', 'd2'], neutralUids: ['adm'], communityIds: ['dc'] });

describe('isSameSide', () => {
  it('lets real see real and demo see demo', () => {
    expect(isSameSide(cfg, 'r1', 'r2')).toBe(true);
    expect(isSameSide(cfg, 'd1', 'd2')).toBe(true);
  });
  it('hides each side from the other, both directions', () => {
    expect(isSameSide(cfg, 'r1', 'd1')).toBe(false);
    expect(isSameSide(cfg, 'd1', 'r1')).toBe(false);
  });
  it('never hides an admin or BAMA itself, from either side', () => {
    for (const n of ['adm', 'bama-system']) {
      expect(isSameSide(cfg, 'r1', n)).toBe(true);
      expect(isSameSide(cfg, 'd1', n)).toBe(true);
      expect(isSameSide(cfg, n, 'd1')).toBe(true);
    }
  });
  it('with no config doc, hides nobody', () => {
    expect(isSameSide(EMPTY_DEMO_CONFIG, 'r1', 'd1')).toBe(true);
    expect(isSameSide(parseDemoConfig(null), 'd1', 'r1')).toBe(true);
  });
  it('passes when either uid is unknown (signed out, missing poster)', () => {
    expect(isSameSide(cfg, undefined, 'd1')).toBe(true);
    expect(isSameSide(cfg, 'd1', null)).toBe(true);
  });
});

describe('isCommunityOnSide', () => {
  it('shows demo communities to demo users only, and real ones to real users only', () => {
    expect(isCommunityOnSide(cfg, 'd1', 'dc')).toBe(true);
    expect(isCommunityOnSide(cfg, 'r1', 'dc')).toBe(false);
    expect(isCommunityOnSide(cfg, 'r1', 'rc')).toBe(true);
    expect(isCommunityOnSide(cfg, 'd1', 'rc')).toBe(false);
  });
  it('a community OWNED by a demo account is demo with no config entry', () => {
    expect(isCommunityOnSide(cfg, 'r1', 'unlisted', 'd2')).toBe(false);
    expect(isCommunityOnSide(cfg, 'd1', 'unlisted', 'd2')).toBe(true);
    expect(isCommunityOnSide(cfg, 'd1', 'unlisted', 'r9')).toBe(false);
  });
  it('shows everything to an admin', () => {
    expect(isCommunityOnSide(cfg, 'adm', 'dc')).toBe(true);
    expect(isCommunityOnSide(cfg, 'adm', 'rc')).toBe(true);
  });
});

describe('isCourseOnSide', () => {
  it('demo-only courses for demo accounts only; other courses for everyone else', () => {
    expect(isCourseOnSide(cfg, 'd1', true)).toBe(true);
    expect(isCourseOnSide(cfg, 'r1', true)).toBe(false);
    expect(isCourseOnSide(cfg, 'r1', undefined)).toBe(true);
    expect(isCourseOnSide(cfg, 'd1', undefined)).toBe(false);
  });
  it('admins see every course; with no config nobody is demo', () => {
    expect(isCourseOnSide(cfg, 'adm', true)).toBe(true);
    expect(isCourseOnSide(EMPTY_DEMO_CONFIG, 'r1', undefined)).toBe(true);
  });
});

describe('parseDemoConfig', () => {
  it('ignores malformed fields rather than throwing', () => {
    expect(parseDemoConfig({ uids: 'd1', neutralUids: [1, 'a'] })).toEqual({ uids: [], neutralUids: ['a'], communityIds: [] });
  });
});
