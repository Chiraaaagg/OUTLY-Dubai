import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  EVENT_CHANNELS,
  MAX_SUBJECT_LENGTH,
  NOTIFICATION_EVENTS,
  clampSubject,
  cleanVariable,
  escapeHtml,
  renderTemplate,
  supportsChannel,
  type NotificationChannel,
  type NotificationEvent,
  type TemplateContext,
} from "../templates";
import { ACK_AVAILABILITY, FOLLOWUP_SENTENCES, WHATSAPP_TEMPLATES, placeholdersOf, positionalParameters, renderWhatsAppBody, validateTemplate } from "../whatsapp-templates";

const XSS = `<script>alert("x")</script>`;

function fixture(overrides: Partial<TemplateContext> = {}): TemplateContext {
  return {
    reference: "INQ-240913-7",
    leadName: `Priya ${XSS} Sharma`,
    leadFirstName: "Priya",
    leadPhone: "+919876543210",
    leadEmail: "priya@example.com",
    agentName: "Jyoti Mehta",
    agentFirstName: "Jyoti",
    agentRole: "Dubai trip specialist",
    deadlineIso: "2026-09-14T10:48:00.000Z",
    deadlineLabel: "4:18 pm IST today",
    outOfHours: false,
    items: [
      { title: `Desert Safari ${XSS}`, date: "2026-10-02", time: "3:00 pm", pax: { adult: 2, child: 1, infant: 0, senior: 0 }, indicativeTotalInr: 12500 },
      { title: "Burj Khalifa & 'At the Top'", date: "2026-10-03", pax: { adult: 2, child: 1, infant: 0, senior: 0 }, indicativeTotalInr: 9800 },
    ],
    itemCount: 2,
    travelDateFrom: "2026-10-02",
    datesFlexible: false,
    guests: 3,
    dietary: "Jain",
    hotel: `Atlantis ${XSS}`,
    specialRequests: `Window seats please ${XSS} & no onions`,
    budgetBand: "mid",
    indicativeTotalInr: 22300,
    currency: "INR",
    source: "adp",
    siteUrl: "https://outlyy.com",
    consoleUrl: "https://outlyy.com/admin/inquiries/0192abcd",
    whatsappNumber: "919000000001",
    supportEmail: "hello@outlyy.com",
    ...overrides,
  };
}

const combos: [NotificationEvent, NotificationChannel][] = [];
for (const event of NOTIFICATION_EVENTS) for (const channel of EVENT_CHANNELS[event]) combos.push([event, channel]);

describe("WhatsApp template registry", () => {
  it("every definition passes the approvability rules", () => {
    for (const def of Object.values(WHATSAPP_TEMPLATES)) {
      expect(validateTemplate(def), def.name).toEqual([]);
      expect(def.category).toBe("utility");
      expect(def.language).toBe("en");
      expect(def.name).toMatch(/_v\d+$/);
    }
  });

  it("registry keys equal template names", () => {
    for (const [key, def] of Object.entries(WHATSAPP_TEMPLATES)) expect(def.name).toBe(key);
  });

  it("examples render the body without gaps", () => {
    for (const def of Object.values(WHATSAPP_TEMPLATES)) {
      const vars = Object.fromEntries(def.examples.map((v, i) => [String(i + 1), v]));
      const text = renderWhatsAppBody(def.body, vars);
      expect(text).not.toMatch(/\{\{\d+\}\}/);
    }
  });

  it("renderWhatsAppBody refuses a missing or empty parameter", () => {
    expect(() => renderWhatsAppBody("Hi {{1}}, ref {{2}}.", { "1": "Priya" })).toThrow(/\{\{2\}\}/);
    expect(() => renderWhatsAppBody("Hi {{1}}.", { "1": "" })).toThrow();
  });

  it("positionalParameters orders numerically, not lexically", () => {
    expect(positionalParameters({ "10": "j", "2": "b", "1": "a" })).toEqual(["a", "b", "j"]);
    expect(placeholdersOf("{{3}} x {{1}} y {{2}} z {{1}}")).toEqual([1, 2, 3]);
  });

  it("the ack template has a slot for the availability phrase and the followup one for the stage sentence", () => {
    expect(placeholdersOf(WHATSAPP_TEMPLATES.inquiry_ack_v1.body)).toHaveLength(5);
    expect(placeholdersOf(WHATSAPP_TEMPLATES.inquiry_followup_v1.body)).toHaveLength(4);
    for (const s of Object.values(FOLLOWUP_SENTENCES)) expect(s).not.toMatch(/\n/);
    for (const s of Object.values(ACK_AVAILABILITY)) expect(s).not.toMatch(/\n/);
  });
});

describe("renderTemplate — every event/channel", () => {
  const savedEnv = { ...process.env };
  // The developer's shell / .env.local may carry WHATSAPP_TEMPLATE_* overrides; tests assert the registry defaults.
  beforeEach(() => {
    delete process.env.WHATSAPP_TEMPLATE_INQUIRY_ACK;
    delete process.env.WHATSAPP_TEMPLATE_INQUIRY_FOLLOWUP;
    delete process.env.WHATSAPP_TEMPLATE_INQUIRY_OPS_ALERT;
  });
  afterEach(() => {
    process.env = { ...savedEnv };
  });

  it.each(combos)("%s on %s renders with a text part", (event, channel) => {
    const r = renderTemplate(event, channel, fixture({ stage: 2, reassigned: true, orderReference: "OUT-240914-3" }));
    expect(r.text.length).toBeGreaterThan(20);
    if (channel === "email") {
      expect(r.subject).toBeTruthy();
      expect(r.subject!.length).toBeLessThanOrEqual(MAX_SUBJECT_LENGTH);
      expect(r.subject).not.toMatch(/[\r\n]/);
      expect(r.html).toMatch(/^<!doctype html>/);
      expect(r.templateName).toBeUndefined();
    } else {
      expect(r.templateName).toBeTruthy();
      expect(r.html).toBeUndefined();
      expect(r.variables).toBeTruthy();
    }
  });

  it("supportsChannel mirrors EVENT_CHANNELS", () => {
    expect(supportsChannel("INQUIRY_ACK", "whatsapp")).toBe(true);
    expect(supportsChannel("INQUIRY_WON", "whatsapp")).toBe(false);
    expect(supportsChannel("INQUIRY_ASSIGNED", "whatsapp")).toBe(false);
  });

  it("customer text is escaped in every email html body and never appears raw", () => {
    for (const [event, channel] of combos) {
      if (channel !== "email") continue;
      const r = renderTemplate(event, channel, fixture({ stage: 1, orderReference: "OUT-1" }));
      expect(r.html, `${event} html`).not.toContain("<script>");
      expect(r.html, `${event} html`).not.toContain(XSS);
      // The plain-text part keeps the characters — it is not markup.
      if (r.html!.includes("&lt;script&gt;")) expect(r.text).toContain("<script>");
    }
  });

  it("ops alert email escapes lead name, hotel, notes and item titles", () => {
    const r = renderTemplate("INQUIRY_OPS_ALERT", "email", fixture());
    expect(r.html).toContain("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;");
    expect(r.html).toContain("Window seats please");
    expect(r.html).toContain("Atlantis");
    expect(r.html).toContain("Burj Khalifa &amp; &#39;At the Top&#39;");
    expect(r.html).toContain(`href="https://outlyy.com/admin/inquiries/0192abcd"`);
  });

  it("a javascript: console url is neutralised in hrefs", () => {
    const r = renderTemplate("INQUIRY_OPS_ALERT", "email", fixture({ consoleUrl: "javascript:alert(1)" }));
    expect(r.html).toContain(`href="#"`);
    expect(r.html).not.toContain(`href="javascript:`);
  });

  it("WhatsApp variables are complete for the registry template and text equals the rendered body", () => {
    const checks: [NotificationEvent, keyof typeof WHATSAPP_TEMPLATES, Partial<TemplateContext>][] = [
      ["INQUIRY_ACK", "inquiry_ack_v1", {}],
      ["INQUIRY_ACK", "inquiry_ack_v1", { outOfHours: true }],
      ["INQUIRY_STILL_CHECKING", "inquiry_followup_v1", {}],
      ["INQUIRY_FOLLOWUP", "inquiry_followup_v1", { stage: 1 }],
      ["INQUIRY_FOLLOWUP", "inquiry_followup_v1", { stage: 2 }],
      ["INQUIRY_FOLLOWUP", "inquiry_followup_v1", { stage: 3 }],
      ["INQUIRY_OPS_ALERT", "inquiry_ops_alert_v1", {}],
    ];
    for (const [event, key, overrides] of checks) {
      const r = renderTemplate(event, "whatsapp", fixture(overrides));
      const def = WHATSAPP_TEMPLATES[key];
      const expectedKeys = placeholdersOf(def.body).map(String);
      expect(Object.keys(r.variables!).sort(), `${event} variables`).toEqual(expectedKeys.sort());
      expect(r.templateName).toBe(def.name);
      expect(r.text).toBe(renderWhatsAppBody(def.body, r.variables!));
      for (const v of Object.values(r.variables!)) {
        expect(v, `${event} variable`).not.toMatch(/[\n\t]/);
        expect(v.length).toBeGreaterThan(0);
      }
    }
  });

  it("the ack carries the concrete deadline and adapts out of hours", () => {
    const inHours = renderTemplate("INQUIRY_ACK", "whatsapp", fixture());
    expect(inHours.text).toContain("4:18 pm IST today");
    expect(inHours.text).toContain("INQ-240913-7");
    expect(inHours.text).toContain("Jyoti from OUTLYY is checking with the operator now");
    expect(inHours.variables!["5"]).toBe(ACK_AVAILABILITY.inHours);

    const ooh = renderTemplate("INQUIRY_ACK", "whatsapp", fixture({ outOfHours: true, deadlineLabel: "9:30 am IST tomorrow" }));
    expect(ooh.text).toContain("Jyoti from OUTLYY is offline right now");
    expect(ooh.text).toContain("9:30 am IST tomorrow");
    expect(ooh.variables!["5"]).toBe(ACK_AVAILABILITY.outOfHours);

    const email = renderTemplate("INQUIRY_ACK", "email", fixture({ outOfHours: true, deadlineLabel: "9:30 am IST tomorrow" }));
    expect(email.text).toContain("Our team is offline right now");
    expect(email.text).toContain("by 9:30 am IST tomorrow");
    expect(email.subject).toBe("Got it — INQ-240913-7. Jyoti replies by 9:30 am IST tomorrow");
  });

  it("no urgency theatre: copy never claims scarcity or counts down", () => {
    for (const [event, channel] of combos) {
      const r = renderTemplate(event, channel, fixture({ stage: 3, orderReference: "OUT-1" }));
      expect(r.text.toLowerCase(), `${event}/${channel}`).not.toMatch(/hurry|only \d+ left|spots? left|limited time|act now|expires in/);
    }
  });

  it("follow-up stages differ on WhatsApp (one template, distinct stage sentence)", () => {
    const s1 = renderTemplate("INQUIRY_FOLLOWUP", "whatsapp", fixture({ stage: 1 }));
    const s2 = renderTemplate("INQUIRY_FOLLOWUP", "whatsapp", fixture({ stage: 2 }));
    const s3 = renderTemplate("INQUIRY_FOLLOWUP", "whatsapp", fixture({ stage: 3 }));
    const sc = renderTemplate("INQUIRY_STILL_CHECKING", "whatsapp", fixture());
    expect(new Set([s1.text, s2.text, s3.text, sc.text]).size).toBe(4);
    expect(s3.variables!["3"]).toBe(FOLLOWUP_SENTENCES.stage3);
    expect(sc.variables!["3"]).toBe(FOLLOWUP_SENTENCES.stillChecking);
  });

  it("template names honour the WHATSAPP_TEMPLATE_* overrides", () => {
    process.env.WHATSAPP_TEMPLATE_INQUIRY_ACK = "inquiry_ack_v2";
    process.env.WHATSAPP_TEMPLATE_INQUIRY_FOLLOWUP = "inquiry_followup_v2";
    expect(renderTemplate("INQUIRY_ACK", "whatsapp", fixture()).templateName).toBe("inquiry_ack_v2");
    expect(renderTemplate("INQUIRY_FOLLOWUP", "whatsapp", fixture()).templateName).toBe("inquiry_followup_v2");
    expect(renderTemplate("INQUIRY_STILL_CHECKING", "whatsapp", fixture()).templateName).toBe("inquiry_followup_v2");
  });

  it("subjects are clamped to 78 characters even with long names and labels", () => {
    const r = renderTemplate("INQUIRY_ACK", "email", fixture({ agentFirstName: "Venkatanarasimharajuvaripeta", deadlineLabel: "11:00 pm IST on Monday 21 September" }));
    expect(r.subject!.length).toBeLessThanOrEqual(MAX_SUBJECT_LENGTH);
    expect(r.subject!.endsWith("…")).toBe(true);
    expect(clampSubject("short")).toBe("short");
    expect(clampSubject("a".repeat(100))).toHaveLength(MAX_SUBJECT_LENGTH);
  });

  it("empty item lists fall back to a sensible line", () => {
    const r = renderTemplate("INQUIRY_ACK", "email", fixture({ items: [], itemCount: 0 }));
    expect(r.text).toContain("No specific activities yet");
  });

  it("won email uses the order reference and still names the inquiry", () => {
    const r = renderTemplate("INQUIRY_WON", "email", fixture({ orderReference: "OUT-240914-3" }));
    expect(r.subject).toBe("Confirmed — booking OUT-240914-3");
    expect(r.text).toContain("inquiry INQ-240913-7");
  });

  it("helpers: escapeHtml and cleanVariable", () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;");
    expect(cleanVariable("  multi\n line\t\ttext   here ")).toBe("multi line text here");
    expect(cleanVariable("")).toBe("—");
    expect(cleanVariable("x".repeat(300))).toHaveLength(200);
  });
});
