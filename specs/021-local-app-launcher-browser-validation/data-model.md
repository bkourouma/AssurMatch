# Data Model: Local App Launcher Browser Validation

## LocalAppStack

- **Fields**: apiUrl, publicUrl, adminUrl, brokerUrl, mailpitUrl, postgresUrl, redisUrl, appEnv.
- **Validation**: URLs must use localhost/127.0.0.1 and documented ports; `appEnv` must be `local`.
- **Lifecycle**: stopped -> infrastructure-ready -> migrated-and-seeded -> app-processes-started -> healthy -> stopped.

## LocalLaunchCommand

- **Fields**: rootPath, requiredPorts, dockerServices, env, logDirectory.
- **Validation**: required app ports must be free before app startup; Docker services must respond before migrations.
- **Safety**: Does not set bootstrap password and does not delete volumes.

## LocalStopCommand

- **Fields**: ports, dockerServices, rootPath.
- **Validation**: targets only documented local app ports and local Docker services.
- **Safety**: Idempotent; stops services without deleting local data by default.

## LocalHealthCheck

- **Fields**: apiUrl, publicUrl, adminUrl, brokerUrl, mailpitUrl, timeoutMs.
- **Validation**: API public route responds; public pages render; protected back-office routes redirect unauthenticated users; login pages render; Mailpit responds.

## BrowserSmokeScenario

- **Fields**: publicUrl, adminUrl, brokerUrl, mailpitUrl, enabledFlag.
- **Validation**: Runs only when explicitly enabled by environment or wrapper command.
