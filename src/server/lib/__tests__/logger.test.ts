import { describe, expect, it } from "vitest";
import { redact, scrubText } from "../logger";

/** Mercury finding: key-based redaction let PII through inside error texts. */
describe("logger redaction of error texts", () => {
  const pg = 'new row for relation "inquiries" violates check constraint "x"\nFailing row contains (0192, +919912345678, Asha Rao, asha@example.test, Hotel).';

  it("scrubs Postgres row dumps, key values, emails and phone numbers", () => {
    const out = scrubText(pg + '\nKey (lead_phone)=(+919912345678) already exists.');
    expect(out).not.toMatch(/919912345678|Asha|asha@example/);
    expect(out).toContain("Failing row contains ([redacted])");
    expect(out).toContain("Key (lead_phone)=([redacted])");
  });

  it("applies to Error objects and error-like string fields, not to ordinary fields", () => {
    const fields = redact({ error: new Error(pg), message: "sent to +91 99123 45678", processingError: "user a@b.co failed", batchId: "0192f0aa-1234", count: 3 });
    const text = JSON.stringify(fields);
    expect(text).not.toMatch(/919912345678|99123 45678|Asha|a@b\.co/);
    expect(fields.batchId).toBe("0192f0aa-1234");
    expect(fields.count).toBe(3);
  });

  it("covers row values containing brackets, other phone spellings and camelCase keys", () => {
    const out = scrubText("Failing row contains (1, +919912345678, Asha (Rao), Palm Hotel (Deira), x@y.co).");
    expect(out).not.toMatch(/Asha|Rao|Palm|Deira|x@y/);
    for (const phone of ["+971 (50) 123 4567", "971.50.123.4567", "+91 99123-45678"]) expect(scrubText(`call ${phone} now`), phone).toBe("call [number] now");
    const fields = redact({ errorMessage: "user +919912345678", msg: "a@b.co" });
    expect(JSON.stringify(fields)).not.toMatch(/919912345678|a@b\.co/);
  });

  it("leaves dates, ISO timestamps and short numbers readable", () => {
    expect(scrubText("ran at 2026-10-25T10:00:00Z for 2026-10-25, 42 rows, version 17")).toBe("ran at 2026-10-25T10:00:00Z for 2026-10-25, 42 rows, version 17");
  });

  it("keeps ordinary error messages readable", () => {
    expect(scrubText("Version 3 of zz-test is missing — cannot revert")).toBe("Version 3 of zz-test is missing — cannot revert");
  });
});
