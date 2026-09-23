// Field styling shared by the profile edit forms.
export const inputClass =
  "h-11 w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3.5 text-sm text-white outline-none transition-shadow placeholder:text-neutral-500 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/15";
export const textareaClass =
  "w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3.5 py-2.5 text-sm text-white outline-none transition-shadow placeholder:text-neutral-500 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/15";
export const errorTextClass = "text-sm text-red-400";

// Reads a mutation's error the way every `catch (err)` block here always
// did: the Error's own message, or a fallback.
export function mutationError(
  mutation: { isError: boolean; error: unknown },
  fallback: string,
): string {
  if (!mutation.isError) return "";
  return mutation.error instanceof Error ? mutation.error.message : fallback;
}
