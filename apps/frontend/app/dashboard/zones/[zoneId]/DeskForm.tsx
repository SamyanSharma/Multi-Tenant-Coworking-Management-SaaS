'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getAuthHeaders } from '@/lib/api';
import { 
  LayoutGrid, 
  Loader2, 
  AlertCircle, 
  CheckCircle2,
  Save,
  Plus,
  X,
  Edit3,
  Info
} from 'lucide-react';

interface DeskFormProps {
  initialName?: string;
  deskId?: string;
  onSuccess?: () => void;
  onCancel?: () => void;
}

export default function DeskForm({ 
  initialName = '', 
  deskId, 
  onSuccess,
  onCancel 
}: DeskFormProps) {
  const { zoneId } = useParams<{ zoneId: string }>();
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const isEditing = Boolean(deskId);

  const validateName = (value: string): boolean => {
    if (!value.trim()) {
      setValidationError('Desk name is required');
      return false;
    }
    
    if (value.trim().length < 2) {
      setValidationError('Desk name must be at least 2 characters');
      return false;
    }
    
    if (value.trim().length > 50) {
      setValidationError('Desk name must be less than 50 characters');
      return false;
    }
    
    setValidationError(null);
    return true;
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setSuccess(false);

    if (!validateName(name)) {
      setSubmitting(false);
      return;
    }

    try {
      const base = process.env.NEXT_PUBLIC_API_URL;
      const res = await fetch(
        isEditing ? `${base}/desks/${deskId}` : `${base}/desks`, 
        {
          method: isEditing ? 'PATCH' : 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...getAuthHeaders(),
          },
          body: JSON.stringify({ 
            name: name.trim(), 
            zoneId 
          }),
        }
      );

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.message ?? `Request failed (${res.status})`);
      }

      setSuccess(true);
      setName('');
      
      setTimeout(() => {
        onSuccess?.();
      }, 500);
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setSubmitting(false);
    }
  }

  const handleCancel = () => {
    if (onCancel) {
      onCancel();
    } else {
      router.back();
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
      <div className="bg-gradient-to-r from-slate-900 to-slate-800 p-6">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-slate-700/50 rounded-lg">
            {isEditing ? (
              <Edit3 className="w-5 h-5 text-blue-400" />
            ) : (
              <Plus className="w-5 h-5 text-emerald-400" />
            )}
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">
              {isEditing ? 'Edit Desk' : 'Add New Desk'}
            </h1>
            <p className="text-sm text-slate-400">
              {isEditing ? 'Update desk details' : 'Create a new desk in this zone'}
            </p>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="p-6 space-y-6">
        <div>
          <label className="flex items-center gap-2 text-sm font-medium text-slate-700 mb-2">
            <LayoutGrid className="w-4 h-4 text-slate-400" />
            Desk Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (validationError) validateName(e.target.value);
            }}
            required
            placeholder="e.g. Desk 12"
            maxLength={50}
            className="w-full border-2 border-slate-200 rounded-lg px-4 py-2.5 text-sm 
                     focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
                     placeholder:text-slate-400 transition-all"
          />
          <div className="flex items-center justify-between mt-1">
            <p className="text-xs text-slate-400">
              Choose a descriptive name for easy identification
            </p>
            <span className="text-xs text-slate-400">
              {name.length}/50
            </span>
          </div>
        </div>

        {validationError && (
          <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
            <p className="text-sm text-amber-800">{validationError}</p>
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
            <AlertCircle className="w-4 h-4 text-red-600 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium text-red-800 mb-1">
                {isEditing ? 'Failed to update desk' : 'Failed to create desk'}
              </p>
              <p className="text-sm text-red-700">{error}</p>
            </div>
          </div>
        )}

        {success && (
          <div className="flex items-start gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
            <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium text-green-800 mb-1">
                {isEditing ? 'Desk updated successfully!' : 'Desk created successfully!'}
              </p>
              <p className="text-sm text-green-700">
                Redirecting...
              </p>
            </div>
          </div>
        )}

        <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <Info className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
          <p className="text-xs text-blue-700">
            Desk will be added to zone ID: {zoneId}
          </p>
        </div>

        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={submitting || success}
            className="flex-1 inline-flex items-center justify-center gap-2 bg-slate-900 
                     text-white rounded-lg px-4 py-3 text-sm font-medium 
                     hover:bg-slate-800 transition-all disabled:opacity-50 
                     disabled:cursor-not-allowed"
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Saving...
              </>
            ) : success ? (
              <>
                <CheckCircle2 className="w-4 h-4" />
                Saved!
              </>
            ) : isEditing ? (
              <>
                <Save className="w-4 h-4" />
                Save Changes
              </>
            ) : (
              <>
                <Plus className="w-4 h-4" />
                Add Desk
              </>
            )}
          </button>
          
          <button
            type="button"
            onClick={handleCancel}
            disabled={submitting}
            className="px-4 py-3 border-2 border-slate-200 text-slate-700 rounded-lg 
                     text-sm font-medium hover:bg-slate-50 hover:border-slate-300 
                     transition-all disabled:opacity-50 inline-flex items-center gap-2"
          >
            <X className="w-4 h-4" />
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}