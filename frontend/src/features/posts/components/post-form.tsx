"use client";

import { getPostChanges, hasPostChanges } from "@/features/posts/utils/changes";
import { splitPostFormErrors } from "@/features/posts/utils/errors";
import {
  POST_BODY_MAX,
  POST_TITLE_MAX,
  postFormSchema,
  type PostFormValues,
} from "@/features/posts/schemas/post-schema";
import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useForm, useWatch } from "react-hook-form";

type PostFormProps = {
  // Starting values — empty for a new post, the loaded post for an edit.
  defaultValues?: Partial<Pick<PostFormValues, "title" | "body">>;
  submitLabel: string;
  pendingLabel: string;
  // True while the request is in flight, and — set by the caller — after it
  // succeeds and the page is on its way elsewhere, so the button stays
  // locked the whole time.
  isPending: boolean;
  // The failed save's error, if any. Messages about title/body are put on
  // those fields; the rest show in a banner. The typed text is left alone.
  error?: unknown;
  // Must return the request's promise: the form waits on it so it can tell a
  // failed submit (re-arm) from a successful one (stay locked).
  onSubmit: (values: PostFormValues) => Promise<unknown>;
  cancelHref: string;
  // Editing: keep the button disabled until the trimmed title or body
  // differs from what the form started with (`defaultValues`).
  requireChange?: boolean;
  // An admin moderating someone else's post: an optional reason, sent to the
  // author with the notification and recorded in the audit log.
  showReasonField?: boolean;
};

const inputClass =
  "w-full rounded-lg border border-neutral-800 bg-neutral-900 px-3.5 text-sm text-white outline-none transition-shadow placeholder:text-neutral-600 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/15 aria-[invalid=true]:border-red-500";
const errorTextClass = "text-sm text-red-400";

function Counter({ id, length, max }: { id: string; length: number; max: number }) {
  const over = length > max;
  return (
    <span
      id={id}
      className={`text-xs tabular-nums ${over ? "font-medium text-red-400" : "text-neutral-400"}`}
    >
      {length} / {max}
    </span>
  );
}

// One form for creating and editing a post. React Hook Form + the Zod schema
// (features/posts/schemas/post-schema.ts) validate before anything is sent: title and body are
// trimmed first, so a whitespace-only value is "required", not sent.
export function PostForm({
  defaultValues,
  submitLabel,
  pendingLabel,
  isPending,
  error,
  onSubmit,
  cancelHref,
  requireChange = false,
  showReasonField = false,
}: PostFormProps) {
  const {
    register,
    handleSubmit,
    setError,
    control,
    formState: { errors },
  } = useForm<PostFormValues>({
    resolver: zodResolver(postFormSchema),
    defaultValues: { title: "", body: "", reason: "", ...defaultValues },
  });

  const ids = useId();
  const titleId = `${ids}-title`;
  const bodyId = `${ids}-body`;

  // The counters follow the trimmed length, because that is what the schema
  // and the server check — a trailing space doesn't count against the limit.
  const titleValue = useWatch({ control, name: "title" }) ?? "";
  const bodyValue = useWatch({ control, name: "body" }) ?? "";
  const titleLength = titleValue.trim().length;
  const bodyLength = bodyValue.trim().length;

  // The starting text, frozen when the form mounts, so a refetch that hands
  // in newer defaultValues can't quietly move the goalposts under what the
  // reader has typed.
  const [baseline] = useState({
    title: defaultValues?.title ?? "",
    body: defaultValues?.body ?? "",
  });
  const changed =
    !requireChange ||
    hasPostChanges(
      getPostChanges(baseline, { title: titleValue, body: bodyValue }),
    );

  const { fields: serverFields, banner } = useMemo(
    () =>
      error === undefined || error === null
        ? { fields: {}, banner: null }
        : splitPostFormErrors(error, "Failed to save the post."),
    [error],
  );

  // Put a server message about a field on that field (and focus the first
  // one). RHF clears it again as soon as the reader edits the field.
  useEffect(() => {
    if (serverFields.title) {
      setError("title", { type: "server", message: serverFields.title }, { shouldFocus: true });
    }
    if (serverFields.body) {
      setError(
        "body",
        { type: "server", message: serverFields.body },
        { shouldFocus: !serverFields.title },
      );
    }
  }, [serverFields, setError]);

  // The button is disabled while a request runs, but that flag reaches the
  // DOM a moment after the click — long enough for a double-click or a
  // double Enter to slip a second submit through. This ref closes that gap
  // synchronously. It is released only if the save fails: after a success
  // the form stays locked and the caller navigates away, so a second post
  // can't be created in the gap before the page changes.
  const inFlight = useRef(false);
  async function submitValid(values: PostFormValues) {
    if (inFlight.current || isPending || !changed) return;
    inFlight.current = true;
    try {
      await onSubmit(values);
    } catch {
      // The failure reaches the reader through the `error` prop.
      inFlight.current = false;
    }
  }

  return (
    <form
      onSubmit={(event) => handleSubmit(submitValid)(event)}
      noValidate
      className="flex flex-col gap-5"
    >
      {banner && (
        <p
          role="alert"
          className="rounded-lg border border-red-900/50 bg-red-950/40 px-3.5 py-3 text-sm text-red-300"
        >
          {banner}
        </p>
      )}

      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-3">
          <label htmlFor={titleId} className="text-sm font-medium text-white">
            Title
          </label>
          <Counter id={`${titleId}-count`} length={titleLength} max={POST_TITLE_MAX} />
        </div>
        <input
          id={titleId}
          type="text"
          autoComplete="off"
          aria-invalid={errors.title ? "true" : "false"}
          aria-describedby={
            errors.title ? `${titleId}-error ${titleId}-count` : `${titleId}-count`
          }
          {...register("title")}
          className={`${inputClass} h-11`}
        />
        {errors.title && (
          <span id={`${titleId}-error`} role="alert" className={errorTextClass}>
            {errors.title.message}
          </span>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-3">
          <label htmlFor={bodyId} className="text-sm font-medium text-white">
            Body
          </label>
          <Counter id={`${bodyId}-count`} length={bodyLength} max={POST_BODY_MAX} />
        </div>
        <textarea
          id={bodyId}
          rows={12}
          aria-invalid={errors.body ? "true" : "false"}
          aria-describedby={
            errors.body ? `${bodyId}-error ${bodyId}-count` : `${bodyId}-count`
          }
          {...register("body")}
          className={`${inputClass} py-2.5`}
        />
        {errors.body && (
          <span id={`${bodyId}-error`} role="alert" className={errorTextClass}>
            {errors.body.message}
          </span>
        )}
      </div>

      {showReasonField && (
        <div className="flex flex-col gap-2">
          <label htmlFor={`${ids}-reason`} className="text-sm font-medium text-white">
            Reason (optional)
          </label>
          <input
            id={`${ids}-reason`}
            type="text"
            autoComplete="off"
            aria-describedby={`${ids}-reason-hint`}
            {...register("reason")}
            className={`${inputClass} h-11`}
          />
          <span id={`${ids}-reason-hint`} className="text-xs text-neutral-400">
            Sent to the author with the notification, and recorded in the audit
            log.
          </span>
        </div>
      )}

      <div className="flex items-center justify-end gap-3">
        <Link
          href={cancelHref}
          className="rounded-lg px-4 py-2.5 text-sm font-medium text-neutral-400 transition-colors hover:text-white focus:outline-none focus:ring-2 focus:ring-emerald-400/30"
        >
          Cancel
        </Link>
        <button
          type="submit"
          disabled={isPending || !changed}
          className="h-11 rounded-lg bg-emerald-400 px-5 text-sm font-semibold text-neutral-950 transition-colors hover:bg-emerald-300 focus:outline-none focus:ring-2 focus:ring-emerald-400/40 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isPending ? pendingLabel : submitLabel}
        </button>
      </div>
    </form>
  );
}
