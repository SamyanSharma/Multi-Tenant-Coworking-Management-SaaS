'use client';

import { useEffect, useState } from 'react';
import { useAuthStore } from '@/store/authStore';
import { getAuthHeaders } from '@/lib/api';

// Backend contract (implemented in apps/backend/src/analytics/):
//   GET /analytics/summary
//   → {
//       totalRevenue: number;      // cents
//       activeBookings: number;
//       totalBookings: number;
//       utilizationRate: number;   // 0-1
//     }

interface AnalyticsSummary {
  totalRevenue: number; // cents
  activeBookings: number;
  totalBookings: number;
  utilizationRate: number; // 0-1
}

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(
    cents / 100
  );
}

function formatPercent(fraction: number): string {
  return new Intl.NumberFormat('en-US', { style: 'percent', maximumFractionDigits: 0 }).format(
    fraction
  );
}

export default function AnalyticsPage() {
  const role = useAuthStore((s) => s.role);
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchSummary() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/analytics/summary`, {
          headers: getAuthHeaders(),
        });
        if (!res.ok) throw new Error(`Failed to load analytics (${res.status})`);
        setSummary(await res.json());
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    }
    fetchSummary();
  }, []);

  if (loading) return <div>Loading analytics…</div>;
  if (error) return <div className="text-red-600 text-sm">Error: {error}</div>;
  if (!summary) return null;

  const cards = [
    { label: 'Total Revenue', value: formatCurrency(summary.totalRevenue) },
    { label: 'Active Bookings', value: summary.activeBookings.toLocaleString() },
    { label: 'Total Bookings', value: summary.totalBookings.toLocaleString() },
    { label: 'Utilization Rate', value: formatPercent(summary.utilizationRate) },
  ];

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">
        Analytics {role === 'PLATFORM_ADMIN' ? '— All Spaces' : ''}
      </h1>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {cards.map((card) => (
          <div key={card.label} className="border rounded-lg p-4 bg-white shadow-sm">
            <div className="text-xs text-slate-500 mb-1">{card.label}</div>
            <div className="text-2xl font-semibold text-slate-900">{card.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
