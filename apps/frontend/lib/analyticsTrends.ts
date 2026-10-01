// Shapes the response of GET /analytics/trends into what the charts draw.
// Kept free of React/recharts so it can be unit tested.

export interface TrendPoint {
  date: string; // 'YYYY-MM-DD', a UTC day
  bookings: number;
  revenueCents: number;
}

export interface Trends {
  days: number;
  series: TrendPoint[];
  byType: { desk: number; room: number };
}

export interface ChartPoint {
  date: string;
  label: string; // 'Sep 12'
  bookings: number;
  revenue: number; // dollars
}

// 'Sep 12' for a 'YYYY-MM-DD' UTC day. Parsed and formatted as UTC so the
// label never slips a day in a timezone behind/ahead of the server's buckets.
export function dayLabel(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

export function toChartSeries(series: TrendPoint[]): ChartPoint[] {
  return series.map((p) => ({
    date: p.date,
    label: dayLabel(p.date),
    bookings: p.bookings,
    revenue: p.revenueCents / 100,
  }));
}

export function toTypeSplit(byType: Trends['byType']) {
  return [
    { name: 'Desks', value: byType.desk },
    { name: 'Rooms', value: byType.room },
  ];
}

export function hasRevenue(series: TrendPoint[]): boolean {
  return series.some((p) => p.revenueCents > 0);
}

export function hasBookings(series: TrendPoint[]): boolean {
  return series.some((p) => p.bookings > 0);
}

export function hasTypeSplit(byType: Trends['byType']): boolean {
  return byType.desk + byType.room > 0;
}
