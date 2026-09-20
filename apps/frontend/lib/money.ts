// Amounts from the API are integer USD cents (the backend is USD-only).
export function formatCents(cents: number | null | undefined): string {
  const value = (cents ?? 0) / 100;
  return value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// "+50%" / "-12%" / "—" (null = there was nothing to compare against).
export function formatChangePct(pct: number | null | undefined): string {
  if (pct === null || pct === undefined) return '—';
  return `${pct > 0 ? '+' : ''}${pct}%`;
}
