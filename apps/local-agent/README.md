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

## Windows startup

Build the agent, then create a Windows Task Scheduler task triggered **At log on**:

```text
Program: C:\Program Files\nodejs\node.exe
Arguments: C:\path\to\XConsole\apps\local-agent\dist\index.js run
Start in: C:\path\to\XConsole
```

Select **Run only when user is logged on** so interactive reauthentication remains
visible. Configure restart on failure with a one-minute delay.
