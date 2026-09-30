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

// "$5.00/hr · $40.00/day" for a desk/room tile. A resource with neither rate
// set is billed at the space's flat price (see calculateAmountCents in the
// backend), which the tile does not know, so it says so instead of a number.
export function formatRates(
  hourlyRateCents: number | null | undefined,
  dailyRateCents: number | null | undefined,
): string {
  const parts: string[] = [];
  if (hourlyRateCents != null) parts.push(`${formatCents(hourlyRateCents)}/hr`);
  if (dailyRateCents != null) parts.push(`${formatCents(dailyRateCents)}/day`);
  return parts.length ? parts.join(' · ') : 'Standard space rate';
}
