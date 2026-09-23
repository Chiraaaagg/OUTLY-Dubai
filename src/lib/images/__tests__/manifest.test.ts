import { describe, expect, it } from "vitest";
import { IMAGE_MANIFEST, SCENE_PHOTOS, imageSpecFor, parseImageRef, pexelsCdnUrl } from "../manifest";
import { activities } from "@/lib/data/activities";
import { combos } from "@/lib/data/combos";
import { categories } from "@/lib/data/categories";
import { attractions, collections } from "@/lib/data/collections";
import { landingPages } from "@/lib/data/landing-pages";
import { sceneKeys } from "@/components/ui/scene";

describe("image manifest", () => {
  it("covers every catalogue image ref with at least one curated photo", () => {
    const refs: string[] = [
      ...activities.flatMap((a) => a.images),
      ...combos.map((c) => c.heroImage),
      ...categories.map((c) => c.heroImage),
      ...collections.map((c) => c.heroImage),
      ...attractions.map((a) => a.heroImage),
      ...landingPages.map((l) => l.heroImage),
    ];
    const missing = refs.filter((r) => {
      const resolved = imageSpecFor(r);
      return !resolved || !resolved.spec.photos[resolved.ref.index] && resolved.ref.index === 0;
    });
    expect(missing).toEqual([]);
  });

  it("every activity ref is entity-specific, not a shared scene", () => {
    for (const a of activities) {
      for (const src of a.images) {
        const ref = parseImageRef(src);
        expect(ref?.kind).toBe("activity");
        expect(ref?.slug).toBe(a.slug);
      }
    }
  });

  it("maps every illustrated scene key to a photo (legacy safety net)", () => {
    for (const key of sceneKeys) expect(SCENE_PHOTOS[key]?.photos.length, key).toBeGreaterThan(0);
  });

  it("has no manifest entry without a query or fallback", () => {
    for (const [k, spec] of Object.entries(IMAGE_MANIFEST)) {
      expect(spec.queries.length, k).toBeGreaterThan(0);
      expect(spec.fallback, k).toBeTruthy();
    }
  });

  it("builds cropped, responsive CDN urls", () => {
    expect(pexelsCdnUrl(18889488, 800)).toBe(
      "https://images.pexels.com/photos/18889488/pexels-photo-18889488.jpeg?auto=compress&cs=tinysrgb&fit=crop&w=800&h=520",
    );
    expect(pexelsCdnUrl(1, 480, "png")).toContain("pexels-photo-1.png");
  });
});
