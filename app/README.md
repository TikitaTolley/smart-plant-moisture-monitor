# Smart Plant Monitor app

An installable React PWA, Cloudflare Worker and D1 database. [Open the live monitor](https://smart-plant-monitor.daeda-technologies.workers.dev/).

## Local setup

From the repository root, with Bun installed:

```sh
cd app
bun install
cp .dev.vars.example .dev.vars
bunx wrangler d1 migrations apply smart-plant-monitor --local
bun run dev
```

Set `DEVICE_KEY` in `.dev.vars` to your own random secret. In another terminal, from `app/`, run `bun run simulate:local` to send synthetic readings.

## Deploy your own

1. Run `bunx wrangler login`, then `bunx wrangler d1 create smart-plant-monitor` in your Cloudflare account.
2. Set your Worker name and returned database ID in [wrangler.jsonc](wrangler.jsonc). Keep the binding `DB`.
3. Apply the migration, set your device key and deploy:

```sh
bunx wrangler d1 migrations apply smart-plant-monitor --remote
bunx wrangler secret put DEVICE_KEY
bun run deploy
```

In `main/secrets.h`, set the same device key, your Wi-Fi details and `API_URL` to `https://YOUR-WORKER.workers.dev/api/v1/readings/`.

[Cloudflare database setup](https://developers.cloudflare.com/d1/get-started/) · [Worker secrets](https://developers.cloudflare.com/workers/configuration/secrets/)

## Checks

```sh
bun run build
bun run lint
```

The firmware calculates the moisture state; the app displays it. A sleeping character means the device is offline.
