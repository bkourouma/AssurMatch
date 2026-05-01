import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const trackedFiles = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
  .split("\0")
  .filter(Boolean)
  .filter((file) => file !== "package-lock.json");

const safeEmailPassValues = new Set([
  "",
  "REDACTED",
  "%EMAIL_SMTP_PASS%",
  "$env:EMAIL_SMTP_PASS",
  "${EMAIL_SMTP_PASS}",
  "${{ secrets.EMAIL_SMTP_PASS }}"
]);

const findings = [];

function isEmailPassAssignmentExempt(file) {
  return /(^|\/|\\)(backend\/tests|apps\/[^/\\]+\/tests)(\/|\\)/.test(file);
}

function normalizeAssignmentValue(rawValue) {
  let value = rawValue.trim();
  if (!value.startsWith("\"") && !value.startsWith("'")) {
    value = value.replace(/\s+#.*$/, "").trim();
  }
  if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1).trim();
  }
  return value;
}

for (const file of trackedFiles) {
  let content;
  try {
    content = readFileSync(file, "utf8");
  } catch {
    continue;
  }

  if (/-----BEGIN (OPENSSH|RSA|EC) PRIVATE KEY-----/.test(content)) {
    findings.push(`${file}: private key block found`);
  }

  const lines = content.split(/\r?\n/);
  lines.forEach((line, index) => {
    if (isEmailPassAssignmentExempt(file)) return;
    const match = line.match(/^\s*(?:export\s+)?EMAIL_SMTP_PASS\s*[:=]\s*(.*)$/);
    if (!match) return;

    const value = normalizeAssignmentValue(match[1] ?? "");
    if (!safeEmailPassValues.has(value)) {
      findings.push(`${file}:${index + 1}: EMAIL_SMTP_PASS must be empty, REDACTED, or an explicit runtime placeholder`);
    }
  });
}

if (findings.length > 0) {
  for (const finding of findings) console.error(finding);
  process.exit(1);
}

console.log("Secret scan OK.");
