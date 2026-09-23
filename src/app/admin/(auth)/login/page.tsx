import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: { absolute: "Sign in — OUTLYY Admin" } };

/** /admin/login — step 1 of 2 (password). The client form calls POST /api/admin/auth/login. */
export default function AdminLoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
