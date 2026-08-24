'use client';

import { useState } from 'react';
import { getAuthHeaders } from '@/lib/api';
import { 
  MapPin, 
  Loader2, 
  AlertCircle, 
  CheckCircle2,
  Save,
  X,
  Edit3,
  Info,
  Building2
} from 'lucide-react';

interface ZoneFormProps {
  zoneId: string;
  initialName: string;
  onSuccess: () => void;
  onCancel?: () => void;
}

export default function ZoneForm({
  zoneId,
  initialName,
  onSuccess,
  onCancel,
}: ZoneFormProps) {
  const [name, setName] = useState(initialName);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [hasChanges, setHasChanges] = useState(false);

  const validateName = (value: string): boolean => {
    if (!value.trim()) {
      setValidationError('Zone name is required');
      return false;
    }
    
    if (value.trim().length < 2) {
      setValidationError('Zone name must be at least 2 characters');
      return false;
    }
    
    if (value.trim().length > 50) {
      setValidationError('Zone name must be less than 50 characters');
      return false;
    }
    
    setValidationError(null);
    return true;
  };

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    setSaving(true);

    if (!validateName(name)) {
      setSaving(false);
      return;
    }

    if (!hasChanges) {
      setSaving(false);
      onSuccess();
      return;
    }

    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/zones/${zoneId}`,
        {
          method: 'PATCH',
          headers: {
            ...getAuthHeaders(),
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: name.trim(),
          }),
        },
      );

      if (!res.ok) {
        let message = `Failed to update zone (${res.status})`;

        try {
          const data = await res.json();

          if (Array.isArray(data?.message)) {
            message = data.message.join(', ');
          } else if (typeof data?.message === 'string') {
            message = data.message;
          }
        } catch {
          // Keep the default error message.
        }

        throw new Error(message);
      }

      const updatedZone = await res.json();

      setName(updatedZone.name ?? name.trim());
      setSuccess(true);
      setHasChanges(false);
      
      setTimeout(() => {
        onSuccess();
      }, 500);
      
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to update zone',
      );
      setSaving(false);
    }
  }

  const handleCancel = () => {
    if (onCancel) {
      onCancel();
    } else {
      setName(initialName);
      setHasChanges(false);
      setValidationError(null);
      setError(null);
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
      <div className="bg-gradient-to-r from-slate-900 to-slate-800 p-6">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-slate-700/50 rounded-lg">
            <Edit3 className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Edit Zone</h1>
            <p className="text-sm text-slate-400">Update zone information</p>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="p-6 space-y-6">
        <div>
          <label
            htmlFor="zone-name"
            className="flex items-center gap-2 text-sm font-medium text-slate-700 mb-2"
          >
            <MapPin className="w-4 h-4 text-slate-400" />
            Zone Name
          </label>

          <input
            id="zone-name"
            type="text"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setHasChanges(e.target.value !== initialName);
              if (validationError) validateName(e.target.value);
            }}
            placeholder="e.g. Main Floor"
            maxLength={50}
            className="w-full border-2 border-slate-200 rounded-lg px-4 py-2.5 text-sm 
                     focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
                     placeholder:text-slate-400 transition-all"
          />
          <div className="flex items-center justify-between mt-1">
            <p className="text-xs text-slate-400">
              Choose a descriptive name for this zone
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
                Failed to update zone
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
                Zone updated successfully!
              </p>
              <p className="text-sm text-green-700">
                Changes have been saved.
              </p>
            </div>
          </div>
        )}

        <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <Info className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
          <p className="text-xs text-blue-700">
            Zone ID: {zoneId}
          </p>
        </div>

        {hasChanges && (
          <div className="flex items-start gap-2 p-3 bg-slate-50 border border-slate-200 rounded-lg">
            <Building2 className="w-4 h-4 text-slate-500 mt-0.5 shrink-0" />
            <p className="text-xs text-slate-600">
              You have unsaved changes
            </p>
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={saving || !name.trim() || success}
            className="flex-1 inline-flex items-center justify-center gap-2 bg-slate-900 
                     text-white rounded-lg px-4 py-3 text-sm font-medium 
                     hover:bg-slate-800 transition-all disabled:opacity-50 
                     disabled:cursor-not-allowed"
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Saving...
              </>
            ) : success ? (
              <>
                <CheckCircle2 className="w-4 h-4" />
                Saved!
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                Save Changes
              </>
            )}
          </button>
          
          <button
            type="button"
            onClick={handleCancel}
            disabled={saving}
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