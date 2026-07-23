# n8n workflows

Import each JSON file into n8n, then set `XCONSOLE_GATEWAY_URL` and
`XCONSOLE_GATEWAY_TOKEN` in the n8n environment. Workflows are disabled on import and
contain no credentials.

Some workflow action endpoints are Phase 1 typed orchestration boundaries and will
remain inactive until their underlying connector is configured. PostgreSQL remains the
system of record; n8n only schedules and coordinates gateway calls.
