'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '@/store/authStore';
import { login } from '@/lib/api';
import {
  Shield,
  User,
  ArrowRight,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Terminal,
  Crown,
  LogIn,
  Eye,
  EyeOff,
} from 'lucide-react';

// Real credentials seed.ts prints after `npx prisma db seed` — kept
// here only as quick-fill shortcuts for local dev/demo speed, not as
// a bypass of real login. Clicking one still calls POST /auth/login
// with these exact credentials, same as typing them in by hand.
const QUICK_LOGIN_USERS = [
  {
    label: 'Platform Admin',
    email: 'admin@platform.dev',
    icon: Crown,
    accentColor: 'purple',
  },
  {
    label: 'Space Manager',
    email: 'manager@test-space.dev',
    icon: Shield,
    accentColor: 'blue',
  },
  {
    label: 'Member',
    email: 'member@test-space.dev',
    icon: User,
    accentColor: 'green',
  },
] as const;

const DEV_PASSWORD = 'password123';

type Status = 'idle' | 'loading' | 'success' | 'error';

export default function LoginPage() {
  const setAuth = useAuthStore((s) => s.setAuth);
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);
  const [activeQuickLogin, setActiveQuickLogin] = useState<
    string | null
  >(null);

  async function doLogin(loginEmail: string, loginPassword: string) {
    setStatus('loading');
    setError(null);

    try {
      const result = await login(loginEmail, loginPassword);

      setAuth({
        token: result.accessToken,
        role: result.user.role,
        spaceId: result.user.spaceId,
        userId: result.user.id,
      });

      setStatus('success');
      setTimeout(() => {
        router.push('/dashboard/spaces');
      }, 300);
    } catch (err) {
      setStatus('error');
      setActiveQuickLogin(null);
      setError(err instanceof Error ? err.message : 'Login failed');
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setActiveQuickLogin(null);
    void doLogin(email, password);
  }

  function handleQuickLogin(quickEmail: string) {
    setActiveQuickLogin(quickEmail);
    setEmail(quickEmail);
    setPassword(DEV_PASSWORD);
    void doLogin(quickEmail, DEV_PASSWORD);
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
          <div className="bg-gradient-to-r from-slate-900 to-slate-800 p-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-slate-700/50 rounded-lg">
                <Terminal className="w-6 h-6 text-emerald-400" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">
                  Sign in
                </h1>
                <p className="text-sm text-slate-400">
                  Coworking SaaS
                </p>
              </div>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            <div className="space-y-1">
              <label
                htmlFor="email"
                className="text-xs font-semibold text-slate-700 uppercase tracking-wider"
              >
                Email
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="you@example.com"
              />
            </div>

            <div className="space-y-1">
              <label
                htmlFor="password"
                className="text-xs font-semibold text-slate-700 uppercase tracking-wider"
              >
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3 py-2 pr-10 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  tabIndex={-1}
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            {status === 'success' && (
              <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
                <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
                <p className="text-sm text-green-700">
                  Signed in! Redirecting...
                </p>
              </div>
            )}

            <button
              type="submit"
              disabled={status === 'loading'}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-60 text-white text-sm font-medium rounded-lg transition-colors"
            >
              {status === 'loading' && !activeQuickLogin ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <LogIn className="w-4 h-4" />
              )}
              Sign in
            </button>

            <p className="text-sm text-slate-500 text-center">
              New here?{' '}
              <Link
                href="/signup"
                className="text-slate-900 font-medium hover:underline"
              >
                Create one
              </Link>
            </p>
          </form>

          <div className="px-6 pb-6">
            <div className="flex items-center gap-2 mb-3">
              <div className="h-px flex-1 bg-slate-200" />
              <span className="text-xs text-slate-400 uppercase tracking-wider">
                Dev quick login
              </span>
              <div className="h-px flex-1 bg-slate-200" />
            </div>

            <div className="space-y-2">
              {QUICK_LOGIN_USERS.map((user) => {
                const Icon = user.icon;
                const isActive = activeQuickLogin === user.email;
                const isLoading = isActive && status === 'loading';

                return (
                  <button
                    key={user.email}
                    type="button"
                    onClick={() => handleQuickLogin(user.email)}
                    disabled={status === 'loading'}
                    className="w-full flex items-center gap-3 p-3 rounded-xl border-2 border-slate-200 hover:border-slate-300 hover:shadow-md disabled:opacity-60 disabled:cursor-not-allowed transition-all text-left"
                  >
                    <div
                      className={`p-2 rounded-lg shrink-0 ${
                        user.accentColor === 'purple'
                          ? 'bg-purple-100'
                          : user.accentColor === 'blue'
                            ? 'bg-blue-100'
                            : 'bg-green-100'
                      }`}
                    >
                      <Icon
                        className={`w-4 h-4 ${
                          user.accentColor === 'purple'
                            ? 'text-purple-600'
                            : user.accentColor === 'blue'
                              ? 'text-blue-600'
                              : 'text-green-600'
                        }`}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-900">
                        {user.label}
                      </p>
                      <p className="text-xs text-slate-500 truncate">
                        {user.email}
                      </p>
                    </div>
                    {isLoading ? (
                      <Loader2 className="w-4 h-4 text-blue-500 animate-spin shrink-0" />
                    ) : (
                      <ArrowRight className="w-4 h-4 text-slate-400 shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>

            <p className="text-xs text-slate-400 mt-3">
              These call the real login endpoint with seeded dev
              credentials (password &quot;{DEV_PASSWORD}&quot;) — not a
              bypass. Run <code>npx prisma db seed</code> first if
              these fail.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
