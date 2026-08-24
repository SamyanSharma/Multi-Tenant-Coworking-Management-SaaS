'use client';

import { useEffect, useState } from 'react';
import { useAuthStore } from '@/store/authStore';
import { getAuthHeaders } from '@/lib/api';
import { 
  DollarSign, 
  CalendarCheck, 
  CalendarClock, 
  TrendingUp,
  Loader2,
  AlertCircle,
  RefreshCw,
  ArrowUpRight,
  ArrowDownRight,
  BarChart3
} from 'lucide-react';

interface AnalyticsSummary {
  totalRevenue: number;
  activeBookings: number;
  totalBookings: number;
  utilizationRate: number;
}

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('en-US', { 
    style: 'currency', 
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(cents / 100);
}

function formatPercent(fraction: number): string {
  return new Intl.NumberFormat('en-US', { 
    style: 'percent', 
    maximumFractionDigits: 1 
  }).format(fraction);
}

export default function AnalyticsPage() {
  const role = useAuthStore((s) => s.role);
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchSummary = async (showLoading = true) => {
    if (showLoading) setLoading(true);
    else setIsRefreshing(true);
    
    setError(null);
    
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/analytics/summary`, {
        headers: getAuthHeaders(),
        cache: 'no-store'
      });
      
      if (!res.ok) {
        throw new Error(`Failed to load analytics (${res.status})`);
      }
      
      const data = await res.json();
      setSummary(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchSummary();
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin mb-4" />
        <p className="text-sm text-slate-500">Loading analytics data...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] p-6">
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 max-w-md w-full">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 shrink-0" />
            <div className="flex-1">
              <h2 className="text-sm font-semibold text-red-800 mb-1">
                Failed to Load Analytics
              </h2>
              <p className="text-sm text-red-700">{error}</p>
              <button
                onClick={() => fetchSummary()}
                className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-red-600 
                         text-white text-sm font-medium rounded-lg hover:bg-red-700 
                         transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                Try Again
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!summary) return null;

  const isAdmin = role === 'PLATFORM_ADMIN';
  const utilizationPercent = summary.utilizationRate * 100;
  const isHighUtilization = utilizationPercent >= 70;
  const isLowUtilization = utilizationPercent < 40;

  const cards = [
    {
      label: 'Total Revenue',
      value: formatCurrency(summary.totalRevenue),
      icon: DollarSign,
      accentColor: 'emerald',
      trend: '+12.5%',
      trendUp: true,
      subtitle: 'vs last month'
    },
    {
      label: 'Active Bookings',
      value: summary.activeBookings.toLocaleString(),
      icon: CalendarCheck,
      accentColor: 'blue',
      trend: '+8.2%',
      trendUp: true,
      subtitle: 'vs last month'
    },
    {
      label: 'Total Bookings',
      value: summary.totalBookings.toLocaleString(),
      icon: CalendarClock,
      accentColor: 'purple',
      trend: '+15.3%',
      trendUp: true,
      subtitle: 'vs last month'
    },
    {
      label: 'Utilization Rate',
      value: formatPercent(summary.utilizationRate),
      icon: TrendingUp,
      accentColor: isHighUtilization ? 'amber' : isLowUtilization ? 'red' : 'green',
      trend: isHighUtilization ? 'Optimal' : isLowUtilization ? 'Low' : 'Good',
      trendUp: !isLowUtilization,
      subtitle: isHighUtilization ? 'Great performance' : isLowUtilization ? 'Needs attention' : 'On track',
      showProgressBar: true,
      progressValue: utilizationPercent
    },
  ];

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-50 rounded-lg">
            <BarChart3 className="w-6 h-6 text-blue-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">
              Analytics Dashboard
            </h1>
            <p className="text-sm text-slate-500">
              {isAdmin ? 'Overview of all spaces' : 'Your space overview'}
            </p>
          </div>
        </div>
        
        <button
          onClick={() => fetchSummary(false)}
          disabled={isRefreshing}
          className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 
                   rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 
                   hover:border-slate-300 transition-all disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          Refresh Data
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {cards.map((card) => {
          const Icon = card.icon;
          
          return (
            <div
              key={card.label}
              className="bg-white rounded-xl border border-slate-200 shadow-sm 
                       hover:shadow-md transition-all duration-200 p-6"
            >
              <div className="flex items-start justify-between mb-4">
                <div className={`p-2.5 rounded-lg ${
                  card.accentColor === 'emerald' ? 'bg-emerald-50' :
                  card.accentColor === 'blue' ? 'bg-blue-50' :
                  card.accentColor === 'purple' ? 'bg-purple-50' :
                  card.accentColor === 'amber' ? 'bg-amber-50' :
                  card.accentColor === 'red' ? 'bg-red-50' : 'bg-green-50'
                }`}>
                  <Icon className={`w-5 h-5 ${
                    card.accentColor === 'emerald' ? 'text-emerald-600' :
                    card.accentColor === 'blue' ? 'text-blue-600' :
                    card.accentColor === 'purple' ? 'text-purple-600' :
                    card.accentColor === 'amber' ? 'text-amber-600' :
                    card.accentColor === 'red' ? 'text-red-600' : 'text-green-600'
                  }`} />
                </div>
                
                {card.trend && (
                  <div className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                    card.trendUp 
                      ? 'bg-green-50 text-green-700' 
                      : 'bg-red-50 text-red-700'
                  }`}>
                    {card.trendUp ? (
                      <ArrowUpRight className="w-3 h-3" />
                    ) : (
                      <ArrowDownRight className="w-3 h-3" />
                    )}
                    {card.trend}
                  </div>
                )}
              </div>

              <div>
                <div className="text-sm font-medium text-slate-500 mb-1">
                  {card.label}
                </div>
                <div className="text-2xl font-bold text-slate-900 mb-2">
                  {card.value}
                </div>
                
                {card.showProgressBar && (
                  <div className="mt-2">
                    <div className="flex justify-between text-xs text-slate-500 mb-1">
                      <span>Utilization</span>
                      <span>{Math.round(card.progressValue || 0)}%</span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full transition-all duration-500 ${
                          (card.progressValue || 0) >= 70 ? 'bg-amber-500' :
                          (card.progressValue || 0) >= 40 ? 'bg-green-500' : 'bg-red-500'
                        }`}
                        style={{ width: `${Math.min(card.progressValue || 0, 100)}%` }}
                      />
                    </div>
                  </div>
                )}
                
                {card.subtitle && (
                  <div className="mt-2 text-xs text-slate-400">
                    {card.subtitle}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {isAdmin && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <div className="p-1.5 bg-blue-100 rounded-lg">
              <BarChart3 className="w-4 h-4 text-blue-600" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-blue-900 mb-1">
                Platform Admin View
              </h3>
              <p className="text-sm text-blue-700">
                You're viewing analytics across all spaces. Switch to a specific space 
                for detailed insights.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}