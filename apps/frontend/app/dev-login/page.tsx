'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { 
  Shield, 
  User, 
  Users, 
  ArrowRight, 
  Loader2, 
  AlertCircle,
  CheckCircle2,
  Terminal
} from 'lucide-react';

// DEV-ONLY TOOL — remove this whole page before the final/production
// build (see MASTER_PROMPT.md / PROGRESS.md). These IDs are NOT
// arbitrary: they must match the fixed DEV_SPACE_ID / DEV_MANAGER_ID /
// DEV_MEMBER_ID constants pinned in `apps/backend/prisma/seed.ts`. If
// you change one, change the other — a mismatch here silently sets
// stale auth state (401/404 on the first real API call, no visible
// error), which is exactly the bug this pinning was added to prevent.
const SPACE_ID = 'devseed_space_0000000001';

const USERS = [
  { 
    label: 'Space Manager', 
    role: 'SPACE_MANAGER' as const, 
    userId: 'devseed_user_manager_001',
    description: 'Full access to manage spaces, members, and settings',
    icon: Shield,
    accentColor: 'blue'
  },
  { 
    label: 'Member', 
    role: 'MEMBER' as const, 
    userId: 'devseed_user_member_0001',
    description: 'Standard access to view and interact with spaces',
    icon: User,
    accentColor: 'green'
  },
];

type LoginStatus = 'idle' | 'loading' | 'success' | 'error';

export default function DevLoginPage() {
  const setAuth = useAuthStore((s) => s.setAuth);
  const router = useRouter();
  const [status, setStatus] = useState<LoginStatus>('idle');
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Safety net in case this page isn't deleted before a real deploy —
  // see the removal note above. Doesn't replace deleting the page.
  if (process.env.NODE_ENV === 'production') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 text-center">
        <p className="text-slate-500 text-sm">
          Dev login is disabled in production builds.
        </p>
      </div>
    );
  }

  async function loginAs(user: typeof USERS[number]) {
    setStatus('loading');
    setSelectedUser(user.userId);
    setError(null);

    try {
      await new Promise(resolve => setTimeout(resolve, 500));
      
      setAuth({
        token: 'dummy',
        role: user.role,
        spaceId: SPACE_ID,
        userId: user.userId,
      });

      setStatus('success');
      
      setTimeout(() => {
        router.push('/dashboard/spaces');
      }, 500);
    } catch (error) {
      setStatus('error');
      setError(error instanceof Error ? error.message : 'Login failed');
      setSelectedUser(null);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
          <div className="bg-gradient-to-r from-slate-900 to-slate-800 p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-slate-700/50 rounded-lg">
                <Terminal className="w-6 h-6 text-emerald-400" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">Dev Login</h1>
                <p className="text-sm text-slate-400">Development Environment</p>
              </div>
            </div>
            
            <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
              <p className="text-xs text-amber-800 leading-relaxed">
                Placeholder authentication for development. Select a role to simulate 
                different user permissions.
              </p>
            </div>
          </div>

          <div className="p-6 space-y-4">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-slate-500" />
              <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wider">
                Select User Role
              </h2>
            </div>

            <div className="space-y-3">
              {USERS.map((user) => {
                const Icon = user.icon;
                const isSelected = selectedUser === user.userId;
                const isLoading = isSelected && status === 'loading';
                const isSuccess = isSelected && status === 'success';

                return (
                  <button
                    key={user.userId}
                    onClick={() => loginAs(user)}
                    disabled={status === 'loading'}
                    className={`
                      w-full text-left p-4 rounded-xl border-2 transition-all duration-200
                      ${isSelected 
                        ? 'border-blue-500 bg-blue-50 shadow-md' 
                        : 'border-slate-200 hover:border-slate-300 hover:shadow-md'
                      }
                      ${status === 'loading' ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}
                      focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
                    `}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`
                        p-2 rounded-lg shrink-0
                        ${user.accentColor === 'blue' ? 'bg-blue-100' : 'bg-green-100'}
                      `}>
                        <Icon className={`
                          w-5 h-5
                          ${user.accentColor === 'blue' ? 'text-blue-600' : 'text-green-600'}
                        `} />
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-slate-900 text-sm">
                            {user.label}
                          </h3>
                          <span className={`
                            px-2 py-0.5 rounded-full text-xs font-medium
                            ${user.role === 'SPACE_MANAGER' 
                              ? 'bg-blue-100 text-blue-700' 
                              : 'bg-green-100 text-green-700'
                            }
                          `}>
                            {user.role}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 mt-1">
                          {user.description}
                        </p>
                      </div>

                      <div className="shrink-0">
                        {isLoading ? (
                          <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
                        ) : isSuccess ? (
                          <CheckCircle2 className="w-5 h-5 text-green-500" />
                        ) : (
                          <ArrowRight className="w-5 h-5 text-slate-400" />
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
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
                  Login successful! Redirecting...
                </p>
              </div>
            )}
          </div>
        </div>

        <p className="text-center text-xs text-slate-500 mt-4">
          Development only - Remove before production deployment
        </p>
      </div>
    </div>
  );
}