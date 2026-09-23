"use client";

import {
  COMMENT_BODY_MAX,
  commentFormSchema,
  type CommentFormValues,
} from "@/features/comments/schemas/comment-schema";
import { splitCommentFormErrors } from "@/features/comments/utils/errors";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useId, useMemo, useRef } from "react";
import { useForm, useWatch } from "react-hook-form";

type CommentFormProps = {
  // Starting text — the current body when editing, empty for a new comment
  // or reply.
  initialValue?: string;
  placeholder: string;
  submitLabel: string;
  pendingLabel: string;
  // True while the request is in flight; disables the submit button.
  isPending: boolean;
  // The failed save's error, if any. A message about the body is put on the
  // field; anything else shows in a banner above the form.
  error?: unknown;
  // Must return the request's promise: the form waits on it to reset on
  // success or leave the typed text alone on failure.
  onSubmit: (body: string) => Promise<unknown>;
  // Omitted for the composer (always visible, nothing to cancel back to);
  // reply and edit usages pass one to close the inline form.
  onCancel?: () => void;
  // Reply/edit forms open on demand and should grab focus immediately; the
  // composer, always on screen, should not steal focus just because the
  // page loaded.
  autoFocus?: boolean;
  // Fires whenever the body field's dirty state changes (RHF's own
  // isDirty). The caller uses this to know, without reading the text
  // itself, whether it's safe to discard this form if the reader tries to
  // open a different one — see "Open-form coordination" in the plan.
  onDirtyChange?: (dirty: boolean) => void;
};

const textareaClass =
  "w-full rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm text-foreground outline-none transition-shadow placeholder:text-gray-400 focus:border-accent focus:ring-2 focus:ring-accent/15 aria-[invalid=true]:border-red-400";
const errorTextClass = "text-sm text-red-700";

function Counter({ id, length, max }: { id: string; length: number; max: number }) {
  const over = length > max;
  return (
    <span
      id={id}
      className={`text-xs tabular-nums ${over ? "font-medium text-red-700" : "text-muted"}`}
    >
      {length} / {max}
    </span>
  );
}

// The one form behind the composer, every reply, and every edit (see
// comment-list.tsx and comment-item.tsx) — the same division of labor
// post-form.tsx already uses for posts: this owns validation, the character
// counter and the pending lock; framing (label text, what onSubmit and
// onCancel actually do) is entirely the caller's.
export function CommentForm({
  initialValue = "",
  placeholder,
  submitLabel,
  pendingLabel,
  isPending,
  error,
  onSubmit,
  onCancel,
  autoFocus = false,
  onDirtyChange,
}: CommentFormProps) {
  const {
    register,
    handleSubmit,
    reset,
    setError,
    control,
    formState: { errors, isDirty },
  } = useForm<CommentFormValues>({
    resolver: zodResolver(commentFormSchema),
    defaultValues: { body: initialValue },
  });

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  const ids = useId();
  const bodyId = `${ids}-body`;

  const bodyValue = useWatch({ control, name: "body" }) ?? "";
  const bodyLength = bodyValue.trim().length;

  const { fields: serverFields, banner } = useMemo(
    () =>
      error === undefined || error === null
        ? { fields: {}, banner: null }
        : splitCommentFormErrors(error, "Failed to save the comment."),
    [error],
  );

  useEffect(() => {
    if (serverFields.body) {
      setError(
        "body",
        { type: "server", message: serverFields.body },
        { shouldFocus: true },
      );
    }
  }, [serverFields, setError]);

  // Merges RHF's own ref (it needs the node to register/focus the field)
  // with the plain ref this component uses for autoFocus.
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const { ref: registerBodyRef, ...bodyField } = register("body");

  useEffect(() => {
    if (autoFocus) textareaRef.current?.focus();
  }, [autoFocus]);

  // Unlike post-form.tsx's inFlight guard — which stays locked after a
  // success because that form's own page navigates away — this one releases
  // on success too: the composer resets and stays right where it is, ready
  // for the next comment, and a reply/edit form's caller unmounts it once
  // its own onSuccess runs, so there is no in-between window where a second
  // click on this same instance could slip through either way.
  const inFlight = useRef(false);
  async function submitValid(values: CommentFormValues) {
    if (inFlight.current || isPending) return;
    inFlight.current = true;
    try {
      await onSubmit(values.body);
      // Only the composer (no onCancel) needs to reset itself for the next
      // comment. A reply/edit form is unmounted by its caller once its own
      // onSuccess flips the open-form state — by the time onSubmit's promise
      // resolves here, that unmount may already be scheduled, so calling
      // reset() on it would be a wasted (or unsafe) update on a component
      // that's on its way out. The caller closing it is what "resets" it.
      if (!onCancel) reset();
    } catch {
      // The failure reaches the reader through the `error` prop.
    } finally {
      inFlight.current = false;
    }
  }

  return (
    <form
      onSubmit={(event) => handleSubmit(submitValid)(event)}
      onKeyDown={(event) => {
        // Scoped to this form's own subtree via React's normal event
        // bubbling — never a document-level listener, so an open reply/edit
        // draft can't be closed by Escape pressed inside an unrelated
        // ConfirmDialog (or vice versa). See "Open-form coordination".
        if (event.key === "Escape" && onCancel) {
          event.preventDefault();
          onCancel();
        }
      }}
      noValidate
      className="flex flex-col gap-2"
    >
      {banner && (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700"
        >
          {banner}
        </p>
      )}

      <label htmlFor={bodyId} className="sr-only">
        {placeholder}
      </label>
      <textarea
        id={bodyId}
        rows={3}
        placeholder={placeholder}
        aria-invalid={errors.body ? "true" : "false"}
        aria-describedby={
          errors.body ? `${bodyId}-error ${bodyId}-count` : `${bodyId}-count`
        }
        {...bodyField}
        ref={(el) => {
          registerBodyRef(el);
          textareaRef.current = el;
        }}
        className={textareaClass}
      />

      {errors.body && (
        <span id={`${bodyId}-error`} role="alert" className={errorTextClass}>
          {errors.body.message}
        </span>
      )}

      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <Counter id={`${bodyId}-count`} length={bodyLength} max={COMMENT_BODY_MAX} />
        <div className="flex items-center gap-2">
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              disabled={isPending}
              className="rounded-lg px-3 py-1.5 text-sm font-medium text-muted transition-colors hover:text-foreground focus:outline-none focus:ring-2 focus:ring-accent/30 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Cancel
            </button>
          )}
          <button
            type="submit"
            disabled={isPending}
            className="rounded-lg bg-accent px-4 py-1.5 text-sm font-semibold text-accent-foreground transition-colors hover:bg-accent/90 focus:outline-none focus:ring-2 focus:ring-accent/30 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isPending ? pendingLabel : submitLabel}
          </button>
        </div>
      </div>
    </form>
  );
}
