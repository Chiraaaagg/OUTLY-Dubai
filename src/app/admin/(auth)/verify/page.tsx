import type { Metadata } from "next";
import { Suspense } from "react";
import { VerifyForm } from "./verify-form";

export const metadata: Metadata = { title: { absolute: "Two-factor code — OUTLYY Admin" } };

/** /admin/verify — step 2 of 2 (TOTP). Calls POST /api/admin/auth/totp/verify. */
export default function AdminVerifyPage() {
  return (
    <Suspense>
      <VerifyForm />
    </Suspense>
  );
}
