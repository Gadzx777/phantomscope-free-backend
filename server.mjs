import http from "node:http";
import { URL } from "node:url";
import { WebSocketServer, WebSocket } from "ws";

const PORT = Number(process.env.PORT || 10000);
const HOST = "0.0.0.0";
const POLL_MS = Math.max(15000, Number(process.env.POLL_MS || 30000));
const PLACE_IDS = (process.env.PLACE_IDS || "8737602449,8916037983,12069083555")
  .split(",").map(s => s.trim()).filter(s => /^\d+$/.test(s));
const MAX_CLIENTS = 50;
const MAX_SERVERS_PER_PLACE = 100;

const clients = new Set();
let latest = {};
let polling = false;
let lastUpdated = null;
let lastError = null;

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  if (req.method === "OPTIONS") { res.writeHead(204); return res.end(); }

  if (req.method !== "GET") {
    res.writeHead(405); return res.end(JSON.stringify({ error: "Method not allowed" }));
  }
  if (url.pathname === "/health" || url.pathname === "/") {
    res.writeHead(200);
    return res.end(JSON.stringify({
      ok: true, service: "PhantomScope Free Backend",
      websocket: "/livechannel", clients: clients.size,
      places: PLACE_IDS, lastUpdated, lastError
    }));
  }
  if (url.pathname === "/api/servers") {
    const placeId = url.searchParams.get("placeId");
    const entries = Object.values(latest).filter(x => !placeId || String(x.placeId) === placeId);
    res.writeHead(200);
    return res.end(JSON.stringify({ data: entries, count: entries.length, lastUpdated }));
  }
  res.writeHead(404); res.end(JSON.stringify({ error: "Not found" }));
});

const wss = new WebSocketServer({ noServer: true, maxPayload: 1024 });
server.on("upgrade", (req, socket, head) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  if (url.pathname !== "/livechannel" || clients.size >= MAX_CLIENTS) {
    socket.write("HTTP/1.1 404 Not Found\r\n\r\n"); return socket.destroy();
  }
  wss.handleUpgrade(req, socket, head, ws => wss.emit("connection", ws, req));
});

wss.on("connection", ws => {
  clients.add(ws);
  ws.send(JSON.stringify(latest));
  ws.on("close", () => clients.delete(ws));
  ws.on("error", () => clients.delete(ws));
  ws.on("pong", () => { ws.isAlive = true; });
  ws.isAlive = true;
});

function broadcast() {
  const payload = JSON.stringify(latest);
  for (const ws of clients) {
    if (ws.readyState === WebSocket.OPEN) ws.send(payload);
  }
}

async function fetchPlaceServers(placeId) {
  const collected = [];
  let cursor = null;
  // One page per polling cycle keeps traffic modest and respects Roblox pagination.
  const endpoint = new URL(`https://games.roblox.com/v1/games/${placeId}/servers/Public`);
  endpoint.searchParams.set("sortOrder", "Desc");
  endpoint.searchParams.set("limit", String(MAX_SERVERS_PER_PLACE));
  endpoint.searchParams.set("excludeFullGames", "true");
  if (cursor) endpoint.searchParams.set("cursor", cursor);

  const response = await fetch(endpoint, {
    headers: { "Accept": "application/json", "User-Agent": "PhantomScope-Free/1.0" },
    signal: AbortSignal.timeout(12000)
  });
  if (!response.ok) throw new Error(`Roblox API ${response.status} for place ${placeId}`);
  const body = await response.json();
  for (const item of (body.data || [])) {
    if (!item.id) continue;
    collected.push({
      placeId: Number(placeId),
      serverId: String(item.id),
      players: Number(item.playing || 0),
      maxPlayers: Number(item.maxPlayers || 0),
      placename: "PLS DONATE 💸",
      Timestamp: Math.floor(Date.now() / 1000),
      source: "Roblox public server list"
    });
  }
  return collected;
}

async function refresh() {
  if (polling || clients.size === 0) return;
  polling = true;
  try {
    const next = {};
    const results = await Promise.allSettled(PLACE_IDS.map(fetchPlaceServers));
    const errors = [];
    results.forEach((result, i) => {
      if (result.status === "fulfilled") {
        for (const entry of result.value) next[`${entry.placeId}:${entry.serverId}`] = entry;
      } else errors.push(`${PLACE_IDS[i]}: ${result.reason?.message || "fetch failed"}`);
    });
    // Only replace cache if at least one Roblox place fetch succeeded.
    if (results.some(r => r.status === "fulfilled")) {
      latest = next;
      lastUpdated = new Date().toISOString();
      lastError = errors.length ? errors.join("; ") : null;
      broadcast();
    } else {
      lastError = errors.join("; ") || "No place IDs configured";
    }
  } catch (error) {
    lastError = error?.message || "Unknown polling error";
  } finally {
    polling = false;
  }
}

setInterval(() => {
  for (const ws of clients) {
    if (ws.isAlive === false) { clients.delete(ws); ws.terminate(); continue; }
    ws.isAlive = false; ws.ping();
  }
}, 30000).unref();

setInterval(refresh, POLL_MS).unref();
server.listen(PORT, HOST, () => {
  console.log(`PhantomScope Free Backend listening on ${HOST}:${PORT}`);
  console.log(`Configured place IDs: ${PLACE_IDS.join(", ")}`);
});
