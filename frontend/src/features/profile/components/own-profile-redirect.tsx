"use client";

import { ROUTES } from "@/constants/routes";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

// Editing is handled by the dynamic /profile/edit/[id] route, so this just
// sends the caller to their own id — kept so every existing "/profile/edit"
// link (header, profile view page) keeps working unchanged.
export function OwnProfileRedirect() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading || !user) return;
    router.replace(ROUTES.profileEdit(user.id));
  }, [user, loading, router]);

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <p className="text-sm text-muted">Redirecting…</p>
    </main>
  );
}
