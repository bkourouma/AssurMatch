const DEFAULTS = {
  apiUrl: process.env.ASSURMATCH_LOCAL_API_URL ?? "http://127.0.0.1:3600",
  publicUrl: process.env.ASSURMATCH_LOCAL_PUBLIC_URL ?? "http://127.0.0.1:3601",
  adminUrl: process.env.ASSURMATCH_LOCAL_ADMIN_URL ?? "http://127.0.0.1:3602",
  brokerUrl: process.env.ASSURMATCH_LOCAL_BROKER_URL ?? "http://127.0.0.1:3603",
  mailpitUrl: process.env.ASSURMATCH_LOCAL_MAILPIT_URL ?? "http://127.0.0.1:8025"
};

async function fetchText(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(url, {
      redirect: "manual",
      ...options,
      signal: controller.signal
    });
    const text = await response.text().catch(() => "");
    return { response, text };
  } finally {
    clearTimeout(timeout);
  }
}

function assertStatus(name, response, statuses) {
  if (!statuses.includes(response.status)) {
    throw new Error(`${name} expected status ${statuses.join(" or ")}, got ${response.status}`);
  }
}

function assertIncludes(name, text, expected) {
  if (!text.includes(expected)) {
    throw new Error(`${name} did not include expected text: ${expected}`);
  }
}

function assertRedirectsToLogin(name, response) {
  assertStatus(name, response, [307, 308]);
  const location = response.headers.get("location") ?? "";
  if (!location.includes("/login")) {
    throw new Error(`${name} expected redirect to /login, got ${location || "no location header"}`);
  }
}

async function check(name, run) {
  try {
    await run();
    console.log(`ok ${name}`);
  } catch (error) {
    console.error(`not ok ${name}: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}

await check("API public route", async () => {
  const { response } = await fetchText(`${DEFAULTS.apiUrl}/countries`);
  assertStatus("API public route", response, [200]);
});

await check("public app loads", async () => {
  const { response, text } = await fetchText(DEFAULTS.publicUrl);
  assertStatus("public app", response, [200]);
  assertIncludes("public app", text, "AssurMatch");
});

await check("quote form loads", async () => {
  const { response, text } = await fetchText(`${DEFAULTS.publicUrl}/countries/CI/products/auto/quote`);
  assertStatus("quote form", response, [200]);
  assertIncludes("quote form", text, "Demander un devis");
});

await check("admin login loads", async () => {
  const { response, text } = await fetchText(`${DEFAULTS.adminUrl}/login`);
  assertStatus("admin login", response, [200]);
  assertIncludes("admin login", text, "Connexion admin");
});

await check("broker login loads", async () => {
  const { response, text } = await fetchText(`${DEFAULTS.brokerUrl}/login`);
  assertStatus("broker login", response, [200]);
  assertIncludes("broker login", text, "Connexion");
});

await check("admin protected route redirects unauthenticated users", async () => {
  const { response } = await fetchText(DEFAULTS.adminUrl);
  assertRedirectsToLogin("admin protected route", response);
});

await check("broker protected route redirects unauthenticated users", async () => {
  const { response } = await fetchText(DEFAULTS.brokerUrl);
  assertRedirectsToLogin("broker protected route", response);
});

await check("Mailpit reachable", async () => {
  const { response, text } = await fetchText(DEFAULTS.mailpitUrl);
  assertStatus("Mailpit", response, [200]);
  assertIncludes("Mailpit", text, "Mailpit");
});
