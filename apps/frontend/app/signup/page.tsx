'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '@/store/authStore';
import { signup, getPublicSpaces, type PublicSpace } from '@/lib/api';
import { formatCents } from '@/lib/money';
import {
  Building2,
  Loader2,
  AlertCircle,
  CheckCircle2,
  UserPlus,
  KeyRound,
  Eye,
  EyeOff,
  Search,
  Users,
  LayoutGrid,
  DoorOpen,
  RefreshCw,
} from 'lucide-react';

type SignupMode = 'SPACE_MANAGER' | 'MEMBER';
// Two ways into an existing space: pick it from the public directory,
// or type the join code a manager shared directly. Neither replaces
// the other — a manager may still prefer to hand out a code rather
// than list their space for anyone to find.
type JoinMode = 'BROWSE' | 'CODE';

export default function SignupPage() {
  const setAuth = useAuthStore((s) => s.setAuth);
  const router = useRouter();

  const [mode, setMode] = useState<SignupMode>('SPACE_MANAGER');
  const [joinMode, setJoinMode] = useState<JoinMode>('BROWSE');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [spaceName, setSpaceName] = useState('');
  const [spaceSlug, setSpaceSlug] = useState('');
  const [selectedSpaceId, setSelectedSpaceId] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const [spaces, setSpaces] = useState<PublicSpace[] | null>(null);
  const [spacesError, setSpacesError] = useState<string | null>(null);
  const [spacesLoading, setSpacesLoading] = useState(false);

  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>(
    'idle',
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (mode !== 'MEMBER' || joinMode !== 'BROWSE' || spaces !== null) return;
    loadSpaces();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, joinMode]);

  async function loadSpaces() {
    setSpacesLoading(true);
    setSpacesError(null);
    try {
      setSpaces(await getPublicSpaces());
    } catch (err) {
      setSpacesError(err instanceof Error ? err.message : 'Could not load spaces');
    } finally {
      setSpacesLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus('loading');
    setError(null);

    try {
      const result =
        mode === 'SPACE_MANAGER'
          ? await signup({ role: 'SPACE_MANAGER', name, email, password, spaceName })
          : joinMode === 'BROWSE'
            ? await signup({ role: 'MEMBER', name, email, password, spaceId: selectedSpaceId! })
            : await signup({ role: 'MEMBER', name, email, password, spaceSlug });

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
      setError(err instanceof Error ? err.message : 'Signup failed');
    }
  }

  const filteredSpaces = (spaces ?? []).filter((s) =>
    s.name.toLowerCase().includes(search.trim().toLowerCase()),
  );

  const canSubmit =
    mode === 'SPACE_MANAGER' ||
    joinMode === 'CODE' ||
    (joinMode === 'BROWSE' && selectedSpaceId !== null);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
          <div className="bg-gradient-to-r from-slate-900 to-slate-800 p-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-slate-700/50 rounded-lg">
                {mode === 'SPACE_MANAGER' ? (
                  <Building2 className="w-6 h-6 text-emerald-400" />
                ) : (
                  <KeyRound className="w-6 h-6 text-emerald-400" />
                )}
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">Sign up</h1>
                <p className="text-sm text-slate-400">
                  {mode === 'SPACE_MANAGER'
                    ? 'List your own coworking space'
                    : 'Join a space someone else manages'}
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 border-b border-slate-200">
            <button
              type="button"
              onClick={() => setMode('SPACE_MANAGER')}
              className={`py-3 text-sm font-medium transition-colors ${
                mode === 'SPACE_MANAGER'
                  ? 'text-slate-900 border-b-2 border-slate-900 bg-slate-50'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              List my space
            </button>
            <button
              type="button"
              onClick={() => setMode('MEMBER')}
              className={`py-3 text-sm font-medium transition-colors ${
                mode === 'MEMBER'
                  ? 'text-slate-900 border-b-2 border-slate-900 bg-slate-50'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Rent a space
            </button>
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            {mode === 'SPACE_MANAGER' ? (
              <div className="space-y-1">
                <label
                  htmlFor="spaceName"
                  className="text-xs font-semibold text-slate-700 uppercase tracking-wider"
                >
                  Space name
                </label>
                <input
                  id="spaceName"
                  type="text"
                  required
                  minLength={2}
                  value={spaceName}
                  onChange={(e) => setSpaceName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Acme Coworking"
                />
                <p className="text-xs text-slate-500">
                  This creates a brand-new space with you as its manager.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
                    {joinMode === 'BROWSE' ? 'Choose a space' : 'Space join code'}
                  </span>
                  <button
                    type="button"
                    onClick={() => setJoinMode(joinMode === 'BROWSE' ? 'CODE' : 'BROWSE')}
                    className="text-xs font-medium text-blue-600 hover:text-blue-700"
                  >
                    {joinMode === 'BROWSE' ? 'Have a join code instead?' : 'Browse spaces instead'}
                  </button>
                </div>

                {joinMode === 'BROWSE' ? (
                  <div className="space-y-2">
                    <div className="relative">
                      <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search by name"
                        className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 max-h-56 overflow-y-auto">
                      {spacesLoading && (
                        <div className="p-4 flex items-center justify-center gap-2 text-sm text-slate-500">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Loading spaces...
                        </div>
                      )}

                      {spacesError && !spacesLoading && (
                        <div className="p-4 space-y-2">
                          <p className="text-sm text-red-700">{spacesError}</p>
                          <button
                            type="button"
                            onClick={loadSpaces}
                            className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700"
                          >
                            <RefreshCw className="w-3 h-3" />
                            Try again
                          </button>
                        </div>
                      )}

                      {!spacesLoading && !spacesError && filteredSpaces.length === 0 && (
                        <p className="p-4 text-sm text-slate-500">
                          {spaces && spaces.length > 0
                            ? 'No spaces match that search.'
                            : 'No spaces are listed yet — ask your Space Manager for a join code instead.'}
                        </p>
                      )}

                      {!spacesLoading &&
                        !spacesError &&
                        filteredSpaces.map((space) => {
                          const isSelected = selectedSpaceId === space.id;
                          return (
                            <button
                              key={space.id}
                              type="button"
                              onClick={() => setSelectedSpaceId(space.id)}
                              className={`w-full text-left p-3 flex items-center justify-between gap-3 transition-colors ${
                                isSelected ? 'bg-blue-50' : 'hover:bg-slate-50'
                              }`}
                            >
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-slate-900 truncate">
                                  {space.name}
                                </p>
                                <div className="flex items-center gap-3 mt-0.5 text-xs text-slate-500">
                                  <span className="inline-flex items-center gap-1">
                                    <Users className="w-3 h-3" />
                                    {space.members}
                                  </span>
                                  <span className="inline-flex items-center gap-1">
                                    <LayoutGrid className="w-3 h-3" />
                                    {space.desks}
                                  </span>
                                  <span className="inline-flex items-center gap-1">
                                    <DoorOpen className="w-3 h-3" />
                                    {space.rooms}
                                  </span>
                                </div>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <span className="text-sm font-semibold text-slate-700">
                                  {space.priceCents != null ? formatCents(space.priceCents) : '—'}
                                </span>
                                <div
                                  className={`w-4 h-4 rounded-full border-2 ${
                                    isSelected
                                      ? 'border-blue-600 bg-blue-600'
                                      : 'border-slate-300'
                                  }`}
                                />
                              </div>
                            </button>
                          );
                        })}
                    </div>
                  </div>
                ) : (
                  <>
                    <input
                      id="spaceSlug"
                      type="text"
                      required
                      value={spaceSlug}
                      onChange={(e) => setSpaceSlug(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="acme-coworking"
                    />
                    <p className="text-xs text-slate-500">
                      Ask your Space Manager for this — it&apos;s shown on
                      their space&apos;s page (as &quot;/their-slug&quot;).
                    </p>
                  </>
                )}
              </div>
            )}

            <div className="space-y-1">
              <label
                htmlFor="name"
                className="text-xs font-semibold text-slate-700 uppercase tracking-wider"
              >
                Your name
              </label>
              <input
                id="name"
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Jane Doe"
              />
            </div>

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
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3 py-2 pr-10 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="At least 8 characters"
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
                  {mode === 'SPACE_MANAGER'
                    ? 'Space created! Redirecting...'
                    : "You're in! Redirecting..."}
                </p>
              </div>
            )}

            <button
              type="submit"
              disabled={status === 'loading' || !canSubmit}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-60 text-white text-sm font-medium rounded-lg transition-colors"
            >
              {status === 'loading' ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <UserPlus className="w-4 h-4" />
              )}
              {mode === 'SPACE_MANAGER' ? 'Create space & sign up' : 'Join space'}
            </button>
          </form>

          <div className="px-6 pb-6 text-center">
            <p className="text-sm text-slate-600">
              Already have an account?{' '}
              <Link
                href="/dev-login"
                className="text-slate-900 font-medium hover:underline"
              >
                Sign in
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
