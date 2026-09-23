/**
 * WhatsApp template registry — version-controlled, submitted to the BSP
 * verbatim (AC-WA-04, §08.6). Nothing in here is ever edited in a dashboard:
 * a copy change is a new version (`_v2`) plus a new env override, never an
 * in-place edit of an approved body.
 *
 * Rules that keep a template approvable (Meta review):
 *  - Body placeholders are positional `{{1}}`..`{{n}}`, contiguous from 1.
 *  - No placeholder at the very start or end of the body, none adjacent.
 *  - Every placeholder has a realistic example value (Meta rejects blanks).
 *  - Category `utility`: only sent in reply to something the customer did
 *    (they submitted an inquiry). Marketing copy never goes through these.
 *  - Tone (§17 §3.7/§3.9): plain, specific, no urgency theatre. The deadline
 *    is a concrete timestamp the confirmation page already showed.
 *
 * This module is pure (no env, no I/O) so unit tests and the ops doc can
 * import it. Runtime template *names* may be overridden per environment via
 * WHATSAPP_TEMPLATE_* in `templates.ts`; the bodies here are the truth.
 */

export type WhatsAppTemplateCategory = "utility" | "marketing" | "authentication";

export interface WhatsAppTemplateDefinition {
  /** Name as registered with the BSP. Snake case, versioned suffix. */
  name: string;
  category: WhatsAppTemplateCategory;
  /** BCP-47 language code as Meta expects it. */
  language: "en";
  /** Body text with positional placeholders. Submitted verbatim. */
  body: string;
  /** One entry per placeholder, in order — the examples Meta review sees. */
  examples: string[];
  /** Human description of each placeholder, for the ops submission sheet. */
  variables: string[];
  /** What triggers it, for the ops doc. */
  usage: string;
}

export const WHATSAPP_TEMPLATES = {
  /**
   * T+0 acknowledgement (§17 §7.2 step 6). {{5}} carries the in-hours /
   * out-of-hours phrase so one approved template covers both cases while the
   * promise still visibly adapts (§3.9 rule 2).
   */
  inquiry_ack_v1: {
    name: "inquiry_ack_v1",
    category: "utility",
    language: "en",
    body:
      "Hi {{1}}, got it — your OUTLYY reference is {{2}}.\n\n" +
      "{{3}} from OUTLYY {{5}} — you'll have a reply by {{4}}.\n\n" +
      "Nothing is charged until you say yes. If anything changes from the price you saw, we tell you first.",
    examples: ["Priya", "INQ-240913-7", "Jyoti", "4:18 pm GST today", "is checking with the operator now"],
    variables: [
      "Customer first name",
      "Inquiry reference",
      "Assigned agent first name",
      "Concrete reply deadline (e.g. 4:18 pm GST today / 10:30 am GST tomorrow)",
      "Availability phrase: 'is checking with the operator now' (in hours) or 'is offline right now' (out of hours)",
    ],
    usage: "Sent once, immediately after a customer submits an inquiry with WhatsApp consent.",
  },

  /**
   * Follow-up ladder rungs and the SLA-breach "still checking" note
   * (§17 §7.2 ladder, §7.5). {{3}} is the stage-specific sentence so one
   * template serves all rungs; every value it can take is listed in
   * `FOLLOWUP_SENTENCES` below and in the ops doc.
   */
  inquiry_followup_v1: {
    name: "inquiry_followup_v1",
    category: "utility",
    language: "en",
    body: "Hi {{1}}, about your OUTLYY inquiry {{2}} — {{3}}\n\nReply here and {{4}} will pick it up.",
    examples: ["Priya", "INQ-240913-7", "did the options work for you? Happy to adjust dates or swap anything.", "Jyoti"],
    variables: [
      "Customer first name",
      "Inquiry reference",
      "Stage sentence (one of the fixed sentences in FOLLOWUP_SENTENCES)",
      "Assigned agent first name",
    ],
    usage: "Follow-up ladder (T+2h, T+24h, T+72h) and the proactive 'still checking' message on an SLA breach.",
  },

  /**
   * Internal ops alert to the WHATSAPP_OPS_ALERT_NUMBER. Recipient is our
   * own number, so the body is terse and carries the console link.
   */
  inquiry_ops_alert_v1: {
    name: "inquiry_ops_alert_v1",
    category: "utility",
    language: "en",
    body: "New inquiry {{1}} — {{2}}, {{3}} item(s). Assigned to {{4}}, reply by {{5}}.\n\nOpen {{6}} in the console.",
    examples: ["INQ-240913-7", "₹48,500", "2", "Jyoti", "4:18 pm GST today", "https://outlyy.com/admin/inquiries/0192"],
    variables: ["Inquiry reference", "Indicative total (INR)", "Item count", "Assigned agent first name", "Reply deadline", "Console URL"],
    usage: "Internal only: sent to the ops alert number on every new inquiry.",
  },
} as const satisfies Record<string, WhatsAppTemplateDefinition>;

export type WhatsAppTemplateKey = keyof typeof WHATSAPP_TEMPLATES;

/** The complete, fixed set of sentences `inquiry_followup_v1` {{3}} may carry. */
export const FOLLOWUP_SENTENCES = {
  stillChecking: "the operator hasn't come back to us yet. Sorry for the wait — you'll hear from us as soon as they do.",
  stage1: "did the options work for you? Happy to adjust dates or swap anything.",
  stage2: "if the price or dates were the issue, tell us — there's usually a version that fits.",
  stage3: "this is our last note. We'll leave it here unless you'd like us to keep the options open — just reply yes.",
} as const;

/** Availability phrases for `inquiry_ack_v1` {{5}}. */
export const ACK_AVAILABILITY = {
  inHours: "is checking with the operator now",
  outOfHours: "is offline right now",
} as const;

const PLACEHOLDER = /\{\{(\d+)\}\}/g;

/** Placeholder numbers used in a body, sorted ascending. */
export function placeholdersOf(body: string): number[] {
  const seen = new Set<number>();
  for (const m of body.matchAll(PLACEHOLDER)) seen.add(Number(m[1]));
  return [...seen].sort((a, b) => a - b);
}

/**
 * Renders a template body with positional variables — used for the log
 * adapter output and the `text` column, so what we record is exactly what
 * the customer would read. Throws when a placeholder has no value: a missing
 * parameter is rejected by the BSP anyway, better to fail here.
 */
export function renderWhatsAppBody(body: string, variables: Record<string, string>): string {
  return body.replace(PLACEHOLDER, (_, n: string) => {
    const v = variables[n];
    if (v === undefined || v === "") throw new Error(`WhatsApp template placeholder {{${n}}} has no value`);
    return v;
  });
}

/** Ordered list of body parameters as the Cloud API expects them. */
export function positionalParameters(variables: Record<string, string>): string[] {
  return Object.keys(variables)
    .map(Number)
    .filter((n) => Number.isInteger(n) && n > 0)
    .sort((a, b) => a - b)
    .map((n) => variables[String(n)]);
}

/** Sanity checks a definition against the rules in the header comment. Returns problems (empty = ok). */
export function validateTemplate(def: WhatsAppTemplateDefinition): string[] {
  const problems: string[] = [];
  const ph = placeholdersOf(def.body);
  ph.forEach((n, i) => {
    if (n !== i + 1) problems.push(`placeholders must be contiguous from 1 (found {{${n}}} at position ${i + 1})`);
  });
  if (def.examples.length !== ph.length) problems.push(`examples (${def.examples.length}) do not match placeholders (${ph.length})`);
  if (def.variables.length !== ph.length) problems.push(`variables (${def.variables.length}) do not match placeholders (${ph.length})`);
  if (/^\s*\{\{\d+\}\}/.test(def.body)) problems.push("body starts with a placeholder");
  if (/\{\{\d+\}\}\s*$/.test(def.body)) problems.push("body ends with a placeholder");
  if (/\{\{\d+\}\}\s*\{\{\d+\}\}/.test(def.body)) problems.push("adjacent placeholders");
  if (!/^[a-z0-9_]+$/.test(def.name)) problems.push("name must be lowercase snake_case");
  if (def.body.length > 1024) problems.push("body exceeds 1024 characters");
  return problems;
}
