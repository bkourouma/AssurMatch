import { spawn } from "node:child_process";

const env = {
  ...process.env,
  ASSURMATCH_LOCAL_BROWSER_SMOKE: "true",
  ASSURMATCH_LOCAL_API_URL: process.env.ASSURMATCH_LOCAL_API_URL ?? "http://127.0.0.1:3600",
  ASSURMATCH_LOCAL_PUBLIC_URL: process.env.ASSURMATCH_LOCAL_PUBLIC_URL ?? "http://127.0.0.1:3601",
  ASSURMATCH_LOCAL_ADMIN_URL: process.env.ASSURMATCH_LOCAL_ADMIN_URL ?? "http://127.0.0.1:3602",
  ASSURMATCH_LOCAL_BROKER_URL: process.env.ASSURMATCH_LOCAL_BROKER_URL ?? "http://127.0.0.1:3603",
  ASSURMATCH_LOCAL_MAILPIT_URL: process.env.ASSURMATCH_LOCAL_MAILPIT_URL ?? "http://127.0.0.1:8025"
};

const command = process.platform === "win32" ? "cmd.exe" : "npx";
const args = process.platform === "win32"
  ? ["/d", "/c", "npx", "playwright", "test", "apps/public/tests/local-app-launcher-browser.spec.ts"]
  : ["playwright", "test", "apps/public/tests/local-app-launcher-browser.spec.ts"];
const child = spawn(command, args, {
  stdio: "inherit",
  env
});

child.on("exit", (code) => {
  process.exit(code ?? 1);
});
