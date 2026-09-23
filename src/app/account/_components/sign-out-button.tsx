"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useApp } from "@/components/providers/app-provider";
import { logoutCustomer } from "@/lib/api";

/** POST /api/auth/logout clears both cookies and revokes the session row. */
export function SignOutButton() {
  const router = useRouter();
  const { toast } = useApp();
  const [busy, setBusy] = useState(false);

  const signOut = async () => {
    setBusy(true);
    try {
      await logoutCustomer();
      router.replace("/");
      router.refresh();
    } catch {
      setBusy(false);
      toast({ tone: "error", title: "Couldn't sign you out", body: "Try again in a moment." });
    }
  };

  return (
    <Button variant="ghost" size="md" onClick={() => void signOut()} loading={busy} loadingLabel="Signing out…">
      <LogOut className="h-4 w-4" aria-hidden="true" />
      Sign out
    </Button>
  );
}
