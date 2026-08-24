'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getAuthHeaders } from '@/lib/api';
import { 
  DoorOpen, 
  Loader2, 
  AlertCircle, 
  CheckCircle2,
  Save,
  Plus,
  X,
  Users,
  Info,
  Edit3,
  Minus,
  PlusCircle
} from 'lucide-react';

interface RoomFormProps {
  initialName?: string;
  initialCapacity?: number;
  roomId?: string;
  onSuccess?: () => void;
  onCancel?: () => void;
}

export default function RoomForm({
  initialName = '',
  initialCapacity = 1,
  roomId,
  onSuccess,
  onCancel,
}: RoomFormProps) {
  const { zoneId } = useParams<{ zoneId: string }>();
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [capacity, setCapacity] = useState(initialCapacity);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const isEditing = Boolean(roomId);

  const validateForm = (): boolean => {
    if (!name.trim()) {
      setValidationError('Room name is required');
      return false;
    }
    
    if (name.trim().length < 2) {
      setValidationError('Room name must be at least 2 characters');
      return false;
    }
    
    if (name.trim().length > 100) {
      setValidationError('Room name must be less than 100 characters');
      return false;
    }
    
    if (capacity < 1) {
      setValidationError('Capacity must be at least 1');
      return false;
    }
    
    if (capacity > 500) {
      setValidationError('Capacity cannot exceed 500');
      return false;
    }
    
    setValidationError(null);
    return true;
  };

  const adjustCapacity = (delta: number) => {
    const newCapacity = capacity + delta;
    if (newCapacity >= 1 && newCapacity <= 500) {
      setCapacity(newCapacity);
      if (validationError) validateForm();
    }
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setSuccess(false);

    if (!validateForm()) {
      setSubmitting(false);
      return;
    }

    try {
      const base = process.env.NEXT_PUBLIC_API_URL;
      const res = await fetch(
        isEditing ? `${base}/rooms/${roomId}` : `${base}/rooms`, 
        {
          method: isEditing ? 'PATCH' : 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...getAuthHeaders(),
          },
          body: JSON.stringify({ 
            name: name.trim(), 
            capacity, 
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
      setCapacity(1);
      
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
              {isEditing ? 'Edit Room' : 'Add New Room'}
            </h1>
            <p className="text-sm text-slate-400">
              {isEditing ? 'Update room details' : 'Create a new room in this zone'}
            </p>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="p-6 space-y-6">
        <div>
          <label className="flex items-center gap-2 text-sm font-medium text-slate-700 mb-2">
            <DoorOpen className="w-4 h-4 text-slate-400" />
            Room Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (validationError) validateForm();
            }}
            required
            placeholder="e.g. Conference Room A"
            maxLength={100}
            className="w-full border-2 border-slate-200 rounded-lg px-4 py-2.5 text-sm 
                     focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
                     placeholder:text-slate-400 transition-all"
          />
          <div className="flex items-center justify-between mt-1">
            <p className="text-xs text-slate-400">
              Choose a descriptive name for easy identification
            </p>
            <span className="text-xs text-slate-400">
              {name.length}/100
            </span>
          </div>
        </div>

        <div>
          <label className="flex items-center gap-2 text-sm font-medium text-slate-700 mb-2">
            <Users className="w-4 h-4 text-slate-400" />
            Capacity
          </label>
          
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => adjustCapacity(-1)}
              disabled={capacity <= 1}
              className="p-2 border-2 border-slate-200 rounded-lg hover:bg-slate-50 
                       transition-all disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <Minus className="w-4 h-4 text-slate-600" />
            </button>
            
            <div className="flex-1 relative">
              <input
                type="number"
                min={1}
                max={500}
                value={capacity}
                onChange={(e) => {
                  setCapacity(Number(e.target.value));
                  if (validationError) validateForm();
                }}
                required
                className="w-full border-2 border-slate-200 rounded-lg px-4 py-2.5 
                         text-sm text-center focus:outline-none focus:ring-2 
                         focus:ring-blue-500 focus:border-transparent"
              />
              <Users className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 
                                  -translate-y-1/2" />
            </div>
            
            <button
              type="button"
              onClick={() => adjustCapacity(1)}
              disabled={capacity >= 500}
              className="p-2 border-2 border-slate-200 rounded-lg hover:bg-slate-50 
                       transition-all disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <PlusCircle className="w-4 h-4 text-slate-600" />
            </button>
          </div>
          
          <div className="flex items-center justify-between mt-1">
            <p className="text-xs text-slate-400">
              Maximum number of people
            </p>
            <span className="text-xs text-slate-400">
              {capacity} {capacity === 1 ? 'person' : 'people'}
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
                {isEditing ? 'Failed to update room' : 'Failed to create room'}
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
                {isEditing ? 'Room updated successfully!' : 'Room created successfully!'}
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
            Room will be added to zone ID: {zoneId}
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
                Add Room
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