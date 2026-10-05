import { LoginForm } from "@/features/auth/components/login-form";
import { SessionExpiredNotice } from "@/features/auth/components/session-expired-notice";
import { Suspense } from "react";

export default function LoginPage() {
  return (
    <LoginForm
      notice={
        <Suspense fallback={null}>
          <SessionExpiredNotice />
        </Suspense>
      }
    />
  );
}
