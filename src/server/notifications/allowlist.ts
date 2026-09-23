/**
 * Non-production recipient allowlist (§14.1 non-negotiable #3). Entries may be
 * full addresses/numbers, an email domain ("@outlyy.com") or a phone prefix
 * ("+9198765"). Empty list in non-production ⇒ nothing sends.
 */
export function isRecipientAllowed(recipient: string, allowlist: string[]): boolean {
  if (!allowlist.length) return false;
  const r = recipient.trim().toLowerCase();
  return allowlist.some((entry) => {
    const a = entry.trim().toLowerCase();
    if (!a) return false;
    if (a.startsWith("@")) return r.endsWith(a);
    if (a.startsWith("+") && !r.includes("@")) return r.startsWith(a);
    return r === a;
  });
}
