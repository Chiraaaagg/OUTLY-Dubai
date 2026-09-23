import type { Metadata } from "next";
import { Suspense } from "react";
import { EnrolForm } from "./enrol-form";

export const metadata: Metadata = { title: { absolute: "Set up two-factor — OUTLYY Admin" } };

/** /admin/enrol — first sign-in: issue a TOTP secret, then confirm a code (AC-SEC-02). */
export default function AdminEnrolPage() {
  return (
    <Suspense>
      <EnrolForm />
    </Suspense>
  );
}
