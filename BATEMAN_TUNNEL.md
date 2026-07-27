# Bateman Tunnel Setup — Cloudflare Tunnel on the Alienware

The website (Hostinger) and Bateman's brain (your Alienware running Ollama + Qwen3)
are two separate machines. The website can't reach `localhost` on your PC, so we
punch a secure tunnel out from the Alienware to Cloudflare, which gives the website
a public HTTPS URL to call. No port forwarding, no router config, no firewall holes.

## Architecture

```
┌─────────────────┐         ┌──────────────────┐         ┌─────────────────────────┐
│  Website        │  HTTPS  │   Cloudflare     │ tunnel  │  Alienware (home)       │
│  (Hostinger)    │ ──────► │   Network        │ ──────► │  cloudflared daemon     │
│                 │         │                  │         │     │                   │
│  BATEMAN_API_URL│         │  your-tunnel.    │         │     ▼                   │
│  in .env        │         │  trycloudflare.  │         │  Bateman bridge :3001   │
│                 │         │  com             │         │     │                   │
└─────────────────┘         └──────────────────┘         │     ▼                   │
                                                         │  Ollama :11434 (Qwen3)  │
                                                         └─────────────────────────┘
```

The tunnel is **outbound-only** from your PC — nothing on your home network is
exposed except the one port you choose to publish.

## Prerequisites

- A Cloudflare account (the free tier is fine). For a quick test you don't even need one.
- Your Alienware with Ollama installed and the model pulled (`ollama pull qwen3`).
- Optional but recommended: your own domain on Cloudflare for a permanent tunnel URL.

## Step 1 — Install cloudflared on the Alienware

**Windows:**
Download the installer from
https://github.com/cloudflare/cloudflared/releases/latest
(grab `cloudflared-windows-amd64.msi`), or with winget:

```powershell
winget install Cloudflare.cloudflared
```

**Linux:**

```bash
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb -o cloudflared.deb
sudo dpkg -i cloudflared.deb
```

Verify: `cloudflared --version`

## Step 2 — The Bateman bridge (don't expose Ollama directly)

Ollama's API has no authentication and exposes model management endpoints.
**Never point the tunnel straight at port 11434.** Instead, run a small bridge
server that exposes only the endpoints the website needs and (optionally)
checks a shared secret.

Save this as `bateman-bridge.js` on the Alienware (requires Node.js — `npm install express axios`):

```js
'use strict';
const express = require('express');
const axios = require('axios');

const app = express();
app.use(express.json({ limit: '1mb' }));

const OLLAMA = 'http://localhost:11434';
const MODEL = process.env.BATEMAN_MODEL || 'qwen3';
const SHARED_SECRET = process.env.BRIDGE_SECRET || ''; // set this!

// Reject requests without the shared secret header
app.use((req, res, next) => {
  if (SHARED_SECRET && req.headers['x-bridge-secret'] !== SHARED_SECRET) {
    return res.status(401).json({ error: 'Unauthorised' });
  }
  next();
});

// GET /api/status — model + health info for the dashboard status bar
app.get('/api/status', async (req, res) => {
  try {
    const { data } = await axios.get(`${OLLAMA}/api/tags`, { timeout: 3000 });
    res.json({
      online: true,
      model: MODEL,
      models_available: (data.models || []).map((m) => m.name),
    });
  } catch (err) {
    res.status(503).json({ online: false, error: 'Ollama unreachable' });
  }
});

// POST /api/chat — stream a chat response as SSE
app.post('/api/chat', async (req, res) => {
  const message = (req.body && req.body.message) || '';
  if (!message) return res.status(400).json({ error: 'message is required' });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.flushHeaders();

  try {
    const upstream = await axios.post(
      `${OLLAMA}/api/chat`,
      { model: MODEL, messages: [{ role: 'user', content: message }], stream: true },
      { responseType: 'stream' }
    );

    upstream.data.on('data', (chunk) => {
      // Ollama streams newline-delimited JSON; re-emit as SSE token events
      for (const line of chunk.toString().split('\n')) {
        if (!line.trim()) continue;
        try {
          const parsed = JSON.parse(line);
          const text = parsed.message && parsed.message.content;
          if (text) res.write(`data: ${JSON.stringify({ type: 'token', content: text })}\n\n`);
          if (parsed.done) res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
        } catch (_) { /* partial line */ }
      }
    });

    upstream.data.on('end', () => res.end());
    upstream.data.on('error', () => {
      res.write(`data: ${JSON.stringify({ type: 'error', error: 'Stream failed' })}\n\n`);
      res.end();
    });
  } catch (err) {
    res.write(`data: ${JSON.stringify({ type: 'error', error: 'Ollama unreachable' })}\n\n`);
    res.end();
  }
});

// GET /api/brief — latest morning brief (wire to your Bateman pipeline)
app.get('/api/brief', (req, res) => {
  res.json({ brief: 'No brief generated yet.' });
});

// POST /api/lead — receive forwarded website leads
app.post('/api/lead', (req, res) => {
  console.log('[Bridge] Lead received:', req.body);
  res.json({ success: true });
});

app.listen(3001, '127.0.0.1', () => console.log('Bateman bridge on http://localhost:3001'));
```

Run it: `node bateman-bridge.js` (set `BRIDGE_SECRET` first — see "Securing the tunnel").

## Step 3 — Quick test tunnel (no account needed)

```bash
cloudflared tunnel --url http://localhost:3001
```

The terminal prints a URL like `https://random-words-here.trycloudflare.com`.
That's your tunnel. **Caveat:** the URL changes every time you restart the
tunnel — fine for testing, annoying for production.

## Step 4 — Named tunnel (recommended, permanent URL)

Requires your domain on Cloudflare.

```bash
# 1. Authenticate (opens a browser window)
cloudflared tunnel login

# 2. Create the tunnel
cloudflared tunnel create bateman

# 3. Route a hostname to it
cloudflared tunnel route dns bateman bateman.yourdomain.com
```

Create a config file:
- Windows: `C:\Users\<you>\.cloudflared\config.yml`
- Linux: `~/.cloudflared/config.yml`

```yaml
tunnel: bateman
credentials-file: C:\Users\<you>\.cloudflared\<TUNNEL-UUID>.json

ingress:
  - hostname: bateman.yourdomain.com
    service: http://localhost:3001
  - service: http_status:404
```

Run it:

```bash
cloudflared tunnel run bateman
```

Your permanent URL is now `https://bateman.yourdomain.com`.

## Step 5 — Set the URL on the website

In the website's `.env` (on Hostinger):

```
BATEMAN_API_URL=https://bateman.yourdomain.com
```

(or the trycloudflare.com URL while testing). Restart the Node app after changing it.

## Step 6 — Auto-start on Windows

So the tunnel survives reboots, install it as a Windows service (run an
elevated PowerShell):

```powershell
cloudflared service install
```

This uses your `config.yml`. The bridge itself can be auto-started with
Task Scheduler ("At startup", run `node C:\path\to\bateman-bridge.js`) or a
tool like `pm2` (`pm2 start bateman-bridge.js && pm2 save && pm2 startup`).

## Securing the tunnel

The tunnel URL is public — anyone who finds it can hit your bridge. Two layers
of defence, use at least one:

1. **Shared secret header (simplest).** Set `BRIDGE_SECRET` on the Alienware
   and have the website send it. In the website's `routes/api.js`, add the
   header to the axios calls:
   ```js
   headers: { 'x-bridge-secret': process.env.BRIDGE_SECRET }
   ```
   and add `BRIDGE_SECRET=` to both machines' `.env` files with the same value.

2. **Cloudflare Access (stronger).** In the Cloudflare Zero Trust dashboard,
   create an Access application for `bateman.yourdomain.com` with a Service
   Token policy. The website then sends `CF-Access-Client-Id` and
   `CF-Access-Client-Secret` headers. Nothing reaches your PC without them.

## Troubleshooting

| Symptom | Likely cause / fix |
| --- | --- |
| Dashboard shows "Bateman offline" | Tunnel or bridge not running on the Alienware. Check both terminal windows. |
| `cloudflared` runs but URL 502s | The bridge isn't listening on 3001, or the `service:` URL in config.yml is wrong. |
| Works on PC, not from website | `BATEMAN_API_URL` typo, or Hostinger blocking outbound requests (rare — check with support). |
| Chat replies are slow | Qwen3 inference speed — check GPU utilisation; consider a smaller quant. |
| trycloudflare URL stopped working | Quick tunnels are ephemeral. Restart and update `BATEMAN_API_URL`, or switch to a named tunnel. |
| Tunnel dies when you log out of Windows | Install it as a service (Step 6). |
