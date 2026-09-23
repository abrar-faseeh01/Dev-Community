"use client";

import { useEffect, useId, useRef, useState } from "react";

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  message: string;
  // Some delete flows (e.g. an admin acting on someone else's data) want an
  // optional reason for the audit log; others (e.g. deleting your own data)
  // don't — the caller decides per use, matching each call site's existing
  // behavior rather than always showing it.
  showReasonInput?: boolean;
  // Label of the confirm button. Defaults to "Delete", which is what every
  // existing caller wants.
  confirmLabel?: string;
  // Shown on the confirm button while `isPending`.
  pendingLabel?: string;
  // While true, both buttons and the reason input are disabled, and Escape or
  // a click outside the dialog no longer closes it — closing mid-request would
  // hide a delete that is still going to happen.
  isPending?: boolean;
  // A failure from the confirmed action, shown inside the dialog so the
  // reader can retry or cancel.
  error?: string;
  // A small accent pill above the title, used to mark an admin acting on
  // someone else's content.
  badge?: string;
  onConfirm: (reason?: string) => void;
  onCancel: () => void;
};

const inputClass =
  "h-11 w-full rounded-lg border border-border bg-surface px-3.5 text-sm text-foreground outline-none transition-shadow placeholder:text-gray-400 focus:border-accent focus:ring-2 focus:ring-accent/15";

const FOCUSABLE_SELECTOR =
  'button:not(:disabled), input:not(:disabled), [tabindex]:not([tabindex="-1"])';

// Plain React state + conditional rendering — no dialog/modal library,
// consistent with how the header's dropdowns were built.
export function ConfirmDialog({
  open,
  title,
  message,
  showReasonInput = false,
  confirmLabel = "Delete",
  pendingLabel = "Working…",
  isPending = false,
  error,
  badge,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const [reason, setReason] = useState("");
  const dialogRef = useRef<HTMLDivElement>(null);
  const reasonInputRef = useRef<HTMLInputElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const ids = useId();
  const titleId = `${ids}-title`;
  const messageId = `${ids}-message`;

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

  // Who had focus right before the dialog opened. Its own cleanup — which
  // fires exactly when `open` flips back to false, or on unmount — gives
  // focus back to it, but only if it's still on the page: the button that
  // opened this dialog can be gone by the time the dialog closes (e.g. a
  // comment delete removes the very Delete button that opened this).
  // Choosing a replacement target in that case is the caller's job, not
  // this component's.
  const openerRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!open) return;
    openerRef.current = document.activeElement as HTMLElement | null;
    return () => {
      const opener = openerRef.current;
      if (opener && opener.isConnected) opener.focus();
    };
  }, [open]);

  // Moves focus into the dialog once it's open: the reason input when the
  // dialog has one, otherwise Cancel — a plain delete confirm previously
  // received no focus at all.
  useEffect(() => {
    if (!open) return;
    if (showReasonInput) reasonInputRef.current?.focus();
    else cancelButtonRef.current?.focus();
  }, [open, showReasonInput]);

  // Always call the latest onCancel without re-registering the keydown
  // listener on every render (the same idiom hooks/use-dismissible.ts uses
  // for its own dismiss callback).
  const onCancelRef = useRef(onCancel);
  useEffect(() => {
    onCancelRef.current = onCancel;
  });

  useEffect(() => {
    if (!open) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (!isPending) onCancelRef.current();
        return;
      }
      if (e.key !== "Tab") return;

      // Trap Tab/Shift+Tab inside the dialog so it can't leave to whatever
      // is behind it while open.
      const dialog = dialogRef.current;
      if (!dialog) return;
      const focusable = dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, isPending]);

  if (!open) return null;

  function handleConfirm() {
    if (isPending) return;
    onConfirm(showReasonInput ? reason.trim() || undefined : undefined);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
      onClick={() => {
        if (!isPending) onCancel();
      }}
    >
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={messageId}
        className="w-full max-w-sm rounded-xl border border-border bg-surface p-5 shadow-lg sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        {badge && (
          <span className="mb-2 inline-block rounded-full border border-accent/25 bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent">
            {badge}
          </span>
        )}
        <h2 id={titleId} className="text-base font-semibold text-foreground">
          {title}
        </h2>
        <p id={messageId} className="mt-2 text-sm text-muted">
          {message}
        </p>

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
            aria-label="Reason (optional)"
            readOnly={isPending}
            className={`${inputClass} mt-4`}
          />
        )}

        {error && (
          <p
            role="alert"
            className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3.5 py-3 text-sm text-red-700"
          >
            {error}
          </p>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            ref={cancelButtonRef}
            type="button"
            onClick={onCancel}
            disabled={isPending}
            className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-background disabled:cursor-not-allowed disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={isPending}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isPending ? pendingLabel : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
