# Antkogg's Bench Boss

**BENCH BOSS** is a Discord-native LG CHEL scouting and management bot. Discord is the complete product: players register, claim lineup positions, join waitlists, receive reminders, and manage their profile without leaving the server. Management configures and operates scouting through slash commands, private controls, modals, and persistent public lineup posts.

There is no website, dashboard, or public API.

## What it does

- One-click, server-validated lineup signup with exact EA Tag display
- LG position groups and eligibility (`LW/C/RW`, `LD/RD`, or `G`)
- ONE_SIDE (6-player) and PRIVATE_6V6 (12-player) sessions
- Partial lineups that management can lock and start
- Canonical scouting posts that update instead of spamming the channel
- Transactional position claims, position switching, leaving, and conflict checks
- Forward, defense, and goalie waitlists with timed spot offers
- Signup confirmations, changes, removals, lock/cancellation updates, and reminders by DM
- Safe behavior when a user blocks DMs
- Availability-mode sessions as a secondary lineup-building workflow
- Persistent guild configuration, roles, player records, sessions, lineups, attendance, evaluations, notes, statuses, and audits
- Private management player views and an actionable management board
- Deleted-message recovery through **Regenerate Post**
- Restart-safe buttons and menus using deterministic IDs—no temporary collectors

## Player experience

1. Run `/profile` and tap **Register**.
2. Enter an LG username, the EA Tag exactly as it appears in EA SPORTS NHL, and an LG signup position.
3. Use `/scouting` or open the configured scouting channel.
4. Tap an eligible position. The claim is immediate; no extra confirmation step is added.
5. Use another position button to switch or **Leave Game** to release the spot.

Exact EA Tags are preserved for display. A normalized copy is stored only for search and duplicate detection.

## Commands

Players:

- `/profile` — register, update, and view the private player profile
- `/scouting` — browse upcoming sessions and jump to their canonical post
- `/help` — concise player and management guidance

Management:

- `/scout create` — create and publish ONE_SIDE or PRIVATE_6V6 scouting
- `/scout manage` — open the private session control room
- `/scout upcoming` — browse upcoming sessions
- `/player query:<EA Tag|LG username|Discord ID>` — private player history and scouting record
- `/board` — next sessions, scouting-pool counts, and needs attention
- `/setup` — configure roles, channels, timezone, defaults, duration, and reminders

Discord permissions are validated server-side. Hiding a control is never treated as authorization.

## Architecture

The PostgreSQL database is authoritative. Discord messages and roles reflect database state; they are never read as application state.

```text
src/
├── bot/             Discord client, command registration, interaction router
├── commands/        Small slash-command handlers
├── interactions/    Restart-safe buttons, menus, and modals
├── services/        Player, scouting, roles, notifications, management logic
├── renderers/       Central Bench Boss embed and component design system
├── domain/          Position, scouting, and permission rules
├── jobs/            Persistent reminder processing
├── database/        Prisma client lifecycle
├── config/          Environment validation and visual tokens
└── utils/           Errors, logging, normalization, custom IDs
prisma/
├── schema.prisma
├── migrations/
└── seed.ts
tests/               Domain, service concurrency, configuration, and renderer tests
```

Important mutations run through services. Scouting signup and switches use serializable transactions plus database unique constraints:

- one assignment per player per session
- one player per team/position/slot
- one waitlist record per player per session
- stable waitlist queue order

Rapid message refreshes are coalesced. If the canonical Discord message is gone, the next publish/regenerate action rebuilds it entirely from PostgreSQL.

## Requirements

- Node.js 22.12 or newer
- PostgreSQL 14 or newer
- A Discord application and bot user

## Discord application setup

1. Create an application in the [Discord Developer Portal](https://discord.com/developers/applications).
2. Add a bot user and copy its token into `DISCORD_TOKEN`.
3. Enable **Server Members Intent**. Bench Boss needs it to synchronize registration roles.
4. Install the application with the `bot` and `applications.commands` scopes.
5. Grant the bot these server permissions:

   - View Channels
   - Send Messages
   - Embed Links
   - Read Message History
   - Use Application Commands
   - Manage Roles (only if role synchronization is wanted)

6. Move the bot role above every role it should manage.
7. Keep the management channel private through normal Discord channel permissions.

The bot does not require Message Content Intent.

## Environment

Copy `.env.example` to `.env` and provide real values:

```dotenv
DISCORD_TOKEN=your-bot-token
DISCORD_CLIENT_ID=your-application-id
DISCORD_GUILD_ID=optional-development-server-id
DATABASE_URL=postgresql://user:password@localhost:5432/bench_boss
LOG_LEVEL=info
NODE_ENV=development
```

`DISCORD_GUILD_ID` is optional. When present, command registration targets that one guild and updates immediately. Without it, commands are registered globally and may take time to propagate.

Startup validates all critical values and exits with a clear summary when configuration is invalid. Tokens and database URLs are redacted from structured logs.

## Database

Generate the Prisma client and apply migrations:

```bash
npm run db:generate
npm run db:deploy
```

For local schema development:

```bash
npm run db:migrate
```

Prisma 7 uses the official PostgreSQL driver adapter at runtime. The included migration creates all enums, tables, foreign keys, uniqueness constraints, and indexes.

## Development

```bash
npm install
npm run db:deploy
npm run commands:register
npm run dev
```

Then run the Discord setup flow:

1. `/setup channels`
2. `/setup roles`
3. `/setup defaults`
4. `/setup view`

Use `npm run db:seed` to create a development-only fake scouting pool, partial ONE_SIDE session, PRIVATE_6V6 session, waitlist entry, and evaluation. The seed refuses to run when `NODE_ENV=production` and only resets the deliberately named `development-guild` seed data.

## Production

```bash
npm ci
npm run db:deploy
npm run build
npm run commands:register
NODE_ENV=production npm start
```

Run one bot process for the current reminder scheduler. Use a supervised process or container with graceful SIGINT/SIGTERM delivery. Apply database migrations before replacing the running process.

## Validation

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm run format:check
```

Tests cover every allowed and denied position combination, lineup capacities, partial needs, time conflicts, registration configuration, persistent component IDs, locked/closed states, duplicate/switch behavior, management conflict overrides, two-player final-slot concurrency, PRIVATE_6V6 rendering, availability UI, and disabled controls for terminal states.

## Operations and troubleshooting

**Commands do not appear**

- Run `npm run commands:register` with the correct application ID.
- During development, set `DISCORD_GUILD_ID` for immediate guild-scoped updates.
- Confirm the application was installed with `applications.commands`.

**Role synchronization fails**

- Give the bot **Manage Roles**.
- Move its role above Registered/Forward/Defense/Goalie/position roles.
- Registration remains saved even if Discord rejects a role update.

**A player receives no DM**

- The lineup operation still succeeds. The ephemeral response reports the DM failure.
- The player can follow all authoritative updates on the canonical scouting post.

**A scouting post was deleted**

- Open `/scout manage` and choose **Regenerate Post**. The lineup is reconstructed from the database.

**A position was claimed at the same time**

- PostgreSQL selects exactly one winner. The other player gets a friendly position-taken response and a group-waitlist option.

**The bot exits at startup**

- Read the configuration summary in the log and fill every required `.env` value.
- Confirm PostgreSQL is reachable from the runtime and migrations are deployed.

## Security and privacy

- Never commit `.env` or production credentials.
- Evaluations, notes, attendance, and internal statuses only render after management permission checks.
- Interaction IDs are parsed and every entity/action is revalidated against the database.
- Management overrides are explicit and stored on assignments/audit records.
- Discord/database error details and stack traces are logged, not shown to players.
- No player-facing command exposes private scouting evaluations or notes.

## License

Private project. All rights reserved.
