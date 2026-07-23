# Railway service layout

Create the seven services listed in `services.json`. Attach `xconsole-postgres` and
`xconsole-redis` to the gateway/AI/scheduler services. Use the matching
`*.railway.json` as each application service's Railway config path.

Provision `xconsole-n8n` from the pinned image and set `N8N_ENCRYPTION_KEY`.
The Local Agent is intentionally excluded and must remain on Windows.
