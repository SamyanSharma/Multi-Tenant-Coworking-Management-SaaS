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

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();

    // Stripe.js/Elements haven't finished loading yet — the button is
    // disabled in this state too, but guard the handler itself in
    // case of a stray double-submit.
    if (!stripe || !elements) return;

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
      <PaymentElement />

      {error && (
        <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
          <AlertCircle className="w-4 h-4 text-red-600 mt-0.5 shrink-0" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      <button
        type="submit"
        disabled={!stripe || submitting}
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
