import { describe, expect, it } from "vitest";
import { activities } from "@/lib/data/activities";
import { categories } from "@/lib/data/categories";
import { activityInputSchema, activitySchema, categoryInputSchema, projectActivity } from "../activity.schema";

describe("activity schema", () => {
  it("accepts every fixture activity as a stored document", () => {
    for (const a of activities) {
      const r = activitySchema.safeParse(a);
      expect(r.success, `${a.slug}: ${JSON.stringify(r.error?.issues.slice(0, 3))}`).toBe(true);
    }
  });

  it("accepts every fixture as an input once derived fields are stripped", () => {
    for (const a of activities) {
      const { id: _id, rating: _r, reviewCount: _rc, bookedThisMonth: _b, ...input } = a;
      const r = activityInputSchema.safeParse(input);
      expect(r.success, `${a.slug}: ${JSON.stringify(r.error?.issues.slice(0, 3))}`).toBe(true);
    }
  });

  it("rejects unknown keys (mass assignment)", () => {
    const { id: _id, rating: _r, reviewCount: _rc, bookedThisMonth: _b, ...input } = activities[0];
    expect(activityInputSchema.safeParse({ ...input, isAdmin: true }).success).toBe(false);
    expect(activityInputSchema.safeParse({ ...input, price: { ...input.price, hack: 1 } }).success).toBe(false);
  });

  it("rejects bad slugs, negative money, non-https images, instant without instant confirmation", () => {
    const { id: _id, rating: _r, reviewCount: _rc, bookedThisMonth: _b, ...input } = activities[0];
    expect(activityInputSchema.safeParse({ ...input, slug: "Bad Slug" }).success).toBe(false);
    expect(activityInputSchema.safeParse({ ...input, price: { adult: { inr: -1, aed: 0 } } }).success).toBe(false);
    expect(activityInputSchema.safeParse({ ...input, images: ["http://x.test/a.jpg"] }).success).toBe(false);
    expect(activityInputSchema.safeParse({ ...input, images: ["javascript:alert(1)"] }).success).toBe(false);
    expect(activityInputSchema.safeParse({ ...input, confirmation: "manual", fulfilmentMode: "instant" }).success).toBe(false);
  });

  it("projects the scalar columns in minor units", () => {
    const p = projectActivity(activities[0]);
    expect(p.priceFromInr).toBe(BigInt(activities[0].price.adult.inr * 100));
    expect(p.title).toBe(activities[0].title);
  });

  it("accepts every fixture category", () => {
    for (const c of categories) {
      const r = categoryInputSchema.safeParse(c);
      expect(r.success, `${c.slug}: ${JSON.stringify(r.error?.issues.slice(0, 3))}`).toBe(true);
    }
  });
});
