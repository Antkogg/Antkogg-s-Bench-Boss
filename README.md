# Antkogg's LG Assistant

Antkogg's LG Assistant is a Discord-native operations bot for an LG CHEL organization. It preserves the original scouting workflow and adds regular-season roster operations, weekly game availability, a private Training Camp pipeline, official-rule references, controlled announcements, activity history, and role synchronization. Discord is the complete product; there is no separate website or public API.

The PostgreSQL database is authoritative. Discord posts and roles are projections of stored state, and all privileged actions are checked server-side.

## Features

### Scouting

- Exact-EA-Tag player registration with LG username and eligible positions
- ONE_SIDE and PRIVATE_6V6 sessions, open signup or availability mode
- Atomic position claims, switches, leaves, conflict checks, and management overrides
- One persistent canonical lineup post per session
- Forward, defense, and goalie waitlists with persisted timed offers
- DM confirmations, changes, removals, reminders, locks, and cancellations
- Attendance, no-shows, evaluations, notes, scouting statuses, and audit history
- Deleted-post regeneration and restart-safe component IDs

### Team operations

- Separate `SCOUT`, `TC`, `ROSTER`, `MANAGEMENT`, and `ALUMNI_INACTIVE` team states
- Independent private TC readiness: Unranked, Developing, Watch, Call-Up Ready, and Roster Priority
- Team dashboard with roster/TC totals, current availability, and TC readiness counts
- Private player views containing scouting results, attendance, weekly availability, and recent activity
- Discord role synchronization for Roster, TC, Scout/Registered, and position roles
- Targeted management announcements with controlled mentions

### Weekly availability

- Managers save their own IANA timezone once; entered game times are stored in UTC and player-facing times use Discord timestamps
- `/week setup` or `/week next` prefills Sunday, Monday, and Tuesday from configured standard LG slots
- Opponents, home/away, and times are edited in place so existing availability stays attached
- One clean public post grouped by day with Submit/Edit and Unavailable-for-All controls
- Every active game has an explicit Available or Unavailable answer; missing answers remain No Response
- Open, lock, reopen, and close states
- Private management views separate Roster and TC availability and expose No Response clearly
- Missing-response reports can DM only the players who still need to answer
- Persisted, restart-safe deadline reminders with configurable roster/TC policy
- Six-position `LW/C/RW/LD/RD/G` lineups with eligibility validation, audited overrides, and explicit confirmation
- Only confirmed players receive lineup/game-info DMs and can retrieve their nearest game with `/game`
- A persisted private management reminder fires one hour before a game when its server or code is missing
- Weekly availability is intentionally separate from scouting-session availability

### Official rules

- A versioned source library that preserves historical document versions
- Direct links to official Leaguegaming Constitution Articles I-IV
- Search over active text that management has explicitly imported from an official source
- `/rule ask` returns retrieved official excerpts only; without an AI provider it does not infer or invent an answer
- NHL 27 builds, disconnect procedure, and playoff documents clearly say "not yet configured" until official material is added

Official constitution sources:

- [Article I](https://www.leaguegaming.com/esports/Leaguegaming_Constitution_Article_I.pdf)
- [Article II](https://www.leaguegaming.com/esports/Leaguegaming_Constitution_Article_II.pdf)
- [Article III](https://www.leaguegaming.com/esports/Leaguegaming_Constitution_Article_III.pdf)
- [Article IV](https://www.leaguegaming.com/esports/Leaguegaming_Constitution_Article_IV.pdf)

The PDFs remain the authority. To make one searchable, extract its text to a UTF-8 `.txt` file and use `/rule admin-add`, keeping the official PDF URL in `source`. The bot does not scrape or silently replace official text.

## Commands

Players:

- `/profile` — register, update, or view a private player profile
- `/scouting` — browse upcoming scouting sessions
- `/schedule`, `/availability mine` — view the current week and your response/lineup state
- `/game` — retrieve your nearest confirmed game, position, server, and code
- `/team` — open the regular-season dashboard and jump to team tools
- `/rules`, `/rule search`, `/rule ask`, `/builds`, `/disconnect` — browse cited rule material
- `/help` — usage guidance

Management:

- `/scout create|manage|upcoming` — operate scouting sessions
- `/timezone set|view` — save the timezone used for schedule entry
- `/week setup|next|view` — create and manage a schedule from standard slots
- `/availability manage|missing|state|set-player` — operate weekly availability
- `/player` — inspect a player and optionally change team or TC status
- `/tc board|player|status` — manage the private TC pipeline
- `/announce` — post a configured, targeted team announcement
- `/board` — open the scouting management board
- `/setup view|onboarding|channels|roles|defaults|availability|schedule` — configure the server
- `/rule admin-add|admin-state` — version and activate official rule documents

Discord's 25-option select-menu limit is handled by limiting a weekly post to 25 games. Management views also cap long player lists to fit Discord embed limits.

## Architecture

```text
src/
├── bot/             Discord client, command registration, interaction router
├── commands/        Slash-command handlers and authorization guard
├── interactions/    Restart-safe buttons, menus, and modals
├── services/        Scouting, availability, team, rules, roles, notifications
├── renderers/       Central embeds and component payloads
├── domain/          Position, scouting, and permission rules
├── jobs/            Persisted scouting and weekly-availability reminders
├── database/        One Prisma client lifecycle
├── config/          Environment validation and brand tokens
└── utils/           Errors, logging, normalization, custom IDs
prisma/
├── schema.prisma
└── migrations/      Additive PostgreSQL migrations; historical data is retained
tests/               Domain, service, concurrency, rendering, and expansion tests
```

Important writes run through service methods. Database uniqueness constraints enforce one scouting assignment per player/session, one occupant per lineup slot, one waitlist entry per player/session, one weekly submission per player/week, and one game selection per submission/game.

The LG Assistant migration is additive. It repairs the historical `RW_F`/single-position schema drift, converts existing positions to an array, retains all scouting records, and adds team, weekly-availability, activity, reminder, and versioned-rule tables.

## Requirements

- Node.js 22.12 or newer
- PostgreSQL 14 or newer (a Neon PostgreSQL connection works)
- A Discord application and bot user

## Discord application setup

1. Create an application in the [Discord Developer Portal](https://discord.com/developers/applications).
2. Create its bot user and place the token in `DISCORD_TOKEN`.
3. Enable **Server Members Intent** so roles can be synchronized.
4. On **Installation**, use a Discord-provided install link or set the default authorization link to **None** for a private application.
5. Install with the `bot` and `applications.commands` scopes.
6. Grant View Channels, Send Messages, Embed Links, Read Message History, Use Application Commands, and Manage Roles.
7. Place the bot's role above every Roster, TC, Scout/Registered, and position role it must manage.
8. Keep management and TC channels private with normal Discord channel permissions.

The bot does not need Message Content Intent or Administrator permission. Granting only the listed permissions reduces risk.

## Environment and database

Copy `.env.example` to `.env` and fill in real values. Never commit `.env`.

```dotenv
DISCORD_TOKEN=your-bot-token
DISCORD_CLIENT_ID=your-application-id
DISCORD_GUILD_ID=optional-development-server-id
DATABASE_URL="postgresql://user:password@host/database?sslmode=require"
LOG_LEVEL=info
NODE_ENV=development
```

`DISCORD_GUILD_ID` makes command updates immediate in one development server. Without it, commands register globally and can take time to propagate.

Install and initialize:

```bash
npm install --include=dev
npm run db:deploy
npm run commands:register
npm run build
```

The production migration command is `npm run db:deploy`; do not use `prisma migrate dev` against Neon production. Existing scouting data is not cleared.

Run initial Discord configuration in this order:

1. `/setup channels`
2. `/setup roles`
3. `/setup defaults`
4. `/setup availability`
5. `/setup schedule` (standard Sunday/Monday/Tuesday game times and deadline)
6. Each Owner/GM/AGM runs `/timezone set`
7. `/setup onboarding`
8. `/setup view`

Regular-season weekly flow:

1. Management runs `/week setup` for the first week, then `/week next` afterward.
2. Use the Edit Sunday/Monday/Tuesday buttons to enter `Opponent | HOME/AWAY | time`.
3. Publish availability from the week panel; players submit from the single public post.
4. Lock availability, select a game, build all six positions, and confirm the lineup.
5. Set the server/code from the game panel. Confirmed players can always use `/game`.

Owner, GM, AGM, Discord Administrator, and the optional legacy management role have management access. Roster and TC roles do not grant management access.

## Local development

```bash
npm run dev
npm run typecheck
npm run lint
npm test
npm run build
npm run format:check
```

`npm run db:seed` creates development-only fake data and refuses to run in production.

## Production deployment — Ubuntu 24.04 / Google Compute Engine

The supported production runtime is **Node.js 22.12 or newer** on x86-64 Linux. The bot is fully headless, uses Neon PostgreSQL through `DATABASE_URL`, writes structured logs to stdout/stderr for journald, and does not require an HTTP server.

Required environment variable names:

- `DISCORD_TOKEN`
- `DISCORD_CLIENT_ID`
- `DATABASE_URL`

Optional environment variable names:

- `DISCORD_GUILD_ID` — use one guild for immediate command registration; omit for global commands
- `NODE_ENV` — set to `production`
- `LOG_LEVEL` — defaults to `info`

Create `/etc/antkoggs-lg-assistant.env` without placing secrets in the repository:

```dotenv
DISCORD_TOKEN=...
DISCORD_CLIENT_ID=...
DATABASE_URL="postgresql://...?sslmode=require"
NODE_ENV=production
LOG_LEVEL=info
# DISCORD_GUILD_ID=...
```

Protect it with `sudo chown root:root /etc/antkoggs-lg-assistant.env` and `sudo chmod 600 /etc/antkoggs-lg-assistant.env`.

From the cloned repository, use this reproducible installation and release sequence:

```bash
npm ci
npm run build
npm run db:deploy
npm run commands:register
npm prune --omit=dev
```

`npm run db:deploy` applies committed, additive Prisma migrations. It never invokes a development reset or seed. Run command registration when command definitions change; omit `DISCORD_GUILD_ID` to register globally.

There is one production start command:

```bash
npm start
```

The example [systemd service](deploy/antkoggs-lg-assistant.service.example) assumes:

- repository: `/opt/antkoggs-lg-assistant`
- service account: `lgassistant`
- system-wide npm: `/usr/bin/npm`
- environment file: `/etc/antkoggs-lg-assistant.env`

Adjust those values if your VM differs, then install it:

```bash
sudo cp deploy/antkoggs-lg-assistant.service.example /etc/systemd/system/antkoggs-lg-assistant.service
sudo systemctl daemon-reload
sudo systemctl enable --now antkoggs-lg-assistant
sudo systemctl status antkoggs-lg-assistant
```

View live headless logs with:

```bash
sudo journalctl -u antkoggs-lg-assistant -f
```

The unit restarts failed startup attempts and unexpected process exits with a delay. Discord.js reconnects shards after ordinary disconnects. Database-dependent interactions fail individually and later requests can succeed after Neon recovers; background jobs catch errors and retry on later sweeps. SIGTERM/SIGINT stops all sweep timers, closes Discord, and disconnects Prisma.

Reminder claims, schedules, lineups, component entity IDs, and delivery timestamps are persisted in PostgreSQL. On process or VM restart, scouting, availability, and missing server/code sweeps run immediately, catch up due work, retry transient delivery failures, and use database uniqueness constraints to avoid resending successful claims. Buttons and select menus are routed from deterministic `bb:` custom IDs instead of in-memory collectors.

## 256 MB Bot-Hosting deployment

The repository includes committed `dist/` JavaScript so the free host does not compile TypeScript. Build, migrate, and register commands on your computer before pushing.

Use startup file:

```text
dist/index.js
```

The host should install runtime packages only:

```bash
npm ci --omit=dev --omit=optional --legacy-peer-deps --ignore-scripts --no-fund --no-audit
node dist/index.js
```

If the panel always runs npm itself, configure its install command with the same flags. Do not put `omit=dev` in the project's `.npmrc`, because local builds need TypeScript, Prisma, and type packages. A 256 MB host can additionally set `NODE_OPTIONS=--max-old-space-size=128` during npm installation.

For Bot-Hosting's fixed startup command (`npm install ... && node ${STARTUP_FILE}`), set the panel environment variable `NODE_ENV=production`. npm then omits development dependencies on the server while local `npm install --include=dev` continues to provide the build tools. Set `STARTUP_FILE=dist/index.js`.

The process is running successfully when the console reaches the logged-in ready message and remains online. A free host is only truly 24/7 if its plan does not sleep and its resource limit can sustain both installation and runtime; the bot itself cannot override host suspension policies.

## Operations and troubleshooting

- **Commands missing:** run `npm run commands:register`, verify the client/guild IDs, and confirm `applications.commands` scope.
- **Migration failure:** verify `DATABASE_URL`, Neon network access, and run `npm run db:deploy` locally. Never paste the connection string into chat or logs.
- **Role sync failure:** grant Manage Roles and move the bot role above managed roles. Database changes remain saved if Discord rejects a role update.
- **No DM:** the underlying operation still succeeds; the failed delivery is persisted where applicable.
- **Deleted scouting post:** use `/scout manage` and Regenerate Post.
- **Deleted weekly post:** use Publish Availability in `/week view`; it rebuilds the canonical post from PostgreSQL.
- **Simultaneous claim:** PostgreSQL chooses one winner and the other player receives a friendly position-taken response.
- **Rule search has no result:** import verified official text with `/rule admin-add`; the bot deliberately refuses to guess.
- **Exit code 137:** npm exceeded host RAM. Verify only production dependencies are installed and deploy the prebuilt `dist/` output.

## Security and privacy

- Tokens and database URLs are environment-only and redacted from structured logs.
- Management permissions are revalidated for every command, button, menu, and modal.
- Internal TC status, evaluations, notes, attendance, and audit data remain management-only.
- Component IDs are parsed and the referenced database entity is revalidated.
- Management overrides and status/rule changes are audited.
- Announcement mentions use explicit Discord `allowedMentions` controls.
- Rule responses cite configured official sources and distinguish unavailable material.

## License

Private project. All rights reserved.
