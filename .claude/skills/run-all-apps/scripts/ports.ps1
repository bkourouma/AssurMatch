# Port profile of the "run-all-apps" skill. Dot-source this file to put every override in the
# environment before calling the project launcher or stopper.
#
# The numbers deliberately sit in the 47xxx range: below Windows' dynamic range (49152+), far from
# the default AssurMatch ports (3600-3603, 55433, 56380, 1025/8025) and from what developer tools
# usually take (3000, 4200, 5173, 5432, 6379, 8000, 8080, 9000). Change them here if one of them
# ever collides on a machine; the launcher reads only these variables.
$env:ASSURMATCH_LOCAL_API_PORT = "47600"
$env:ASSURMATCH_LOCAL_PUBLIC_PORT = "47601"
$env:ASSURMATCH_LOCAL_ADMIN_PORT = "47602"
$env:ASSURMATCH_LOCAL_BROKER_PORT = "47603"
$env:ASSURMATCH_POSTGRES_PORT = "47632"
$env:ASSURMATCH_REDIS_PORT = "47679"
$env:ASSURMATCH_MAILPIT_SMTP_PORT = "47025"
$env:ASSURMATCH_MAILPIT_HTTP_PORT = "47825"

# A distinct Compose project gives this stack its own containers and volumes, so it never touches
# the database of the default stack, and the two can run at the same time.
$env:ASSURMATCH_COMPOSE_PROJECT = "assurmatch-alt"
$env:ASSURMATCH_LOCAL_LOG_DIR = (Join-Path (Resolve-Path (Join-Path $PSScriptRoot "..\..\..\..")) ".local\logs-alt")

# The health check and the browser smoke test read their targets from these.
$env:ASSURMATCH_LOCAL_API_URL = "http://127.0.0.1:$($env:ASSURMATCH_LOCAL_API_PORT)"
$env:ASSURMATCH_LOCAL_PUBLIC_URL = "http://127.0.0.1:$($env:ASSURMATCH_LOCAL_PUBLIC_PORT)"
$env:ASSURMATCH_LOCAL_ADMIN_URL = "http://127.0.0.1:$($env:ASSURMATCH_LOCAL_ADMIN_PORT)"
$env:ASSURMATCH_LOCAL_BROKER_URL = "http://127.0.0.1:$($env:ASSURMATCH_LOCAL_BROKER_PORT)"
$env:ASSURMATCH_LOCAL_MAILPIT_URL = "http://127.0.0.1:$($env:ASSURMATCH_MAILPIT_HTTP_PORT)"
