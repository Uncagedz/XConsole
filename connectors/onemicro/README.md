# 1Micro connector

XConsole now supports queued VIN lookups through the Windows Local Agent. The
agent reuses a dedicated Chrome profile, runs routine lookups headlessly, and
returns key location, key holder, a safe summary, and failure artifacts.

No portal URL or selector is guessed. Before the first live run:

1. Capture and review the authorized key search/result and holder-detail pages.
2. Configure the reviewed login/lookup URLs and VIN/result/field selectors in
   the DPAPI-encrypted Local Agent configuration.
3. Run `portal-login -- onemicro` and complete login/MFA yourself.
4. Use a vehicle page in XConsole to queue a lookup.

Browser profiles, cookies, screenshots, and HTML stay outside Git.
