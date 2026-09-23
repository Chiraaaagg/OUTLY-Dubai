# WhatsApp templates — submission sheet (AC-WA-04)

**Source of truth:** `src/server/notifications/whatsapp-templates.ts`. Submit each body below to the BSP **verbatim** (copy from the code, not from this page, if they ever differ — the unit test `templates.test.ts` guards the code). Never edit an approved template in the BSP dashboard: a copy change is a new name (`_v2`), a new registry entry, and a `WHATSAPP_TEMPLATE_*` override once approved.

All three are **category `utility`, language `en`**. They are only ever sent in reply to something the customer did (submitted an inquiry), so they qualify as utility under Meta's July 2025 rules and are free inside an open customer-service window (§08.2).

Meta rejects bodies that start or end with a placeholder, have adjacent placeholders, or ship without example values. `validateTemplate()` enforces those rules and the test suite runs it on every definition.

---

## 1. `inquiry_ack_v1`

**Sent:** once, immediately after a customer submits an inquiry with WhatsApp consent (`INQUIRY_ACK`, §17 §7.2 step 6).

**Body**

```
Hi {{1}}, got it — your OUTLYY reference is {{2}}.

{{3}} from OUTLYY {{5}} — you'll have a reply by {{4}}.

Nothing is charged until you say yes. If anything changes from the price you saw, we tell you first.
```

| # | Variable | Example |
|---|---|---|
| 1 | Customer first name | `Priya` |
| 2 | Inquiry reference | `INQ-240913-7` |
| 3 | Assigned agent first name | `Jyoti` |
| 4 | Concrete reply deadline | `4:18 pm IST today` |
| 5 | Availability phrase — exactly one of: `is checking with the operator now` (in hours) / `is offline right now` (out of hours) | `is checking with the operator now` |

Rendered in hours: *"Jyoti from OUTLYY is checking with the operator now — you'll have a reply by 4:18 pm IST today."*
Rendered out of hours: *"Jyoti from OUTLYY is offline right now — you'll have a reply by 9:30 am IST tomorrow."* (§17 §3.9 rule 2: the promise visibly adapts.)

---

## 2. `inquiry_followup_v1`

**Sent:** follow-up ladder rungs T+2h / T+24h / T+72h (`INQUIRY_FOLLOWUP`) and the proactive "still checking" message on an SLA breach (`INQUIRY_STILL_CHECKING`, §17 §7.5). One template, four fixed sentences in `{{3}}`.

**Body**

```
Hi {{1}}, about your OUTLYY inquiry {{2}} — {{3}}

Reply here and {{4}} will pick it up.
```

| # | Variable | Example |
|---|---|---|
| 1 | Customer first name | `Priya` |
| 2 | Inquiry reference | `INQ-240913-7` |
| 3 | Stage sentence — exactly one of the four below | `did the options work for you? Happy to adjust dates or swap anything.` |
| 4 | Assigned agent first name | `Jyoti` |

`{{3}}` values (from `FOLLOWUP_SENTENCES`; include all four as examples if the BSP allows multiple):

- still checking: `the operator hasn't come back to us yet. Sorry for the wait — you'll hear from us as soon as they do.`
- stage 1 (T+2h): `did the options work for you? Happy to adjust dates or swap anything.`
- stage 2 (T+24h): `if the price or dates were the issue, tell us — there's usually a version that fits.`
- stage 3 (T+72h): `this is our last note. We'll leave it here unless you'd like us to keep the options open — just reply yes.`

If Meta review rejects the sentence-length variable, split into `inquiry_followup_1_v1` … `_3_v1` + `inquiry_still_checking_v1` with `{{1}}`, `{{2}}`, `{{3}}` = name, reference, agent; the change is confined to `whatsapp-templates.ts` and the `INQUIRY_FOLLOWUP` / `INQUIRY_STILL_CHECKING` cases in `templates.ts`.

---

## 3. `inquiry_ops_alert_v1` (internal)

**Sent:** to `WHATSAPP_OPS_ALERT_NUMBER` on every new inquiry (`INQUIRY_OPS_ALERT`). Recipient is our own number; still a template because a business-initiated message outside a service window must be one.

**Body**

```
New inquiry {{1}} — {{2}}, {{3}} item(s). Assigned to {{4}}, reply by {{5}}.

Open {{6}} in the console.
```

| # | Variable | Example |
|---|---|---|
| 1 | Inquiry reference | `INQ-240913-7` |
| 2 | Indicative total (INR) | `₹48,500` |
| 3 | Item count | `2` |
| 4 | Assigned agent first name | `Jyoti` |
| 5 | Reply deadline | `4:18 pm IST today` |
| 6 | Console URL | `https://outlyy.com/admin/inquiries/0192` |

Optional at launch: if the ops number is left blank, no WhatsApp ops alert is attempted and the email alert still goes out.

---

## Names and env overrides

| Registry name | Env override | Used by |
|---|---|---|
| `inquiry_ack_v1` | `WHATSAPP_TEMPLATE_INQUIRY_ACK` | `INQUIRY_ACK` |
| `inquiry_followup_v1` | `WHATSAPP_TEMPLATE_INQUIRY_FOLLOWUP` | `INQUIRY_FOLLOWUP`, `INQUIRY_STILL_CHECKING` |
| `inquiry_ops_alert_v1` | `WHATSAPP_TEMPLATE_INQUIRY_OPS_ALERT` | `INQUIRY_OPS_ALERT` |

The override must equal the name the BSP approved. **The current `.env.example` / `.env.local` set `outlyy_inquiry_ack_v1` / `outlyy_inquiry_followup_v1`** — either register under those names or clear the overrides so the registry defaults apply. Do not run with a mismatch: the Cloud API rejects an unknown template name on every send and the row lands in `failed`.

## Submission checklist

1. Business verification + display name approved (long pole — §08.3).
2. Submit the three templates, category utility, language English, with the example values above.
3. Record the approved names in `WHATSAPP_TEMPLATE_*` for staging and production.
4. Send one test of each to an allowlisted number on staging (`NOTIFICATION_RECIPIENT_ALLOWLIST`), confirm the rendered text matches `notifications.payload` / the log line.
5. Only then set `WHATSAPP_PROVIDER=cloud_api` in production.
