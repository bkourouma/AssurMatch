$ErrorActionPreference = "Continue"
. (Join-Path $PSScriptRoot "ports.ps1")

$targets = @(
  @{ Name = "API";        Url = "$($env:ASSURMATCH_LOCAL_API_URL)/countries" },
  @{ Name = "Public";     Url = $env:ASSURMATCH_LOCAL_PUBLIC_URL },
  @{ Name = "Admin";      Url = "$($env:ASSURMATCH_LOCAL_ADMIN_URL)/login" },
  @{ Name = "Broker";     Url = "$($env:ASSURMATCH_LOCAL_BROKER_URL)/login" },
  @{ Name = "Mailpit";    Url = $env:ASSURMATCH_LOCAL_MAILPIT_URL }
)
foreach ($target in $targets) {
  try {
    $response = Invoke-WebRequest -Uri $target.Url -UseBasicParsing -MaximumRedirection 0 -TimeoutSec 30 -ErrorAction Stop
    Write-Host ("  {0,-8} {1,-40} {2}" -f $target.Name, $target.Url, $response.StatusCode)
  } catch {
    $code = if ($_.Exception.Response) { [int] $_.Exception.Response.StatusCode } else { "down" }
    Write-Host ("  {0,-8} {1,-40} {2}" -f $target.Name, $target.Url, $code)
  }
}
foreach ($pair in @(@("PostgreSQL", $env:ASSURMATCH_POSTGRES_PORT), @("Redis", $env:ASSURMATCH_REDIS_PORT))) {
  $listening = Get-NetTCPConnection -LocalPort ([int] $pair[1]) -State Listen -ErrorAction SilentlyContinue
  Write-Host ("  {0,-8} 127.0.0.1:{1,-30} {2}" -f $pair[0], $pair[1], $(if ($listening) { "listening" } else { "down" }))
}
