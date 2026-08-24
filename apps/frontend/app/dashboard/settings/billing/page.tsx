'use client';

import { useState } from 'react';
import { useAuthStore } from '@/store/authStore';
import { getAuthHeaders } from '@/lib/api';
import { 
  CreditCard, 
  Wallet, 
  ExternalLink, 
  Loader2, 
  AlertCircle, 
  CheckCircle2,
  Info,
  ArrowRight,
  Shield,
  Zap
} from 'lucide-react';

export default function BillingPage() {
  const role = useAuthStore((s) => s.role);

  if (role === 'SPACE_MANAGER') return <SpaceManagerOnboarding />;

  if (role === 'MEMBER') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 p-6">
        <div className="max-w-2xl mx-auto">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
            <div className="bg-gradient-to-r from-slate-900 to-slate-800 p-6">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-slate-700/50 rounded-lg">
                  <Wallet className="w-6 h-6 text-emerald-400" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-white">Billing</h1>
                  <p className="text-sm text-slate-400">Payment Management</p>
                </div>
              </div>
            </div>
            
            <div className="p-6 space-y-4">
              <div className="flex items-start gap-3 p-4 bg-blue-50 border border-blue-200 rounded-xl">
                <Info className="w-5 h-5 text-blue-600 mt-0.5 shrink-0" />
                <div>
                  <h2 className="text-sm font-semibold text-blue-900 mb-2">
                    Automatic Payments
                  </h2>
                  <p className="text-sm text-blue-800 leading-relaxed">
                    Payment for a booking is handled automatically when you create it. 
                    There's no separate checkout step needed. If you've booked a desk 
                    or room, check your bookings for payment status.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-4 bg-slate-50 border border-slate-200 rounded-xl">
                <Shield className="w-5 h-5 text-slate-600 mt-0.5 shrink-0" />
                <div>
                  <h2 className="text-sm font-semibold text-slate-900 mb-2">
                    Secure Payments
                  </h2>
                  <p className="text-sm text-slate-600 leading-relaxed">
                    All payments are processed securely through Stripe. Your payment 
                    information is never stored on our servers.
                  </p>
                </div>
              </div>

              <button
                onClick={() => window.location.href = '/dashboard/bookings'}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 
                         bg-slate-900 text-white rounded-lg text-sm font-medium 
                         hover:bg-slate-800 transition-all group"
              >
                View Your Bookings
                <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 p-6">
      <div className="max-w-md mx-auto">
        <div className="bg-white rounded-2xl shadow-xl border border-slate-200 p-8 text-center">
          <div className="p-3 bg-slate-100 rounded-full inline-flex mb-4">
            <CreditCard className="w-6 h-6 text-slate-400" />
          </div>
          <h1 className="text-lg font-semibold text-slate-900 mb-2">
            Billing Not Available
          </h1>
          <p className="text-sm text-slate-500">
            Billing isn't applicable to this role.
          </p>
        </div>
      </div>
    </div>
  );
}

function SpaceManagerOnboarding() {
  const [redirecting, setRedirecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleOnboard() {
    setRedirecting(true);
    setError(null);
    setSuccess(false);
    
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/payments/onboard`, {
        method: 'POST',
        headers: getAuthHeaders(),
      });
      
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.message ?? `Failed to start onboarding (${res.status})`);
      }
      
      const { url } = await res.json();
      setSuccess(true);
      
      setTimeout(() => {
        window.location.href = url;
      }, 1500);
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setRedirecting(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 p-6">
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
          <div className="bg-gradient-to-r from-slate-900 to-slate-800 p-6">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-slate-700/50 rounded-lg">
                <Wallet className="w-6 h-6 text-emerald-400" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">Billing Setup</h1>
                <p className="text-sm text-slate-400">Stripe Integration</p>
              </div>
            </div>
          </div>

          <div className="p-6 space-y-6">
            {error && (
              <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-xl">
                <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 shrink-0" />
                <div>
                  <h2 className="text-sm font-semibold text-red-800 mb-1">
                    Onboarding Failed
                  </h2>
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              </div>
            )}

            {success && (
              <div className="flex items-start gap-3 p-4 bg-green-50 border border-green-200 rounded-xl">
                <CheckCircle2 className="w-5 h-5 text-green-600 mt-0.5 shrink-0" />
                <div>
                  <h2 className="text-sm font-semibold text-green-800 mb-1">
                    Success!
                  </h2>
                  <p className="text-sm text-green-700">
                    Redirecting to Stripe...
                  </p>
                </div>
              </div>
            )}

            <div className="space-y-4">
              <div className="flex items-start gap-3 p-4 bg-slate-50 border border-slate-200 rounded-xl">
                <Zap className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
                <div>
                  <h2 className="text-sm font-semibold text-slate-900 mb-2">
                    Get Paid for Bookings
                  </h2>
                  <p className="text-sm text-slate-600 leading-relaxed">
                    Connect a Stripe account to start receiving payments for bookings 
                    in your space. Bookings paid by Members are automatically split 
                    95% to you / 5% platform fee.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl">
                <Info className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
                <div>
                  <h2 className="text-sm font-semibold text-amber-900 mb-2">
                    Important Note
                  </h2>
                  <p className="text-sm text-amber-800 leading-relaxed">
                    There's no way yet to check if you've already completed onboarding 
                    from this page. Clicking the button always starts or resumes the 
                    Stripe flow.
                  </p>
                </div>
              </div>
            </div>

            <button
              onClick={handleOnboard}
              disabled={redirecting || success}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 
                       bg-slate-900 text-white rounded-lg text-sm font-medium 
                       hover:bg-slate-800 transition-all disabled:opacity-50 
                       disabled:cursor-not-allowed"
            >
              {redirecting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Redirecting to Stripe...
                </>
              ) : success ? (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  Redirecting...
                </>
              ) : (
                <>
                  <ExternalLink className="w-4 h-4" />
                  Onboard with Stripe
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}