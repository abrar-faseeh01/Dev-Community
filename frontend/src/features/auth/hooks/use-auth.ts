import { useCurrentUser } from "../queries/auth-queries";

// `loading` is true only until the first /auth/me answer arrives; `user` is
// null when nobody is signed in.
export function useAuth() {
  const { data, isPending } = useCurrentUser();
  return { user: data ?? null, loading: isPending };
}
