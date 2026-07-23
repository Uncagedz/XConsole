FROM node:24-bookworm-slim

ENV PYTHONUNBUFFERED=1
ENV VIRTUAL_ENV=/opt/venv
ENV PATH="/opt/venv/bin:${PATH}"

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 python3-venv ca-certificates chromium chromium-driver \
  && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@11.9.0 --activate

COPY . .

RUN pnpm install --frozen-lockfile \
  && npm ci --prefix sales-assistant/backend \
  && npm ci --prefix sales-assistant/frontend

RUN python3 -m venv "${VIRTUAL_ENV}" \
  && pip install --no-cache-dir --upgrade pip \
  && pip install --no-cache-dir -r requirements.txt

RUN pnpm db:generate \
  && pnpm --filter @xconsole/ai-api... build \
  && pnpm --filter @xconsole/gateway-api... build \
  && pnpm --filter @xconsole/dashboard... build \
  && npm run build:production
RUN python tools/rebuild_bank_brain.py --json || true

CMD ["node", "tools/railway_dispatch.mjs"]
