'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, Trash2, X } from 'lucide-react';
import {
  confirmCopy,
  DeletableKind,
  deleteResource,
  DeleteImpact,
  DeleteResult,
  fetchDeleteImpact,
  hasActiveBookings,
  refundCopy,
  resultCopy,
} from '@/lib/deleteFlow';

interface Props {
  kind: DeletableKind;
  id: string;
  name: string;
  // Called after a successful delete, when the person dismisses the result.
  onDeleted: (result: DeleteResult) => void;
  // Called when they back out (No / X / Escape / backdrop).
  onClose: () => void;
}

type Phase =
  | { step: 'loading' }
  | { step: 'confirm'; impact: DeleteImpact } // 1: "Are you sure?"
  | { step: 'refund'; impact: DeleteImpact } // 2: upcoming bookings -> refund
  | { step: 'deleting'; impact: DeleteImpact | null }
  | { step: 'done'; result: DeleteResult }
  | { step: 'error'; message: string };

// Two-step confirmation for every delete (owner's requirement):
//   Delete -> "Are you sure you want to delete?"  Yes / No
//   and, only when customers have upcoming bookings on it:
//   "There is an existing booking. Are you sure you want to delete and
//    refund the customers?"  No / Delete and refund N bookings
// The second step is the confirmation of the refund; the API additionally
// requires ?confirmRefund=true so nothing can refund by accident.
export default function ConfirmDeleteDialog({ kind, id, name, onDeleted, onClose }: Props) {
  const [phase, setPhase] = useState<Phase>({ step: 'loading' });
  const primaryRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let cancelled = false;
    fetchDeleteImpact(kind, id)
      .then((impact) => {
        if (!cancelled) setPhase({ step: 'confirm', impact });
      })
      .catch((err) => {
        if (!cancelled) {
          setPhase({ step: 'error', message: err instanceof Error ? err.message : 'Could not check this ' + kind });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [kind, id]);

  const busy = phase.step === 'deleting' || phase.step === 'loading';

  const dismiss = useCallback(() => {
    if (phase.step === 'deleting') return;
    if (phase.step === 'done') onDeleted(phase.result);
    else onClose();
  }, [phase, onClose, onDeleted]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dismiss();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dismiss]);

  // Keep keyboard focus inside the dialog as the step changes.
  useEffect(() => {
    primaryRef.current?.focus();
  }, [phase.step]);

  async function run(confirmRefund: boolean, impact: DeleteImpact | null) {
    setPhase({ step: 'deleting', impact });
    const outcome = await deleteResource(kind, id, { confirmRefund });
    if (outcome.ok) {
      setPhase({ step: 'done', result: outcome.result });
    } else if (outcome.reason === 'ACTIVE_BOOKINGS') {
      // A booking appeared between the preview and the click: move to the
      // refund step with fresh numbers instead of failing.
      setPhase({ step: 'refund', impact: outcome.impact });
    } else {
      setPhase({ step: 'error', message: outcome.message });
    }
  }

  function onYesStep1(impact: DeleteImpact) {
    if (hasActiveBookings(impact)) {
      setPhase({ step: 'refund', impact });
    } else {
      void run(false, impact);
    }
  }

  const title =
    phase.step === 'refund' || (phase.step === 'deleting' && phase.impact && hasActiveBookings(phase.impact))
      ? refundCopy(phase.impact!).title
      : phase.step === 'confirm'
        ? confirmCopy(kind, phase.impact).title
        : phase.step === 'done'
          ? 'Deleted'
          : phase.step === 'error'
            ? 'Could not delete'
            : `Delete ${kind} “${name}”`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) dismiss();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-dialog-title"
        data-testid="delete-dialog"
        data-step={phase.step}
        className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 p-5">
          <div className="flex items-start gap-3">
            <span
              className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${
                phase.step === 'done' ? 'bg-emerald-100 text-emerald-600' : 'bg-red-100 text-red-600'
              }`}
            >
              {phase.step === 'done' ? <CheckCircle2 className="h-5 w-5" /> : phase.step === 'refund' ? <AlertTriangle className="h-5 w-5" /> : <Trash2 className="h-5 w-5" />}
            </span>
            <h2 id="delete-dialog-title" className="pt-1 text-base font-semibold text-slate-900">
              {title}
            </h2>
          </div>
          <button
            type="button"
            onClick={dismiss}
            disabled={phase.step === 'deleting'}
            aria-label="Close"
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-40"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-3 p-5 text-sm text-slate-600">
          {phase.step === 'loading' && (
            <p className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Checking what this will affect…
            </p>
          )}

          {phase.step === 'confirm' && (() => {
            const c = confirmCopy(kind, phase.impact);
            return (
              <>
                <p className="font-medium text-slate-900">{c.question}</p>
                {c.lines.map((l) => (
                  <p key={l}>{l}</p>
                ))}
                {hasActiveBookings(phase.impact) && (
                  <p className="rounded-lg bg-amber-50 p-3 text-amber-800">
                    Heads up: it has upcoming bookings. You&apos;ll be asked to confirm cancelling and refunding them next.
                  </p>
                )}
              </>
            );
          })()}

          {phase.step === 'refund' && (() => {
            const c = refundCopy(phase.impact);
            return (
              <>
                <p className="font-medium text-slate-900">{c.question}</p>
                <ul className="list-disc space-y-1 pl-5">
                  {c.lines.map((l) => (
                    <li key={l}>{l}</li>
                  ))}
                </ul>
                <p className="text-xs text-slate-500">Refunds usually show up on the customer&apos;s card within 5–10 days.</p>
              </>
            );
          })()}

          {phase.step === 'deleting' && (
            <p className="flex items-center gap-2 text-slate-700">
              <Loader2 className="h-4 w-4 animate-spin" />
              {phase.impact && hasActiveBookings(phase.impact) ? 'Cancelling bookings and refunding…' : 'Deleting…'}
            </p>
          )}

          {phase.step === 'done' && (() => {
            const r = resultCopy(phase.result);
            return (
              <p className={r.warning ? 'rounded-lg bg-amber-50 p-3 text-amber-800' : 'text-slate-700'} data-testid="delete-result">
                {r.text}
              </p>
            );
          })()}

          {phase.step === 'error' && (
            <p className="rounded-lg bg-red-50 p-3 text-red-700" role="alert">
              {phase.message}
            </p>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50 p-4">
          {phase.step === 'confirm' && (
            <>
              <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200">
                No
              </button>
              <button
                ref={primaryRef}
                type="button"
                onClick={() => onYesStep1(phase.impact)}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
              >
                {confirmCopy(kind, phase.impact).yes}
              </button>
            </>
          )}

          {phase.step === 'refund' && (
            <>
              <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200">
                No
              </button>
              <button
                ref={primaryRef}
                type="button"
                onClick={() => void run(true, phase.impact)}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
              >
                {refundCopy(phase.impact).yes}
              </button>
            </>
          )}

          {phase.step === 'done' && (
            <button
              ref={primaryRef}
              type="button"
              onClick={() => onDeleted(phase.result)}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
            >
              Done
            </button>
          )}

          {phase.step === 'error' && (
            <button
              ref={primaryRef}
              type="button"
              onClick={onClose}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
            >
              Close
            </button>
          )}

          {busy && (
            <button type="button" disabled className="rounded-lg bg-slate-200 px-4 py-2 text-sm font-medium text-slate-500">
              Please wait…
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
