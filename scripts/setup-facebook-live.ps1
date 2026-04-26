param(
  [string]$Vin = "2C4RC1L78NR164218",
  [int]$PlaceholderImageCount = 6,
  [switch]$SkipChromeDownload
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$listerDir = Join-Path $root "automation\facebook-marketplace-lister"
$driversDir = Join-Path $listerDir "drivers"
$imagesDir = Join-Path $listerDir "images"
$jobsDir = Join-Path $listerDir "jobs"
$accountsPath = Join-Path $listerDir "accounts.json"
$chromeBundleDir = Join-Path $listerDir "chrome-for-testing"

function Invoke-DownloadWithRetry {
  param(
    [string]$Uri,
    [string]$OutFile,
    [int]$Attempts = 5
  )

  $python = Join-Path $root ".venv\Scripts\python.exe"
  if (-not (Test-Path $python)) {
    throw "Missing Python runtime at .venv\Scripts\python.exe for reliable downloads."
  }

  $downloadScript = @'
import pathlib
import sys
import time
import urllib.request

url = sys.argv[1]
target = pathlib.Path(sys.argv[2])
attempts = int(sys.argv[3])
last_error = None

for index in range(attempts):
    try:
        with urllib.request.urlopen(url, timeout=120) as response, target.open("wb") as f:
            while True:
                chunk = response.read(1024 * 1024)
                if not chunk:
                    break
                f.write(chunk)
        if target.exists() and target.stat().st_size > 0:
            sys.exit(0)
        raise RuntimeError("download produced an empty file")
    except Exception as exc:
        last_error = exc
        print(f"attempt {index + 1}/{attempts} failed for {url}: {exc}")
        time.sleep(2)

print(f"failed downloading {url}: {last_error}")
sys.exit(2)
'@

  $downloadScript | & $python - $Uri $OutFile $Attempts
  if ($LASTEXITCODE -ne 0) {
    throw "Failed to download: $Uri"
  }
}

foreach ($path in @($listerDir, $driversDir, $imagesDir, $jobsDir)) {
  if (-not (Test-Path $path)) {
    New-Item -ItemType Directory -Path $path -Force | Out-Null
  }
}

if (-not (Test-Path $accountsPath)) {
  @'
{
  "accounts": [
    {
      "id": "REPLACE_WITH_FACEBOOK_ACCOUNT_ID",
      "name": "Replace Me",
      "email": "you@example.com",
      "password": ""
    }
  ]
}
'@ | Set-Content -Path $accountsPath -Encoding UTF8
}

if (-not $SkipChromeDownload) {
  $metadataUrl = "https://googlechromelabs.github.io/chrome-for-testing/last-known-good-versions-with-downloads.json"
  $metadata = Invoke-RestMethod -Uri $metadataUrl -Method Get

  $chromeDownload = $metadata.channels.Stable.downloads.chrome |
    Where-Object { $_.platform -eq "win64" } |
    Select-Object -First 1
  $driverDownload = $metadata.channels.Stable.downloads.chromedriver |
    Where-Object { $_.platform -eq "win64" } |
    Select-Object -First 1

  if (-not $chromeDownload -or -not $driverDownload) {
    throw "Unable to resolve Chrome for Testing win64 download URLs."
  }

  $tmp = Join-Path $env:TEMP ("fb_live_setup_" + [Guid]::NewGuid().ToString("N"))
  New-Item -ItemType Directory -Path $tmp -Force | Out-Null
  try {
    $chromeZip = Join-Path $tmp "chrome-win64.zip"
    $driverZip = Join-Path $tmp "chromedriver-win64.zip"

    Invoke-DownloadWithRetry -Uri $chromeDownload.url -OutFile $chromeZip
    Invoke-DownloadWithRetry -Uri $driverDownload.url -OutFile $driverZip

    Expand-Archive -Path $chromeZip -DestinationPath $tmp -Force
    Expand-Archive -Path $driverZip -DestinationPath $tmp -Force

    $chromeRoot = Join-Path $tmp "chrome-win64"
    $driverRoot = Join-Path $tmp "chromedriver-win64"

    if (-not (Test-Path (Join-Path $chromeRoot "chrome.exe"))) {
      throw "Downloaded Chrome bundle does not contain chrome.exe"
    }
    if (-not (Test-Path (Join-Path $driverRoot "chromedriver.exe"))) {
      throw "Downloaded driver bundle does not contain chromedriver.exe"
    }

    if (Test-Path $chromeBundleDir) {
      Remove-Item $chromeBundleDir -Recurse -Force
    }
    New-Item -ItemType Directory -Path $chromeBundleDir -Force | Out-Null
    Copy-Item $chromeRoot (Join-Path $chromeBundleDir "chrome-win64") -Recurse -Force

    Copy-Item (Join-Path $driverRoot "chromedriver.exe") (Join-Path $driversDir "chromedriver.exe") -Force
  } finally {
    if (Test-Path $tmp) {
      Remove-Item $tmp -Recurse -Force
    }
  }
}

$pngBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7Zk1YAAAAASUVORK5CYII="
$imageBytes = [Convert]::FromBase64String($pngBase64)
$cleanVin = $Vin.Trim().ToUpper()
for ($i = 1; $i -le $PlaceholderImageCount; $i++) {
  $fileName = "{0}_{1:d2}.png" -f $cleanVin, $i
  $target = Join-Path $imagesDir $fileName
  if (-not (Test-Path $target)) {
    [System.IO.File]::WriteAllBytes($target, $imageBytes)
  }
}

$driverPath = Join-Path $driversDir "chromedriver.exe"
$driverVersion = $null
if (Test-Path $driverPath) {
  try {
    $driverVersion = (& $driverPath --version 2>$null | Select-Object -First 1)
  } catch {
    $driverVersion = $null
  }
}

$accounts = $null
try {
  $accountsPayload = Get-Content $accountsPath -Raw | ConvertFrom-Json
  $accounts = @($accountsPayload.accounts).Count
} catch {
  $accounts = 0
}

$imageCount = @(Get-ChildItem $imagesDir -File -ErrorAction SilentlyContinue | Where-Object {
  $_.Extension.ToLower() -in @(".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp")
}).Count

[PSCustomObject]@{
  ok = $true
  chrome_bundle = (Test-Path (Join-Path $chromeBundleDir "chrome-win64\chrome.exe"))
  chromedriver = (Test-Path $driverPath)
  chromedriver_version = $driverVersion
  accounts_count = $accounts
  images_count = $imageCount
  vin_seeded = $cleanVin
} | ConvertTo-Json -Depth 4
