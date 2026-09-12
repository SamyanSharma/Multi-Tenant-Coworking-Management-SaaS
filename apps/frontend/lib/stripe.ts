import { loadStripe, Stripe } from '@stripe/stripe-js';

let stripePromise: Promise<Stripe | null> | null = null;

// loadStripe() fetches Stripe.js from Stripe's CDN — cache the promise
// so that's a one-time cost, not repeated on every render/mount of a
// payment form.
export function getStripe(): Promise<Stripe | null> {
  if (!stripePromise) {
    const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;

    if (!key) {
      // eslint-disable-next-line no-console
      console.error(
        'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is not set — payment forms will not load. See .env.local.example.',
      );
    }

    stripePromise = loadStripe(key ?? '');
  }

  return stripePromise;
}
