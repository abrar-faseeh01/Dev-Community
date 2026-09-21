"use client";

import { ROUTES } from "@/constants/routes";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "./use-auth";

// UX-only guards. The middleware only checks that a cookie exists, so an
// expired session still reaches these pages; the backend (JwtAuthGuard,
// @Roles) is the real boundary. These just send the wrong visitor away
// instead of showing them a page they can't use.

// Signed-out visitors go to /login.
export function useRequireAuth() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.replace(ROUTES.LOGIN);
  }, [loading, user, router]);

  return { user, loading };
}

// Anyone who isn't an admin — signed out included — goes to the home page.
export function useRequireAdmin() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && (!user || user.role !== "admin")) {
      router.replace(ROUTES.HOME);
    }
  }, [loading, user, router]);

  return { user, loading };
}
