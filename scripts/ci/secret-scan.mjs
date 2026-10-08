// AssurMatch secret scan (CI job `secret-scan`, spec 058 FR-008).
//
// Scans every tracked file (or the paths given after `--paths`) with gitleaks-like rules:
//   - private key blocks (RSA, EC, OpenSSH, DSA, PGP, PKCS#8...);
//   - provider tokens: AWS access key ids, GitHub, Slack, Stripe live, Anthropic, OpenAI, Google API
//     keys, Sentry DSNs with a key, JWTs;
//   - URLs carrying credentials (`scheme://user:password@host`) unless the password is an obvious
//     placeholder or the host is local;
//   - non-empty `*_SECRET`, `*_PASSWORD`, `*_TOKEN`, `*_API_KEY`... assignments in env, compose, shell
//     and workflow files unless the value is a placeholder (REDACTED, ${VAR}, ${{ secrets.X }}...);
//   - the historical EMAIL_SMTP_PASS rule (empty, REDACTED or an explicit runtime placeholder).
// A reviewed false positive is silenced with `secret-scan:allow` on the same line.
// Exit 1 with one line per finding (file:line: rule) — the matched value is never printed.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const args = process.argv.slice(2);
const pathsIndex = args.indexOf("--paths");
const files = pathsIndex >= 0
  ? args.slice(pathsIndex + 1)
  : execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" }).split("\0").filter(Boolean);

// The path patterns below use `/`; `--paths` on Windows hands over backslashes.
const toPosix = (path) => path.replaceAll("\\", "/");

const SKIPPED_FILES = /(^|\/)(package-lock\.json|.*\.(png|jpe?g|gif|ico|webp|pdf|woff2?|ttf|otf|zip|gz))$/i;
const TEST_FILE = /(^|\/)(backend\/tests|apps\/[^/]+\/tests)\//;

const TOKEN_RULES = [
  ["private key block", /-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY(?: BLOCK)?-----/],
  ["AWS access key id", /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/],
  ["GitHub token", /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{50,})\b/],
  ["Slack token", /\bxox[abprs]-[A-Za-z0-9-]{10,}/],
  ["Stripe live key", /\b[rs]k_live_[A-Za-z0-9]{16,}/],
  ["Anthropic API key", /\bsk-ant-[A-Za-z0-9_-]{20,}/],
  ["OpenAI API key", /\bsk-(?:proj-)?[A-Za-z0-9]{32,}\b/],
  ["Google API key", /\bAIza[0-9A-Za-z_-]{35}\b/],
  ["Sentry DSN with key", /https?:\/\/[0-9a-f]{32}@[^\s/'"`]+\/\d+/],
  // Test files build tokens at runtime; a literal JWT elsewhere is a leaked credential.
  ["JWT", /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{16,}/, { skipTests: true }]
];

const PLACEHOLDER = /^(?:|x+|\*+|\.{3}|redacted|placeholder|changeme|change-me|change_me|secret|password|pass|passwd|postgres|user|test|dummy|example|sample|local|dev|xxx+|none|null|todo|<[^>]*>|\$\{[^}]*\}|\$[A-Z_][A-Z0-9_]*|%[A-Z_][A-Z0-9_]*%|\$env:[A-Z_][A-Z0-9_]*|\$\{\{[^}]*\}\})$/i;
const LOCAL_HOST = /^(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]|host\.docker\.internal|postgres|redis|db|mailpit|minio|[a-z0-9-]+\.(?:local|test|example|invalid))(?::[^/]*)?$/i;
const CREDENTIAL_URL = /\b([a-z][a-z0-9+.-]*):\/\/([^\s:/@'"`<>]+):([^\s@/'"`<>]+)@([^\s/'"`<>?#]+)/gi;

const ASSIGNMENT_FILE = /(^|\/)(\.env[^/]*|[^/]*\.(?:ya?ml|sh|ps1|bat|cmd|env|conf|ini|properties|toml)|Dockerfile[^/]*)$/i;
const SECRET_ASSIGNMENT = /^\s*(?:export\s+|set\s+"?|\$env:)?([A-Z0-9_]*(?:SECRET|PASSWORD|PASSWD|_PASS|TOKEN|API_KEY|APIKEY|PRIVATE_KEY|ACCESS_KEY|CREDENTIALS?|DSN)[A-Z0-9_]*)\s*[:=]\s*(.*)$/;

const safeEmailPassValues = new Set(["", "REDACTED", "%EMAIL_SMTP_PASS%", "$env:EMAIL_SMTP_PASS", "${EMAIL_SMTP_PASS}", "${{ secrets.EMAIL_SMTP_PASS }}"]);

function normalizeAssignmentValue(rawValue) {
  let value = rawValue.trim();
  if (!value.startsWith("\"") && !value.startsWith("'")) value = value.replace(/\s+#.*$/, "").trim();
  if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1).trim();
  return value.replace(/"$/, "").trim();
}

/** A value that is clearly not a literal secret: placeholder, variable reference, expression, path or flag. */
function isPlaceholderValue(value) {
  if (PLACEHOLDER.test(value)) return true;
  if (/\$\{|\$\(|\$\{\{|^\$[A-Za-z_]|%[A-Z_]+%|<[^>]+>/.test(value)) return true;
  if (/^(?:true|false|on|off|\d+|required|optional)$/i.test(value)) return true;
  // Self-describing local/dev placeholders ("replace-with-...", "local-...-please-change", "minioadmin").
  if (/replace|change|local|example|dummy|placeholder|sample|fake|minioadmin|not-a-real/i.test(value)) return true;
  if (/^[[(]/.test(value)) return true; // expression (PowerShell, shell sub-shell)
  if (/^(?:\/|\.\/|~\/|[A-Za-z]:\\)/.test(value)) return true; // file path (e.g. *_PASSWORD_FILE)
  if (/^process\.env|^env\.|^secrets\./.test(value)) return true;
  return value.length < 8;
}

export function scanContent(file, content) {
  const findings = [];
  const lines = content.split(/\r?\n/);
  const isTest = TEST_FILE.test(toPosix(file));
  lines.forEach((line, index) => {
    if (line.includes("secret-scan:allow")) return;
    const at = `${file}:${index + 1}`;
    for (const [name, pattern, options] of TOKEN_RULES) {
      if (options?.skipTests && isTest) continue;
      if (pattern.test(line)) findings.push(`${at}: ${name}`);
    }
    for (const match of line.matchAll(CREDENTIAL_URL)) {
      const [, , user, password, host] = match;
      if (isTest || LOCAL_HOST.test(host ?? "") || isPlaceholderValue(password ?? "") || /^\$|^\{/.test(user ?? "")) continue;
      findings.push(`${at}: URL with embedded credentials`);
    }
    if (!isTest) {
      const smtp = line.match(/^\s*(?:export\s+)?EMAIL_SMTP_PASS\s*[:=]\s*(.*)$/);
      if (smtp && !safeEmailPassValues.has(normalizeAssignmentValue(smtp[1] ?? ""))) {
        findings.push(`${at}: EMAIL_SMTP_PASS must be empty, REDACTED, or an explicit runtime placeholder`);
      } else if (!smtp && ASSIGNMENT_FILE.test(toPosix(file))) {
        const assignment = line.match(SECRET_ASSIGNMENT);
        if (assignment && !isPlaceholderValue(normalizeAssignmentValue(assignment[2] ?? ""))) {
          findings.push(`${at}: literal value assigned to ${assignment[1]}`);
        }
      }
    }
  });
  return findings;
}

const findings = [];
for (const file of files) {
  if (SKIPPED_FILES.test(toPosix(file))) continue;
  let content;
  try {
    content = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  if (content.includes("\0")) continue; // binary
  findings.push(...scanContent(file, content));
}

if (findings.length > 0) {
  for (const finding of findings) console.error(finding);
  console.error(`Secret scan FAILED: ${findings.length} finding(s). Remove the secret (and rotate it), or mark a reviewed false positive with "secret-scan:allow".`);
  process.exit(1);
}

console.log(`Secret scan OK (${files.length} files).`);
