import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function readFiles(root: string): string {
  return readdirSync(root).map((entry) => {
    const path = join(root, entry);
    if (statSync(path).isDirectory()) return readFiles(path);
    if (!/\.(ts|tsx)$/.test(path)) return "";
    return readFileSync(path, "utf8");
  }).join("\n");
}

describe("frontend runtime separation", () => {
  it("keeps public app free of broker/admin API clients and routes", () => {
    const publicSource = readFiles(join(process.cwd(), "apps", "public", "app"));
    expect(publicSource).not.toContain("/broker/");
    expect(publicSource).not.toContain("/admin/");
    expect(publicSource).not.toContain("broker-api");
    expect(publicSource).not.toContain("admin-api");
  });
});
