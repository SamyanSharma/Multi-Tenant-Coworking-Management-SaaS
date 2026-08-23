'use client';

import { useState } from 'react';
import { useAuthStore } from '@/store/authStore';
import { getAuthHeaders } from '@/lib/api';

// Backend contract (apps/backend/src/payments/payments.controller.ts):
//   POST /payments/onboard  → { url: string }   (SPACE_MANAGER only)
//
// There is currently NO status-check endpoint (no GET /payments/status
// or equivalent), and NO separate member-facing checkout endpoint.
// Payment for a booking is created automatically, server-side, as part
// of POST /bookings itself (see bookings.service.ts — a Stripe
// PaymentIntent is created in the same transaction as the booking row,
// using the Space's priceCents and the Space_Manager's connected
// account). There is no client_secret exposed anywhere yet for a member
// to confirm that PaymentIntent from the browser, so a real "pay for
// this booking" UI isn't buildable against today's backend — it would
// need a new endpoint from Teammate A first. Flagging this rather than
// leaving fetch calls pointed at routes (`/billing/*`) that were deleted
// along with the old billing module.
export default function BillingPage() {
  const role = useAuthStore((s) => s.role);

  if (role === 'SPACE_MANAGER') return <SpaceManagerOnboarding />;

  if (role === 'MEMBER') {
    return (
      <div className="max-w-sm text-sm text-slate-600">
        <h1 className="text-xl font-semibold mb-2 text-slate-900">Billing</h1>
        <p>
          Payment for a booking is handled automatically when you create
          it — there&apos;s no separate checkout step yet. If you&apos;ve
          booked a desk or room, check{' '}
          <span className="font-medium">Bookings</span> for its payment
          status.
        </p>
      </div>
    );
  }

  return (
    <div className="text-sm text-slate-500">
      Billing isn&apos;t applicable to this role.
    </div>
  );
}

function SpaceManagerOnboarding() {
  const [redirecting, setRedirecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleOnboard() {
    setRedirecting(true);
    setError(null);
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
      window.location.href = url;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setRedirecting(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 max-w-sm">
      <h1 className="text-xl font-semibold">Billing</h1>

      {error && <div className="text-red-600 text-sm">{error}</div>}

      <div className="flex flex-col gap-3">
        <p className="text-sm text-slate-600">
          Connect a Stripe account to start receiving payments for
          bookings in your space. Bookings paid by Members are split 95%
          to you / 5% platform fee automatically.
        </p>
        <p className="text-xs text-slate-400">
          Note: there&apos;s no way yet to check whether you&apos;ve
          already completed onboarding from this page — clicking the
          button always starts (or resumes) the Stripe flow. A status
          check can be added once a backend endpoint for it exists.
        </p>
        <button
          onClick={handleOnboard}
          disabled={redirecting}
          className="bg-slate-900 text-white rounded px-4 py-2 text-sm disabled:opacity-50"
        >
          {redirecting ? 'Redirecting to Stripe…' : 'Onboard with Stripe'}
        </button>
      </div>
    </div>
  );
}
