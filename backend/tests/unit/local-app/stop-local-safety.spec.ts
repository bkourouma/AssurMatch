import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const script = readFileSync("scripts/local-app/stop-local.ps1", "utf8");

describe("local stop script safety", () => {
  it("does not stop processes only because they own local app ports", () => {
    expect(script).not.toContain("Stop-Process -Id $owner");
    expect(script).not.toMatch(/\$owners\s*=\s*Get-NetTCPConnection[\s\S]*Stop-Process/);
  });

  it("filters stopped processes through AssurMatch launcher markers first", () => {
    expect(script).toContain("function Test-AssurMatchLocalProcess");
    expect(script).toContain("scripts\\local-app\\api-runner.mjs");
    expect(script).toContain(".local\\logs\\public-3601.cmd");
    expect(script).toContain("$portOwnerIds -contains $Process.ProcessId");
    expect(script).toContain("node_modules\\next\\dist\\server\\lib\\start-server.js");
    expect(script).toContain("node_modules\\next\\dist\\bin\\next");
    expect(script).toContain("Non-AssurMatch processes are left untouched");
  });
});
