# BeamState RP Sync — v2 (Discord-native)

Vehicle access is now controlled entirely from Discord — no more external
Lovable/Base44 API. The bot keeps its own local `data.json` and exposes a
small local HTTP API that the BeamMP Lua plugin polls.

## ⚠️ First: rotate your bot token

The `_env` file you had included a live `DISCORD_TOKEN` and `BOT_API_KEY`
in plaintext. Go to the Discord Developer Portal → your app → Bot → **Reset
Token**, and generate a new one before deploying this. Never commit `.env`
to source control (add it to `.gitignore`).

## Setup

1. `npm install`
2. Copy `.env.example` to `.env` and fill in:
   - `DISCORD_TOKEN` — your bot's token (rotated, see above)
   - `CLIENT_ID` — your application ID
   - `GUILD_ID` — the Discord server ID you're running this in
   - `CHECKPOINTS_CHANNEL_ID` — the `#checkpoints` channel ID
   - `API_PORT` — defaults to 3000
3. Register the slash commands (run once, or again whenever commands change):
   ```
   npm run deploy-commands
   ```
4. Start the bot:
   ```
   npm start
   ```
5. Generate a random `API_KEY` (e.g. `openssl rand -hex 24`) and put it in
   the bot's `.env`.
6. Drop `main.lua` into `Resources/Server/Carspawnblocker/main.lua` on your
   Connecthosting BeamMP server, and edit two lines at the top:
   - `API_HOST` — the public IP or domain of the machine running the bot,
     plus the port (e.g. `"http://203.0.113.10:3000"`)
   - `API_KEY` — the **same** value you put in the bot's `.env`

## Bot and BeamMP server on different hosts

Since Connecthosting hosts your BeamMP server and the bot runs elsewhere
(a VPS, home server, etc.), the API now has to be reachable over the public
internet rather than localhost. A few things to check:

- **Open the port on the bot's host.** Whatever firewall/security-group
  your bot's hosting provider uses, allow inbound TCP on `API_PORT`
  (default 3000). If your bot host has a dynamic IP, consider a free
  Dynamic DNS hostname and point `API_HOST` in `main.lua` at that instead
  of a raw IP.
- **The API is now authenticated** via the `x-api-key` header/`API_KEY` —
  anyone without it gets a 401. Still worth restricting inbound access to
  just Connecthosting's IP range in your firewall if your provider supports
  IP allowlisting, since the key alone is your only line of defense
  otherwise.
- **Connecthosting must allow outbound HTTP from the game server process.**
  Most BeamMP hosts do (the original plugin already relied on outbound curl
  to base44.app), but if requests silently fail, check with their support
  whether outbound connections on non-standard ports are blocked — you may
  need to run the bot's API on port 80/443 (behind something like Caddy/nginx
  with a real TLS cert) if they restrict arbitrary outbound ports.
- **Latency:** cross-host requests will be slower than localhost. The
  `onPlayerJoin` fetch is already deferred and non-blocking; the timeouts in
  `main.lua` (`--connect-timeout 3 --max-time 4`) give it a bit more room
  than the original localhost version.

## How it works

1. Your existing checkpoint-logging setup posts messages like
   `guest0324138 connected. Discord Profile: @bxn.` into `#checkpoints`.
   The bot reads these (on startup, scanning the last 100 messages, and
   live afterward) purely to **link** a BeamMP guest name to a Discord
   identity — it no longer syncs anything externally.
2. An admin runs `/assign` in Discord to grant a vehicle:
   ```
   /assign discord_user:@bxn vehicle:etk800
   ```
   or, if that player hasn't been linked yet, by raw BeamMP name:
   ```
   /assign beam_username:guest0324138 vehicle:etk800
   ```
3. When that player tries to spawn a vehicle in BeamMP, `main.lua` asks the
   bot's local API for their assigned vehicle list and blocks the spawn if
   the model isn't on it.

## Commands

| Command | Who | What it does |
|---|---|---|
| `/assign <vehicle> [discord_user \| beam_username]` | Manage Server | Grants a player permission to spawn a vehicle |
| `/unassign <vehicle> [discord_user \| beam_username]` | Manage Server | Revokes that permission |
| `/vehicles [discord_user \| beam_username]` | Everyone | Lists a player's assigned vehicles |
| `/whois <beam_username>` | Everyone | Shows which Discord user a guest name is linked to |
| `/link <discord_user> <beam_username>` | Manage Server | Manually links an identity (in case checkpoint parsing misses one) |

Vehicle names should match the in-game model/JBeam name (e.g. `etk800`,
`pickup`) — matching is case-insensitive.

## Files

- `index.js` — bot logic + local API server
- `store.js` — JSON-backed data store (`data.json` is created automatically)
- `deploy-commands.js` — one-time/occasional slash command registration
- `main.lua` — BeamMP server plugin
