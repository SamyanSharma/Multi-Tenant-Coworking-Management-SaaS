import { slugify, slugifyWithSuffix } from './slugify.util';

describe('slugify', () => {
  it('lowercases and hyphenates spaces', () => {
    expect(slugify('Acme Coworking')).toBe('acme-coworking');
  });

  it('strips punctuation', () => {
    expect(slugify('Acme Coworking!!')).toBe('acme-coworking');
  });

  it('collapses repeated separators', () => {
    expect(slugify('Acme   ---  Coworking')).toBe('acme-coworking');
  });

  it('trims leading/trailing hyphens', () => {
    expect(slugify('  --Acme Coworking--  ')).toBe('acme-coworking');
  });

  it('truncates very long names to 50 chars', () => {
    const longName = 'a'.repeat(100);
    expect(slugify(longName).length).toBeLessThanOrEqual(50);
  });

  it('returns an empty string for input with no alphanumerics', () => {
    expect(slugify('!!!')).toBe('');
  });
});

describe('slugifyWithSuffix', () => {
  it('appends a random suffix after the base slug', () => {
    const result = slugifyWithSuffix('Acme Coworking');
    expect(result).toMatch(/^acme-coworking-[a-z0-9]{5}$/);
  });

  it('falls back to "space" as the base when the name has no alphanumerics', () => {
    const result = slugifyWithSuffix('!!!');
    expect(result).toMatch(/^space-[a-z0-9]{5}$/);
  });

  it('produces different suffixes on repeated calls (not deterministic)', () => {
    const a = slugifyWithSuffix('Acme');
    const b = slugifyWithSuffix('Acme');
    // Astronomically unlikely to collide; if this ever flakes, the
    // random suffix generation itself is broken.
    expect(a).not.toBe(b);
  });
});
