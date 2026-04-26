FROM node:24-bookworm-slim

ENV PYTHONUNBUFFERED=1
ENV VIRTUAL_ENV=/opt/venv
ENV PATH="/opt/venv/bin:${PATH}"

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 python3-venv ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY sales-assistant/backend/package.json sales-assistant/backend/package-lock.json ./sales-assistant/backend/
COPY sales-assistant/frontend/package.json sales-assistant/frontend/package-lock.json ./sales-assistant/frontend/

RUN npm ci \
  && npm ci --prefix sales-assistant/backend \
  && npm ci --prefix sales-assistant/frontend

COPY requirements.txt ./
RUN python3 -m venv "${VIRTUAL_ENV}" \
  && pip install --no-cache-dir --upgrade pip \
  && pip install --no-cache-dir -r requirements.txt

COPY . .

RUN npm run build:production
RUN python tools/rebuild_bank_brain.py --json || true

CMD ["python", "tools/railway_start.py"]
