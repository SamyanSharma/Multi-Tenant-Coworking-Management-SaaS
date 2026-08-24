'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { 
  Crown, 
  Wrench, 
  User, 
  Building2, 
  ArrowRight, 
  ChevronRight,
  LogIn,
  Info
} from 'lucide-react';

const SPACE_ID = 'cmt2nj2w40000h4551tz608b1';

const USER_ROLES = [
  {
    label: 'Platform Admin',
    role: 'PLATFORM_ADMIN' as const,
    icon: Crown,
    description: 'Full system access across all spaces',
    spaceId: null,
    accentColor: 'purple'
  },
  {
    label: 'Space Manager',
    role: 'SPACE_MANAGER' as const,
    icon: Wrench,
    description: 'Manage spaces, zones, desks, and rooms',
    spaceId: SPACE_ID,
    accentColor: 'blue'
  },
  {
    label: 'Member',
    role: 'MEMBER' as const,
    icon: User,
    description: 'View and book available spaces',
    spaceId: SPACE_ID,
    accentColor: 'green'
  },
];

export default function Home() {
  const setAuth = useAuthStore((s) => s.setAuth);
  const currentRole = useAuthStore((s) => s.role);
  const router = useRouter();
  const [userId, setUserId] = useState('');
  const [selectedRole, setSelectedRole] = useState<string | null>(null);

  const handleLogin = async (user: typeof USER_ROLES[number]) => {
    setSelectedRole(user.role);
    
    setAuth({
      token: 'dummy',
      role: user.role,
      spaceId: user.spaceId,
      userId: userId || null,
    });

    router.push('/dashboard/spaces');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 flex items-center justify-center p-6">
      <div className="w-full max-w-lg">
        <div className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
          <div className="bg-gradient-to-r from-slate-900 to-slate-800 p-8">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-3 bg-slate-700/50 rounded-lg">
                <Building2 className="w-6 h-6 text-emerald-400" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">Coworking SaaS</h1>
                <p className="text-sm text-slate-400">Development Login</p>
              </div>
            </div>
            
            {currentRole && (
              <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-slate-700/50 rounded-full">
                <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></span>
                <span className="text-xs text-slate-300">
                  Signed in as {currentRole}
                </span>
              </div>
            )}
          </div>

          <div className="p-8 space-y-6">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                User ID <span className="text-slate-400 font-normal">(optional)</span>
              </label>
              <input
                type="text"
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                placeholder="cmxxxxxxxxxxxxxxxxxxxxxxx"
                className="w-full border-2 border-slate-200 rounded-lg px-4 py-2.5 text-sm 
                         focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
                         placeholder:text-slate-400 transition-all"
              />
              <div className="flex items-start gap-2 mt-2">
                <Info className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
                <p className="text-xs text-slate-500">
                  Only needed for booking creation. Use a real User ID from your database.
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wider">
                Select Role
              </h2>
              
              {USER_ROLES.map((user) => {
                const Icon = user.icon;
                const isSelected = selectedRole === user.role;
                
                return (
                  <button
                    key={user.role}
                    onClick={() => handleLogin(user)}
                    disabled={isSelected}
                    className={`
                      w-full flex items-center gap-4 p-4 rounded-xl border-2 transition-all duration-200
                      ${isSelected 
                        ? 'border-blue-500 bg-blue-50 shadow-md' 
                        : 'border-slate-200 hover:border-slate-300 hover:shadow-md'
                      }
                      ${isSelected ? 'opacity-70 cursor-not-allowed' : 'cursor-pointer'}
                      focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
                    `}
                  >
                    <div className={`
                      p-2.5 rounded-lg shrink-0
                      ${user.accentColor === 'purple' ? 'bg-purple-100' : 
                        user.accentColor === 'blue' ? 'bg-blue-100' : 'bg-green-100'}
                    `}>
                      <Icon className={`
                        w-5 h-5
                        ${user.accentColor === 'purple' ? 'text-purple-600' : 
                          user.accentColor === 'blue' ? 'text-blue-600' : 'text-green-600'}
                      `} />
                    </div>
                    
                    <div className="flex-1 text-left">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-slate-900 text-sm">
                          {user.label}
                        </h3>
                        <span className={`
                          px-2 py-0.5 rounded-full text-xs font-medium
                          ${user.accentColor === 'purple' ? 'bg-purple-100 text-purple-700' : 
                            user.accentColor === 'blue' ? 'bg-blue-100 text-blue-700' : 
                            'bg-green-100 text-green-700'}
                        `}>
                          {user.role}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 mt-1">
                        {user.description}
                      </p>
                    </div>
                    
                    <ChevronRight className="w-5 h-5 text-slate-400 shrink-0" />
                  </button>
                );
              })}
            </div>

            <Link
              href="/dashboard/spaces"
              className="group flex items-center justify-center gap-2 border-2 border-slate-200 
                       hover:border-slate-300 rounded-xl px-4 py-3 text-sm font-medium text-slate-700 
                       hover:shadow-md transition-all duration-200"
            >
              Go to Dashboard
              <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
            </Link>
          </div>
        </div>

        <p className="text-center text-xs text-slate-500 mt-4">
          Development environment only — remove before production
        </p>
      </div>
    </div>
  );
}