"use client";

import { useRouter } from "next/navigation";
import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useState,
} from "react";
import { apiFetch } from "../api-client";

type User = {
  id: string;
  fullName: string;
  email: string;
  role: "admin" | "user";
} | null;

type AuthContextType = {
  user: User;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (fullName: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  updateCredentials: (
    currentPassword: string,
    newFullName?: string,
    newEmail?: string,
    newPassword?: string,
  ) => Promise<void>;
};

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<User>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function refetchMe() {
      let nextUser: User = null;
      try {
        const res = await apiFetch("/auth/me");
        nextUser = res.data;
      } catch {
        nextUser = null;
      }
      if (cancelled) return;
      setUser(nextUser);
      setLoading(false);
    }

    refetchMe();

    return () => {
      cancelled = true;
    };
  }, []);

  async function login(email: string, password: string) {
    const res = await apiFetch("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    setUser(res.data);
  }

  async function signup(fullName: string, email: string, password: string) {
    await apiFetch("/auth/signup", {
      method: "POST",
      body: JSON.stringify({ fullName, email, password }),
    });
    await login(email, password); // auto-login after signup
  }

  async function logout() {
    try {
      await apiFetch("/auth/logout", { method: "POST" });
    } finally {
      // Always clear local session state and redirect, even if the
      // request itself failed (e.g. network error) — logging out must
      // never leave the UI stuck in a "logged in" state.
      setUser(null);
      router.push("/login");
    }
  }

  async function updateCredentials(
    currentPassword: string,
    newFullName?: string,
    newEmail?: string,
    newPassword?: string,
  ) {
    const res = await apiFetch("/auth/me", {
      method: "PATCH",
      body: JSON.stringify({
        currentPassword,
        newFullName,
        newEmail,
        newPassword,
      }),
    });

    setUser(res.data);
  }

  return (
    <AuthContext.Provider
      value={{ user, loading, login, signup, logout, updateCredentials }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);

  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }

  return ctx;
}
