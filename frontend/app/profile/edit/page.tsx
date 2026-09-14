"use client";

import { useAuth } from "@/lib/auth/auth-context";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

// Editing is handled by the dynamic /profile/edit/[id] route, so this page
// just sends the caller to their own id — kept around so every existing
// "/profile/edit" link (header, profile view page) keeps working unchanged.
export default function EditOwnProfileRedirect() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading || !user) return;
    router.replace(`/profile/edit/${user.id}`);
  }, [user, loading, router]);

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <p className="text-sm text-muted">Redirecting…</p>
    </main>
  );
}
