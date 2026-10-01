'use client';

// Shared frame for the dashboard charts: title, one-line definition of what
// the numbers mean, and an empty state instead of a flat, misleading chart.
export default function ChartCard({
  title,
  subtitle,
  empty,
  emptyText = 'No data yet',
  children,
}: {
  title: string;
  subtitle: string;
  empty: boolean;
  emptyText?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
      <h2 className="text-base font-semibold text-slate-900">{title}</h2>
      <p className="text-xs text-slate-500 mb-4">{subtitle}</p>
      {empty ? (
        <div className="h-64 flex items-center justify-center text-sm text-slate-400">
          {emptyText}
        </div>
      ) : (
        <div className="h-64">{children}</div>
      )}
    </div>
  );
}
