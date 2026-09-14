"use client";

import { useState } from "react";
import { Download, MessageCircle, Printer, Share2 } from "lucide-react";
import { useApp } from "@/components/providers/app-provider";
import { Button } from "@/components/ui/button";
import { resendVoucher } from "@/lib/api";
import { track } from "@/lib/analytics";
import { hash } from "@/lib/utils";

/**
 * Voucher actions and QR block.
 *
 * The QR here is a deterministic pattern generated from the booking reference —
 * it is a visual stand-in, not a scannable code. Production renders the real
 * supplier barcode returned with the confirmation. Kept in one component so the
 * swap is a single file.
 *
 * Offline access is a hard requirement (AC-MOB-02): customers open vouchers in
 * a Dubai car park on roaming. The page is static HTML with no runtime data
 * fetch, so once viewed it stays in the browser cache and renders offline.
 */
export function VoucherActions({ reference }: { reference: string }) {
  const { toast } = useApp();
  const [sending, setSending] = useState<"whatsapp" | "email" | null>(null);

  const send = async (channel: "whatsapp" | "email") => {
    setSending(channel);
    await resendVoucher(reference, channel);
    setSending(null);
    track(channel === "whatsapp" ? "voucher_sent_whatsapp" : "voucher_downloaded", {
      booking_reference: reference,
    });
    toast({
      tone: "success",
      title: channel === "whatsapp" ? "Sent to WhatsApp" : "Emailed",
      body: "It should arrive within a few seconds.",
    });
  };

  return (
    <div className="flex flex-wrap gap-2 print:hidden">
      <Button
        onClick={() => {
          track("voucher_downloaded", { booking_reference: reference });
          window.print();
        }}
      >
        <Download className="h-[1.15rem] w-[1.15rem]" />
        Download PDF
      </Button>
      <Button
        variant="whatsapp"
        loading={sending === "whatsapp"}
        onClick={() => void send("whatsapp")}
      >
        <MessageCircle className="h-[1.15rem] w-[1.15rem]" />
        Send to WhatsApp
      </Button>
      <Button variant="outline" loading={sending === "email"} onClick={() => void send("email")}>
        Resend email
      </Button>
      <Button variant="ghost" onClick={() => window.print()}>
        <Printer className="h-[1.15rem] w-[1.15rem]" />
        Print
      </Button>
      <Button
        variant="ghost"
        onClick={() => {
          if (navigator.share) {
            void navigator.share({ title: `OUTLY booking ${reference}`, url: window.location.href });
          } else {
            void navigator.clipboard?.writeText(window.location.href);
            toast({ tone: "success", title: "Link copied" });
          }
        }}
      >
        <Share2 className="h-[1.15rem] w-[1.15rem]" />
        Share
      </Button>
    </div>
  );
}

/** Deterministic QR-like block. Visual placeholder for the supplier barcode. */
export function VoucherCode({ reference, size = 132 }: { reference: string; size?: number }) {
  const cells = 21;
  const seed = hash(reference);
  const filled = (x: number, y: number) => {
    // Finder patterns in three corners, like a real QR — keeps it recognisable.
    const inFinder =
      (x < 7 && y < 7) || (x > cells - 8 && y < 7) || (x < 7 && y > cells - 8);
    if (inFinder) {
      const fx = x < 7 ? x : x - (cells - 7);
      const fy = y < 7 ? y : y - (cells - 7);
      const ring = Math.max(Math.abs(fx - 3), Math.abs(fy - 3));
      return ring !== 2;
    }
    return (hash(`${reference}:${x}:${y}`) + seed) % 3 === 0;
  };

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${cells} ${cells}`}
      role="img"
      aria-label={`Voucher code for booking ${reference}`}
      className="rounded-lg bg-white p-1"
    >
      <rect width={cells} height={cells} fill="#fff" />
      {Array.from({ length: cells }, (_, y) =>
        Array.from({ length: cells }, (_, x) =>
          filled(x, y) ? <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill="#14101f" /> : null,
        ),
      )}
    </svg>
  );
}
