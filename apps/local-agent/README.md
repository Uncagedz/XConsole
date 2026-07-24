# XConsole Local Agent

Windows-only worker for authorized Playwright and preserved Selenium browser jobs.
It stores its device token with Windows DPAPI under `%LOCALAPPDATA%\XConsole` and keeps
profiles, screenshots, HTML recordings, and logs outside Git.

## Register

```powershell
$env:XCONSOLE_GATEWAY_URL='http://127.0.0.1:3001'
$env:XCONSOLE_DEVICE_REGISTRATION_CODE='one-time-code-from-settings'
pnpm --filter @xconsole/local-agent register
```

## Run and record

```powershell
pnpm --filter @xconsole/local-agent dev
pnpm --filter @xconsole/local-agent record -- 'https://authorized-portal.example'
```

Recording opens installed Chrome. Complete login/MFA yourself, navigate to the target
page, and press Enter. Review the sanitized output before copying any fixture into Git.

## Configure ReconVision, 1Micro, or CARFAX for Dealers

Portal credentials are never committed to Git or sent to Railway. First record
and review the authorized page, then configure its URLs and selectors:

```powershell
$env:XCONSOLE_PORTAL_LOGIN_URL='https://reviewed-login-url'
$env:XCONSOLE_PORTAL_LOOKUP_URL='https://reviewed-vin-lookup-url'
$env:XCONSOLE_PORTAL_VIN_INPUT_SELECTOR='reviewed VIN input selector'
$env:XCONSOLE_PORTAL_RESULT_SELECTOR='reviewed result container selector'
$env:XCONSOLE_PORTAL_SUBMIT_SELECTOR='reviewed submit selector' # optional
$env:XCONSOLE_PORTAL_FIELD_SELECTORS='{"stage":"reviewed selector","openWork":"reviewed selector","frontlineReady":"reviewed selector"}'
pnpm --filter @xconsole/local-agent configure-portal -- reconvision
```

For 1Micro, use `onemicro` and field names `location` and `holder`. Configuration
is stored in the DPAPI-encrypted agent file. For CARFAX for Dealers, use `carfax`,
`https://www.carfaxonline.com/login` for the login URL,
`https://www.carfaxonline.com/` for the lookup URL, `input[name="VIN"]` as the VIN
selector, and `main` as the result selector. Then open a visible login window:

```powershell
pnpm --filter @xconsole/local-agent portal-login -- reconvision
pnpm --filter @xconsole/local-agent portal-login -- onemicro
pnpm --filter @xconsole/local-agent portal-login -- carfax
```

Complete login and MFA yourself. Routine `lookup-vin` jobs then reuse the separate
portal profiles in headless mode. Authentication challenges stop the job and mark
the connector as requiring reauthentication; they are never bypassed.

For the reviewed ReconVision, 1Micro, and CARFAX login pages, assisted sign-in may
use `XCONSOLE_PORTAL_USERNAME` and `XCONSOLE_PORTAL_PASSWORD`. The `portal-login`
command stores them only inside the current Windows user's DPAPI-encrypted Local
Agent configuration so routine lookups can reauthenticate without putting secrets
in source control, logs, or Railway. Clear both process variables after the command
completes. CARFAX MFA and human verification remain interactive: complete them in
the visible portal window when prompted.

## Windows startup

Build the agent, then create a Windows Task Scheduler task triggered **At log on**:

```text
Program: C:\Program Files\nodejs\node.exe
Arguments: C:\path\to\XConsole\apps\local-agent\dist\index.js run
Start in: C:\path\to\XConsole
```

Select **Run only when user is logged on** so interactive reauthentication remains
visible. Configure restart on failure with a one-minute delay.
