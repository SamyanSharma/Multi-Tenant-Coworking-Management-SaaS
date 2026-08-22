'use client';

import { useEffect, useState } from 'react';
import { useAuthStore } from '@/store/authStore';
import { getAuthHeaders } from '@/lib/api';

// NOTE: no backend payments code is merged into main yet. Every endpoint
// below is a PROPOSED contract — see
// /handoff-for-teammate-A/README.md for the reference implementation
// and what's still needed before these routes are real.
//
// Backend contract (implemented in apps/backend/src/billing/):
//   GET  /billing/status          → { onboarded: boolean, stripeAccountId: string | null }
//   POST /billing/onboard         → { url: string }
//   POST /billing/checkout        → { url: string }
//   body: { bookingId: string }

interface BillingStatus {
  onboarded: boolean;
  stripeAccountId: string | null;
}

export default function BillingPage() {
  const role = useAuthStore((s) => s.role);

  if (role === 'SPACE_MANAGER') return <SpaceManagerOnboarding />;
  if (role === 'MEMBER') return <MemberCheckout />;

  return (
    <div className="text-sm text-slate-500">
      Billing isn&apos;t applicable to this role.
    </div>
  );
}

function SpaceManagerOnboarding() {
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [redirecting, setRedirecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchStatus() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/billing/status`, {
          headers: getAuthHeaders(),
        });
        if (!res.ok) throw new Error(`Failed to load billing status (${res.status})`);
        setStatus(await res.json());
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    }
    fetchStatus();
  }, []);

  async function handleOnboard() {
    setRedirecting(true);
    setError(null);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/billing/onboard`, {
        method: 'POST',
        headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error(`Failed to start onboarding (${res.status})`);
      const { url } = await res.json();
      window.location.href = url;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setRedirecting(false);
    }
  }

  if (loading) return <div>Loading billing status…</div>;

  return (
    <div className="flex flex-col gap-4 max-w-sm">
      <h1 className="text-xl font-semibold">Billing</h1>

      {error && <div className="text-red-600 text-sm">{error}</div>}

      {status?.onboarded ? (
        <div className="border rounded p-4 bg-green-50 border-green-300 text-green-800 text-sm">
          Your Stripe account is connected. Bookings paid by Members will
          be split 95% to you / 5% platform fee automatically.
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-slate-600">
            Connect a Stripe account to start receiving payments for
            bookings in your space.
          </p>
          <button
            onClick={handleOnboard}
            disabled={redirecting}
            className="bg-slate-900 text-white rounded px-4 py-2 text-sm disabled:opacity-50"
          >
            {redirecting ? 'Redirecting to Stripe…' : 'Onboard with Stripe'}
          </button>
        </div>
      )}
    </div>
  );
}

function MemberCheckout() {
  const [bookingId, setBookingId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCheckout(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/billing/checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        body: JSON.stringify({ bookingId }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.message ?? `Checkout failed (${res.status})`);
      }

      const { url } = await res.json();
      window.location.href = url;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleCheckout} className="flex flex-col gap-3 max-w-sm">
      <h1 className="text-xl font-semibold">Pay for a booking</h1>

      <label className="flex flex-col gap-1 text-sm">
        Booking ID
        <input
          type="text"
          value={bookingId}
          onChange={(e) => setBookingId(e.target.value)}
          required
          className="border rounded px-3 py-2"
          placeholder="cmxxxxxxxxxxxxxxxxxxxxxxx"
        />
      </label>
      <p className="text-xs text-slate-400">
        Temporary: paste the booking ID from /dashboard/bookings until a
        &quot;Pay now&quot; button is wired directly on that list (needs
        Teammate A&apos;s checkout endpoint confirmed first).
      </p>

      {error && <div className="text-red-600 text-sm">{error}</div>}

      <button
        type="submit"
        disabled={submitting}
        className="bg-slate-900 text-white rounded px-4 py-2 text-sm disabled:opacity-50"
      >
        {submitting ? 'Redirecting to Stripe…' : 'Pay with Stripe'}
      </button>
    </form>
  );
}
