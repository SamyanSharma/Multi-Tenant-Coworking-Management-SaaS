// Turns "Acme Coworking!!" into "acme-coworking". Used at signup time
// since self-serve Space Managers pick a space *name*, not a slug —
// POST /spaces (the PLATFORM_ADMIN route) still requires callers to
// supply a slug directly, this is a signup-only convenience.
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
}

// Appends a short random suffix — used when the plain slugified name
// is already taken by another Space.
export function slugifyWithSuffix(input: string): string {
  const base = slugify(input) || 'space';
  const suffix = Math.random().toString(36).slice(2, 7);
  return `${base}-${suffix}`;
}
