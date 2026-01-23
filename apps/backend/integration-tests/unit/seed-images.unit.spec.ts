import fs from "fs";
import path from "path";
import { describe, it, expect } from "vitest";

const repoRoot = path.resolve(__dirname, "..", "..", "..", "..");
const backendRoot = path.join(repoRoot, "apps", "backend");
const seedPath = path.join(backendRoot, "src", "scripts", "seed.ts");

function extractImageUrls(seedContents: string): string[] {
  const matches = seedContents.matchAll(/images:\s*\[\s*\{\s*url:\s*"([^"]+)"/g);
  return Array.from(matches, (match) => match[1]);
}

function isExternalUrl(url: string): boolean {
  return url.startsWith("http://") || url.startsWith("https://");
}

describe("seed image URLs", () => {
  it("uses local /uploads paths and files exist", () => {
    const seedContents = fs.readFileSync(seedPath, "utf-8");
    const urls = extractImageUrls(seedContents);

    expect(urls.length).toBeGreaterThan(0);

    for (const url of urls) {
      if (isExternalUrl(url)) {
        continue;
      }

      expect(url.startsWith("/uploads/")).toBe(true);

      const filePath = path.join(backendRoot, url);
      expect(fs.existsSync(filePath)).toBe(true);
    }
  });
});
