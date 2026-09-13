'use client';

import { useState, FormEvent } from 'react';
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from '@stripe/react-stripe-js';
import { getStripe } from '@/lib/stripe';
import { Loader2, AlertCircle, CreditCard } from 'lucide-react';

interface PaymentStepProps {
  clientSecret: string;
  amountCents: number;
  onPaid: () => void;
}

// Wraps Stripe's <Elements> provider around the actual form —
// <Elements> needs the clientSecret up front to know which
// PaymentIntent it's rendering a form for.
export default function PaymentStep({
  clientSecret,
  amountCents,
  onPaid,
}: PaymentStepProps) {
  return (
    <Elements
      stripe={getStripe()}
      options={{ clientSecret, appearance: { theme: 'stripe' } }}
    >
      <CheckoutForm amountCents={amountCents} onPaid={onPaid} />
    </Elements>
  );
}

function CheckoutForm({
  amountCents,
  onPaid,
}: {
  amountCents: number;
  onPaid: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // useStripe() returns truthy as soon as Stripe.js itself loads —
  // that's independent of whether THIS PaymentElement actually
  // mounted successfully for the given clientSecret. Without tracking
  // that separately, a bad/mismatched clientSecret (e.g. the
  // publishable key belonging to a different Stripe account than the
  // one that created the PaymentIntent) leaves the Pay button
  // clickable, and confirmPayment() throws an unhandled
  // IntegrationError instead of ever explaining what went wrong.
  const [elementReady, setElementReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();

    if (!stripe || !elements || !elementReady) return;

    setSubmitting(true);
    setError(null);

    // redirect: 'if_required' keeps the user on this page for payment
    // methods that don't need one (every card in test mode) — no
    // return_url round trip needed for the common case.
    const { error: confirmError } = await stripe.confirmPayment({
      elements,
      redirect: 'if_required',
    });

    if (confirmError) {
      setError(
        confirmError.message ?? 'Payment failed — please try again.',
      );
      setSubmitting(false);
      return;
    }

    onPaid();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <PaymentElement
        onReady={() => setElementReady(true)}
        onLoadError={(event) => {
          setLoadError(
            event.error.message ??
              'Could not load the payment form — please try again shortly.',
          );
        }}
      />

      {loadError && (
        <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
          <AlertCircle className="w-4 h-4 text-red-600 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm text-red-700">{loadError}</p>
            <p className="text-xs text-red-600 mt-1">
              This usually means a Stripe configuration problem, not
              something wrong with your card — contact support instead
              of retrying.
            </p>
          </div>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
          <AlertCircle className="w-4 h-4 text-red-600 mt-0.5 shrink-0" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      <button
        type="submit"
        disabled={!stripe || !elementReady || submitting || !!loadError}
        className="w-full inline-flex items-center justify-center gap-2 bg-slate-900
                 text-white rounded-lg px-4 py-3 text-sm font-medium
                 hover:bg-slate-800 transition-all disabled:opacity-50
                 disabled:cursor-not-allowed"
      >
        {submitting ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Processing payment...
          </>
        ) : !elementReady && !loadError ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading payment form...
          </>
        ) : (
          <>
            <CreditCard className="w-4 h-4" />
            Pay ${(amountCents / 100).toFixed(2)}
          </>
        )}
      </button>

      <p className="text-xs text-slate-500 text-center">
        Test mode — use card 4242 4242 4242 4242, any future expiry
        date, any CVC.
      </p>
    </form>
  );
}
