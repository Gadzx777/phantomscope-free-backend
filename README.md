# PhantomScope Free Backend

A small Node.js + WebSocket service that streams **public Roblox server-list data** to the PhantomScope browser extension.

## What it provides
- `GET /health` — service status.
- `GET /api/servers` — latest cached public server entries.
- `GET /api/servers?placeId=8737602449` — filter by place.
- `WS /livechannel` — sends the current server map on connect and broadcasts refreshed data.

## Important feature limitation
This backend reads Roblox's public server-list API. It can provide server IDs, player counts, and place IDs. It **cannot** provide PLS DONATE transaction events, donor/receiver names, donation amounts, or streaks. Those are not included in the public server-list response. The extension should label these cards as public servers and not display invented donation information.

## Run locally
Requires Node.js 20 or newer.

```bash
npm install
npm start
```

Open `http://localhost:10000/health`.

## Deploy free on Render
1. Create a GitHub account if you do not already have one.
2. Create a new **public GitHub repository** named `phantomscope-free-backend`.
3. Upload these files to the repository (keep `package.json`, `server.mjs`, and `render.yaml` at the repository root).
4. In Render, choose **New → Blueprint** and connect the repository, or choose **New → Web Service** and connect the repository.
5. For a Web Service, use:
   - Build command: `npm install`
   - Start command: `npm start`
   - Plan: `Free`
6. When deployment completes, copy the service URL, for example `https://your-service-name.onrender.com`.
7. Test `https://YOUR-SERVICE.onrender.com/health`. It should return JSON with `"ok": true`.

Render free services can sleep after 15 minutes without inbound traffic, so the first connection after idle may take around a minute. This is expected on the free plan.

## Environment variables
- `PLACE_IDS`: comma-separated Roblox place IDs. Defaults to PLS DONATE and two other place IDs already used by the extension.
- `POLL_MS`: refresh interval in milliseconds. Minimum 15000; default 30000.
- `PORT`: supplied automatically by Render.

## Extension integration
After you deploy and have your real Render URL, update the extension's Live Pull WebSocket URL to:

```js
const BACKEND_URL = "wss://YOUR-SERVICE.onrender.com/livechannel";
```

Use `https://YOUR-SERVICE.onrender.com` for HTTP endpoints. Do not include a made-up hostname. The extension's current card renderer expects donor-specific fields; adapt it to show `players`, `maxPlayers`, `placeId`, and `serverId` instead. Do not map public server data into fake donor/receiver/Robux fields.

## Data source
Roblox Creator Hub documents the public place server endpoints under the Games API:
https://create.roblox.com/docs/cloud/reference/domains/games
