
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
