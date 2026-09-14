"use client";

import { useEffect, useRef, useState } from "react";

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  message: string;
  // Some delete flows (e.g. an admin acting on someone else's data) want an
  // optional reason for the audit log; others (e.g. deleting your own data)
  // don't — the caller decides per use, matching each call site's existing
  // behavior rather than always showing it.
  showReasonInput?: boolean;
  onConfirm: (reason?: string) => void;
  onCancel: () => void;
};

const inputClass =
  "h-11 w-full rounded-lg border border-border bg-surface px-3.5 text-sm text-foreground outline-none transition-shadow placeholder:text-gray-400 focus:border-accent focus:ring-2 focus:ring-accent/15";

// Plain React state + conditional rendering — no dialog/modal library,
// consistent with how the header's dropdowns were built.
export function ConfirmDialog({
  open,
  title,
  message,
  showReasonInput = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const [reason, setReason] = useState("");
  const reasonInputRef = useRef<HTMLInputElement>(null);

  // Reset the reason whenever the dialog transitions closed -> open, e.g.
  // reopening for a different row after cancelling the first. Adjusting
  // state during render (React's documented pattern for "state depends on
  // a prop change") rather than in an effect, since the instance persists
  // across open/close — returning null below doesn't unmount it.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setReason("");
  }

  useEffect(() => {
    if (!open) return;

    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [open, onCancel]);

  useEffect(() => {
    if (open && showReasonInput) {
      reasonInputRef.current?.focus();
    }
  }, [open, showReasonInput]);

  if (!open) return null;

  function handleConfirm() {
    onConfirm(showReasonInput ? reason.trim() || undefined : undefined);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
      onClick={onCancel}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        className="w-full max-w-sm rounded-xl border border-border bg-surface p-5 shadow-lg sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          id="confirm-dialog-title"
          className="text-base font-semibold text-foreground"
        >
          {title}
        </h2>
        <p className="mt-2 text-sm text-muted">{message}</p>

        {showReasonInput && (
          <input
            ref={reasonInputRef}
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleConfirm();
              }
            }}
            placeholder="Reason (optional)"
            className={`${inputClass} mt-4`}
          />
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-background"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
