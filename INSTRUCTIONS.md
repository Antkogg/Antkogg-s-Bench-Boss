# Antkogg's Bench Boss

You are starting in an **empty or newly initialized project folder**.

Your task is to design, implement, test, document, and leave behind a complete working Discord bot called **Antkogg's Bench Boss**.

This project is, and is intended to remain, a **Discord-only application**.

There is no web dashboard, website, admin portal, mobile app, or future external frontend planned.

Do not architect around hypothetical future interfaces.

Build the absolute best Discord-native experience possible.

Do not stop at scaffolding, pseudocode, planning, mockups, or partially implemented features.

---

# 1. Product Vision

**Antkogg's Bench Boss** is a Discord bot purpose-built for **LG CHEL scouting and management**.

It should make operating an LG scouting Discord dramatically easier while requiring almost no explanation for players.

The core philosophy is:

> **Powerful behind the scenes. Effortless inside Discord.**

A new player should be able to:

1. Join the Discord.
2. Register.
3. Enter their exact EA Tag.
4. Enter their LG signup position.
5. Automatically receive the correct roles.
6. Find upcoming scouting games.
7. Click an eligible position.
8. Be confirmed immediately.
9. Receive an automatic confirmation DM.
10. Receive important scouting reminders/updates.
11. Play.

Management should be able to:

1. Configure the bot entirely through Discord.
2. Create scouting sessions.
3. Monitor signups through automatically updating embeds.
4. Manage lineups.
5. Add/remove/move/swap players.
6. Run one-side public matchmaking scouting.
7. Run full private 6v6 scouting.
8. Start with partial lineups.
9. Manage waitlists.
10. Track attendance.
11. Maintain private evaluations and notes.
12. Maintain a scouting shortlist/board.

Everything should happen inside Discord.

---

# 2. Discord-Only Requirement

This project is intentionally Discord-only.

Do NOT build or prepare for:

* Web dashboard
* Website
* REST API for a future frontend
* GraphQL API
* Admin website
* Player website
* Separate management portal
* Mobile application
* Browser authentication
* OAuth for a future dashboard
* Frontend framework
* React
* Next.js
* Express API unless genuinely required internally
* Public API
* Microservices

Do not add abstraction solely because another frontend *might* exist someday.

It is not planned.

The product interface is:

> **Discord**

Use Discord's native capabilities as the product UI:

* Slash commands
* Embeds
* Buttons
* Select menus
* Modals
* Ephemeral responses
* DMs
* Channels
* Roles
* Discord timestamps

---

# 3. Branding

Official name:

> **Antkogg's Bench Boss**

Short visual brand:

> **BENCH BOSS**

Supporting descriptor:

> **LG Scouting & Management**

Use branding consistently across:

* Scouting
* Registration
* Profiles
* Automatic DMs
* Management interfaces
* Help
* README

Do not repeat the full name unnecessarily.

The visual identity should feel:

* Modern
* Competitive
* Hockey-focused
* Clean
* Professional
* Purpose-built

Avoid excessive emojis.

---

# 4. UX Philosophy

Do not confuse more features with better software.

Players should need very few commands.

Prefer:

```text
Click C
```

over:

```text
/scout signup session:123 position:center
```

Prefer:

```text
[ Leave Game ]
```

over:

```text
/scout unregister
```

Use:

* Buttons
* Select menus
* Modals
* Ephemeral interactions

whenever they provide a cleaner experience.

Normal player flow:

```text
JOIN
 ↓
REGISTER
 ↓
EA TAG
 ↓
LG POSITION
 ↓
ROLES
 ↓
SCOUTING
 ↓
CLICK POSITION
 ↓
CONFIRMED
 ↓
DM
 ↓
PLAY
```

The player should not need to understand how the bot works.

---

# 5. Technology

Build a modern TypeScript Discord application.

Preferred stack:

* Node.js
* TypeScript
* discord.js
* PostgreSQL
* Prisma
* Zod where useful
* Vitest
* ESLint
* Prettier
* Structured logging

Use current stable mutually compatible versions.

Do not introduce technologies that do not provide meaningful value to this Discord bot.

---

# 6. Architecture

Do NOT create one giant bot file.

Separate:

* Discord client
* Command registration
* Interaction routing
* Commands
* Buttons
* Select menus
* Modals
* Registration
* Players
* Roles
* Scouting
* Lineups
* Waitlists
* Notifications
* Automatic DMs
* Attendance
* Evaluations
* Notes
* Management
* Guild configuration
* Database
* Renderers
* Scheduled jobs
* Permissions
* Logging
* Error handling
* Utilities

Interaction handlers should remain small.

Business logic should not be duplicated between interactions.

Example:

```ts
await scoutingService.signup({
  playerId,
  sessionId,
  position,
});
```

The service handles:

* Eligibility
* Availability
* Conflicts
* Persistence
* Race conditions

The interaction handler handles Discord interaction concerns.

---

# 7. Suggested Structure

```text
antkoggs-bench-boss/
├── src/
│   ├── index.ts
│   │
│   ├── bot/
│   │   ├── client.ts
│   │   ├── interaction-router.ts
│   │   └── register-commands.ts
│   │
│   ├── commands/
│   │   ├── profile/
│   │   ├── scouting/
│   │   ├── player/
│   │   ├── board/
│   │   ├── setup/
│   │   └── help/
│   │
│   ├── interactions/
│   │   ├── buttons/
│   │   ├── modals/
│   │   └── select-menus/
│   │
│   ├── services/
│   │   ├── player.service.ts
│   │   ├── registration.service.ts
│   │   ├── role.service.ts
│   │   ├── scouting.service.ts
│   │   ├── lineup.service.ts
│   │   ├── waitlist.service.ts
│   │   ├── notification.service.ts
│   │   ├── attendance.service.ts
│   │   ├── evaluation.service.ts
│   │   └── config.service.ts
│   │
│   ├── renderers/
│   │   ├── scouting.renderer.ts
│   │   ├── registration.renderer.ts
│   │   ├── profile.renderer.ts
│   │   ├── management.renderer.ts
│   │   └── status.renderer.ts
│   │
│   ├── jobs/
│   │   └── scouting-reminders.ts
│   │
│   ├── database/
│   │   └── client.ts
│   │
│   ├── domain/
│   │   ├── positions.ts
│   │   ├── scouting.ts
│   │   └── permissions.ts
│   │
│   ├── config/
│   ├── types/
│   └── utils/
│
├── prisma/
│   └── schema.prisma
├── tests/
├── .env.example
├── package.json
├── tsconfig.json
└── README.md
```

Adjust where appropriate, but maintain clear responsibilities.

---

# 8. Database Is Authoritative

Discord is the interface.

The database stores authoritative application state.

Do not use:

* Embed contents
* Discord roles
* Message text
* Channel names
* Temporary arrays

as the source of truth.

Important state must survive:

* Restart
* Deployment
* Discord disconnect
* Process crash

Discord roles should reflect database state.

---

# 9. Do Not Over-Abstract

Although the code should be clean and modular, this is one Discord application.

Do not create:

* Repository layers just for the sake of having repository layers
* Interfaces with only one implementation unless they provide genuine value
* Dependency injection frameworks without a clear need
* Microservices
* Event buses without a clear need
* Internal HTTP APIs
* Excessive design patterns
* Dozens of tiny files containing trivial code

Optimize for:

> **easy to understand + easy to maintain**

not architectural complexity.

---

# 10. Multi-Season Configuration

The bot should work across future LG seasons without code changes.

Do not hardcode:

* Season
* Team
* League
* Role IDs
* Channel IDs
* User IDs
* Scouting dates
* Scouting times
* Reminder times
* Timezone

Configure these through Discord and persist them.

---

# 11. Player Information

Store at minimum:

```text
Discord User ID
Discord display metadata

LG Username
LG Signup Position

Exact EA Tag
Normalized EA Tag

Position Group

Registration Status

Created At
Updated At
```

Relations can store:

* Scouting signups
* Waitlists
* Attendance
* Evaluations
* Notes
* Management status

---

# 12. Exact EA Tag

Every player must provide their exact EA Tag.

Tell them:

> **Enter your EA Tag exactly as it appears in EA SPORTS NHL.**
>
> Make sure capitalization, spaces, numbers, and special characters are correct.

Store:

```text
eaTag = "xX AnTkOgG Xx"
```

and:

```text
eaTagNormalized = "xx antkogg xx"
```

The original value must never be modified for display.

The normalized value exists only for:

* Search
* Matching
* Duplicate detection

Scouting lineups display the exact EA Tag.

---

# 13. Position Groups

Use:

```text
FORWARD
DEFENSE
GOALIE
```

Eligibility:

| LG Signup | Group   | Scouting Eligibility |
| --------- | ------- | -------------------- |
| LW        | FORWARD | LW / C / RW          |
| C         | FORWARD | LW / C / RW          |
| RW/F      | FORWARD | LW / C / RW          |
| LD        | DEFENSE | LD / RD              |
| RD        | DEFENSE | LD / RD              |
| G         | GOALIE  | G                    |

A registered C can scout at:

```text
LW
C
RW
```

without changing their LG signup position.

A registered RD can scout:

```text
LD
RD
```

Goalies can only scout:

```text
G
```

---

# 14. Position Validation

Eligibility must be validated server-side.

Never trust the visible buttons.

Reject:

```text
Forward → LD
Forward → RD
Forward → G

Defense → LW
Defense → C
Defense → RW
Defense → G

Goalie → any skater position
```

Management can explicitly override where necessary.

Audit overrides.

---

# 15. Registration

Registration should be quick.

Collect:

1. LG username
2. Exact EA Tag
3. LG signup position
4. Confirmation

Then:

* Save player
* Calculate group
* Calculate eligibility
* Assign/synchronize roles
* Confirm registration

Do not fabricate automatic LG verification if no reliable source is available.

---

# 16. Role Management

Support configurable roles such as:

```text
Registered

Forward
Defense
Goalie

LW
C
RW
LD
RD
G
```

Individual position roles should be optional.

Do not clutter the server with unnecessary roles.

The bot should be capable of repairing role state using database information.

---

# 17. Scouting

Scouting is the showcase feature.

Management creates a session using:

```text
/scout create
```

Use a polished Discord-native creation flow.

Capture:

* Date
* Time
* Expected duration
* Format
* Signup mode
* Optional note

Then automatically create the scouting post.

---

# 18. Scouting Formats

## ONE_SIDE

Default.

One lineup:

```text
LW
C
RW
LD
RD
G
```

Normal capacity:

```text
6
```

This is used when management gathers scouts and enters public matchmaking.

---

## PRIVATE_6V6

Two teams:

```text
TEAM 1
LW
C
RW
LD
RD
G

TEAM 2
LW
C
RW
LD
RD
G
```

Normal capacity:

```text
12
```

---

# 19. Partial Games

A game does NOT need to fill.

Example:

```text
LW   PlayerA
C    PlayerB
RW   PlayerC
LD   PlayerD
RD   OPEN
G    OPEN
```

Management can start this session.

Do not block it because it is 4/6.

Statuses:

```text
OPEN
LOCKED
IN_PROGRESS
COMPLETED
CANCELLED
```

Full is a lineup condition, not a required status.

---

# 20. One Persistent Scouting Post

Each session gets one canonical Discord post.

Update that message whenever state changes.

Never spam the channel with:

```text
Player joined!
Player left!
Player changed position!
```

Instead:

> update the original scouting post

Player-specific feedback should normally be ephemeral or DM-based.

---

# 21. Embeds Must Be Exceptional

This is a major requirement.

The scouting embeds should be one of the first things users notice about **Antkogg's Bench Boss**.

Do not settle for generic-looking embeds.

They should feel like a premium Discord application.

Optimize for:

* Fast scanning
* Strong hierarchy
* Excellent spacing
* Clear position grouping
* Exact EA Tags
* Obvious vacancies
* Clear game status
* Minimal clutter
* Mobile
* Desktop

A player should understand the state within **2–3 seconds**.

---

# 22. Discord-Native Visual Design

Use:

* Embed author/title
* Description
* Fields
* Inline fields
* Footer
* Timestamp
* Buttons
* Select menus
* Appropriate icons

Do not rely on ugly ASCII tables.

Do not create huge separator lines unless they genuinely improve rendering.

Test what Discord actually renders well.

---

# 23. Central Embed Design System

Create reusable renderers.

For example:

```ts
renderScoutingSession(...)
renderRegistration(...)
renderPlayerProfile(...)
renderManagementPanel(...)
renderSuccess(...)
renderError(...)
```

Centralize:

* Brand colors
* Status colors
* Icons
* Date formatting
* Position formatting
* Open slot formatting
* EA Tag formatting
* Footer
* Button conventions

Do not duplicate embed construction throughout handlers.

---

# 24. ONE_SIDE Embed

Conceptual target:

```text
BENCH BOSS
LG SCOUTING

WEDNESDAY • AUG 19
9:00 PM ET

🏒 LINEUP

FORWARDS

LW    JohnnyHockey
C     Antkogg
RW    OPEN

DEFENSE

LD    PuckMover
RD    OPEN

GOALIE

G     OPEN

3 / 6 CONFIRMED

STILL NEEDED
1 Forward • 1 Defense • 1 Goalie

Signups Open
Choose an eligible position below.
```

This is NOT a literal required layout.

Use Discord fields/components to make the real version better.

---

# 25. EA Tags in Lineups

Always display exact EA Tags.

Do not primarily display Discord usernames.

Example:

```text
LW
`xX Johnny Xx`
```

EA Tag is the useful in-game identity.

---

# 26. Dynamic States

## Empty

```text
0 / 6 Confirmed
```

Show what's needed.

## Partial

```text
4 / 6 Confirmed

Still Needed
1 Defense • 1 Goalie
```

## Full

```text
✓ LINEUP FULL
6 / 6 Confirmed
```

## Locked

```text
🔒 LINEUP LOCKED
```

## In Progress

```text
🏒 SCOUTING IN PROGRESS
```

## Completed

Preserve final lineup and clearly show completion.

## Cancelled

Make cancellation unmistakable and disable interaction components.

---

# 27. Position Buttons

ONE_SIDE:

```text
[ LW ] [ C ] [ RW ]
[ LD ] [ RD ] [ G ]

[ Leave Game ]
```

Filled positions should become unavailable where appropriate.

Keep labels short.

---

# 28. One-Click Signup

A registered player clicks:

```text
C
```

Validate:

1. Registered
2. Correct group
3. Position open
4. Not already assigned elsewhere in session
5. No prohibited schedule conflict
6. Signups open

Then atomically assign them.

After success:

* Persist
* Refresh scouting post
* Refresh buttons
* Ephemeral confirmation
* Automatic confirmation DM

Do not ask:

```text
Are you sure you want C?
```

for normal signup.

---

# 29. Confirmation DM

There is no manual DM system.

Do NOT build:

```text
/dm
/inbox
/dm player
/dm group
```

DMs are automatic scouting notifications.

After signup, send something polished like:

```text
BENCH BOSS

🏒 YOU'RE CONFIRMED

Wednesday, August 19
9:00 PM

POSITION
C

EA TAG
Antkogg

You're confirmed for this scouting game.

We'll remind you before it starts.
```

Use an embed if it looks better.

---

# 30. Automatic DMs

Support:

* Signup confirmation
* Position changed
* Removed from lineup
* Waitlist joined
* Waitlist promotion
* Game reminder
* Lineup locked
* Game cancellation

Do not send unnecessary DMs.

---

# 31. DM Failure

Some users disable DMs.

Failure must not break the underlying operation.

Example:

Signup succeeds.

DM fails.

Player remains signed up.

Ephemeral response can explain:

> You're confirmed, but I couldn't send you a DM. Check the scouting post for updates.

Log the failure.

---

# 32. Position Switching

If already C and they click RW:

```text
You're currently playing C.

Switch to RW?

[ Switch ]
[ Keep C ]
```

On confirmation:

* Revalidate
* Transactionally switch
* Refresh post
* Send position-change DM

---

# 33. Leaving

Button:

```text
[ Leave Game ]
```

Confirmation:

```text
Leave the 9:00 PM scouting game?

[ Leave ]
[ Keep My Spot ]
```

After leaving:

* Remove assignment
* Refresh post
* Process waitlist

---

# 34. Waitlists

Use position-group waitlists:

```text
Forward
Defense
Goalie
```

Do not maintain separate LW/C/RW waitlists.

If all forward positions are full:

```text
Forward spots are full.

[ Join Forward Waitlist ]
```

Store:

* Player
* Session
* Group
* Preferred position
* Queue order
* Joined timestamp

---

# 35. Waitlist Promotion

When a compatible slot opens, notify the appropriate player.

Do not necessarily silently add them if significant time has passed.

A clean acceptance interaction could be:

```text
🏒 A spot opened!

9:00 PM Scouting
RW is available.

[ Take Spot ]
[ Pass ]
```

Use a reasonable expiration.

Then continue to the next waitlisted player if they decline/expire.

---

# 36. Schedule Conflicts

Store expected game duration.

Prevent normal players from registering for overlapping sessions.

Example:

```text
⚠️ Schedule Conflict

You're already confirmed for another scouting game that overlaps this one.
```

Management can override.

---

# 37. PRIVATE_6V6

Use the same premium design system.

Concept:

```text
BENCH BOSS
PRIVATE SCOUTING • 9:00 PM

TEAM 1

LW   Player
C    Player
RW   OPEN
LD   Player
RD   OPEN
G    Player

TEAM 2

LW   Player
C    OPEN
RW   Player
LD   OPEN
RD   Player
G    OPEN

7 / 12 CONFIRMED

STILL NEEDED
2F • 2D • 1G
```

Players select:

```text
LW
C
RW
LD
RD
G
```

The bot assigns an available team slot.

Management can rearrange teams.

---

# 38. Management Controls

Use:

```text
/scout manage
```

Then provide a private interactive control panel.

Include:

```text
Edit Lineup
Add Player
Remove Player
Move Player
Swap Players

View Waitlist
Lock Lineup

Open Signups
Close Signups

Start Scouting
Complete Scouting

Edit Game
Cancel Game
```

Do not create individual slash commands for all of these.

---

# 39. Management Overrides

Management can:

* Add players
* Remove players
* Move players
* Swap players
* Override eligibility
* Override conflicts
* Temporarily overbook
* Start partial sessions
* Reopen signups
* Lock/unlock

Warn for unusual actions.

Audit meaningful overrides.

---

# 40. Availability Mode

Support:

```text
OPEN_SIGNUP
AVAILABILITY
```

OPEN_SIGNUP is the default.

AVAILABILITY allows players to indicate which scouting times they can attend.

Example:

```text
WEDNESDAY SCOUTING

Select every time you're available:

[ 8 PM ]
[ 9 PM ]
[ 10 PM ]
[ 11 PM ]
```

Management can construct lineups from those players.

Keep this secondary.

---

# 41. Player Profile

Command:

```text
/profile
```

Example:

```text
BENCH BOSS PROFILE

EA TAG
Antkogg

LG
Antkogg

POSITION
C

ELIGIBLE
LW • C • RW

UPCOMING
9:00 PM • C
```

Possible controls:

```text
[ Update EA Tag ]
[ View Scouting ]
```

Do not expose management data.

---

# 42. Scouting Browser

Command:

```text
/scouting
```

Show upcoming sessions.

Use select menus/pagination if needed.

Do not create enormous embeds containing every session.

Make it easy to reach the actual signup message.

---

# 43. Management Player View

Command:

```text
/player
```

Search by:

* EA Tag
* LG username
* Discord member

Example:

```text
PLAYER

EA TAG
Antkogg

LG
Antkogg • C

ELIGIBLE
LW • C • RW

SCOUTING
5 Played

ATTENDANCE
5 / 5

STATUS
Shortlist

[ History ]
[ Notes ]
[ Evaluate ]
[ Status ]
[ Edit ]
```

---

# 44. Attendance

Track:

```text
PLAYED
NO_SHOW
EXCUSED
CANCELLED
```

Attendance is management information.

Do not automatically punish players.

Make post-game attendance fast to record.

---

# 45. Evaluations

Keep evaluations lightweight.

Suggested categories:

```text
Overall
Offense
Defense
Hockey IQ
Puck Movement
Communication
```

Allow private notes.

Players must never see evaluations.

---

# 46. Internal Player Status

Support:

```text
UNSCOUTED
SCOUTED
WATCH
INTERESTED
SHORTLIST
PRIORITY
PASS
```

Management-only.

Never automatically tell players their internal status.

---

# 47. Management Board

Command:

```text
/board
```

Keep it actionable.

Example:

```text
BENCH BOSS
MANAGEMENT

TONIGHT

8:00 PM    4/6
9:00 PM    6/6
10:00 PM   3/6

SCOUTING POOL

54 Players
37 Evaluated
13 Shortlisted

NEEDS ATTENTION

8 PM needs a goalie
10 PM needs two defensemen

[ Scouting ]
[ Players ]
[ Shortlist ]
```

Do not turn it into an analytics dashboard.

---

# 48. Setup

Command:

```text
/setup
```

Configure everything through Discord.

Include:

* Management role
* Registered role
* Forward role
* Defense role
* Goalie role
* Optional position roles
* Scouting channel
* Management channel
* Server timezone
* Default format
* Default duration
* Reminder timing

Persist settings.

---

# 49. Commands

Keep commands small.

## Players

```text
/profile
/scouting
/help
```

## Management

```text
/player
/scout
/board
/setup
/help
```

Potential scouting subcommands:

```text
/scout create
/scout manage
/scout upcoming
```

Most functionality should happen after those commands through Discord components.

---

# 50. Permissions

Centralize permissions.

At minimum:

```text
PLAYER
MANAGEMENT
ADMIN
```

Protect:

* Evaluations
* Notes
* Statuses
* Management actions
* Setup
* Overrides

Do not rely solely on hidden buttons.

Validate permissions server-side.

---

# 51. Concurrency

Handle simultaneous signups correctly.

If one C spot exists and two players click C:

> exactly one succeeds

Use:

* Transactions
* Unique constraints
* Revalidation
* Atomic operations

The database decides.

The losing player gets:

```text
That C spot was just taken.

Try another available position.
```

---

# 52. Persistent Components

Important buttons must survive:

* Restart
* Deployment
* Discord reconnect

Do not depend on temporary collectors.

Use deterministic custom IDs tied safely to persisted entities.

---

# 53. Canonical Renderer

Create one scouting renderer.

Conceptually:

```ts
renderScoutingSession(session)
```

All changes follow:

```text
DATABASE
   ↓
RELOAD STATE
   ↓
RENDER
   ↓
EDIT DISCORD MESSAGE
```

Use this for:

* Signup
* Leave
* Switch
* Waitlist
* Management edits
* Lock
* Start
* Complete
* Cancel

---

# 54. Deleted Message Recovery

Persist:

* Scouting channel ID
* Scouting message ID

If the public scouting message is accidentally deleted, management should be able to regenerate it from database state.

Do not lose the actual scouting lineup.

---

# 55. Timezones

Use Discord timestamps where useful so users see times correctly.

Retain the configured server timezone for management.

Use proper timezone-aware date handling.

---

# 56. Logging

Use structured logging for:

* Registration
* EA Tag changes
* Role sync
* Scouting creation
* Signup
* Leave
* Position switch
* Waitlist
* Management edits
* Overrides
* Lock
* Start
* Complete
* Cancel
* DM success/failure
* Configuration
* Errors

Never log secrets.

---

# 57. Error Handling

Never expose:

* Stack traces
* Database errors
* Tokens
* Internal technical information

Bad:

```text
PrismaClientKnownRequestError
```

Good:

```text
That RW spot was just taken.

Try another available position.
```

---

# 58. Audit Trail

Store meaningful management actions.

Example:

```text
Antkogg moved Player123
C → RW

9:00 PM Scouting
```

Audit:

* Manual additions
* Removals
* Overrides
* Position changes
* Cancellations
* Configuration changes

Do not audit meaningless UI refreshes.

---

# 59. Discord API Limits

Respect:

* Embed limits
* Field limits
* Component limits
* Action rows
* Button limits
* Custom ID limits
* Rate limits

Do not edit messages unnecessarily.

Safely coalesce rapid visual refreshes if beneficial.

---

# 60. Development Seed Data

Provide a development-only way to create fake:

* Forwards
* Defense
* Goalies
* Sessions
* Signups
* Waitlists
* Evaluations

This should make testing Discord embeds easy.

Never accidentally run destructive seed behavior in production.

---

# 61. Tests

Write meaningful tests.

## Eligibility

Test every allowed and denied position-group combination.

## Scouting

Test:

* Signup
* Full position
* Duplicate signup
* Switch
* Leave
* Waitlist
* Promotion
* Conflict
* Override
* Locked lineup
* Closed signup
* Partial start
* Cancellation

## Concurrency

Test two players competing for the final slot.

Only one succeeds.

## Permissions

Test player vs management access.

## Notifications

Test notification generation independently from live Discord.

---

# 62. README

Create a complete README covering:

* What Antkogg's Bench Boss is
* Features
* Architecture
* Requirements
* Discord application setup
* Required permissions/intents
* Environment variables
* PostgreSQL
* Prisma migrations
* Development
* Production
* Command registration
* Testing
* `/setup`
* Troubleshooting
* Project structure

Create:

```text
.env.example
```

Never commit real credentials.

---

# 63. Environment Validation

Validate required values such as:

```text
DISCORD_TOKEN
DISCORD_CLIENT_ID
DATABASE_URL
```

at startup.

Fail clearly if critical configuration is missing.

---

# 64. Security

Never:

* Commit secrets
* Log tokens
* Trust interaction state
* Trust arbitrary IDs
* Allow players to call management services
* Expose evaluations
* Expose private notes

Validate input.

Respect Discord limits.

---

# 65. Explicitly Avoid Unnecessary Features

Do NOT build:

* Website
* Web dashboard
* Web API
* Mobile app
* Music
* XP
* Currency/economy
* Generic moderation
* Memes
* NHL scores
* Trivia
* AI rankings
* Manual DM system
* Player-management chat relay
* Generic Discord utilities
* Microservices

Stay focused.

---

# 66. Build Order

## Phase 1 — Foundation

Build:

* Project
* TypeScript
* Discord client
* Environment validation
* Logging
* PostgreSQL
* Prisma
* Interaction routing
* Permissions
* Error handling
* Tests

Validate.

---

## Phase 2 — Discord Setup

Build:

* Guild configuration
* `/setup`
* Roles
* Channels
* Timezone
* Default format
* Duration
* Reminders

---

## Phase 3 — Players

Build:

* Registration
* Exact EA Tag
* LG username
* LG position
* Groups
* Eligibility
* Role synchronization
* `/profile`

---

## Phase 4 — ONE_SIDE Scouting

Build:

* `/scout create`
* ONE_SIDE
* Premium embed
* Persistent message
* Position buttons
* Signup
* Confirmation DM
* Leave
* Switching
* Partial lineups
* Management controls
* Lock
* Start
* Complete
* Cancel

This should already be usable for a real scouting night.

---

## Phase 5 — Waitlists & Scheduling

Build:

* Waitlists
* Promotion
* Conflict detection
* Duration
* Signup closing
* Overrides

---

## Phase 6 — PRIVATE_6V6

Build:

* Two teams
* 12 slots
* Position capacities
* Team placement
* Moving/swapping
* Premium embed

---

## Phase 7 — Notifications

Complete:

* Confirmation
* Position change
* Removal
* Waitlist
* Promotion
* Reminder
* Lock
* Cancellation
* DM failure handling

---

## Phase 8 — Management

Build:

* `/player`
* Attendance
* Evaluations
* Notes
* Status
* History
* `/board`

---

## Phase 9 — Availability

Build AVAILABILITY mode without complicating normal OPEN_SIGNUP.

---

## Phase 10 — Hardening

Perform:

* Permission audit
* Concurrency testing
* Restart testing
* Persistent interaction testing
* Discord API failure testing
* Database failure handling
* Embed-limit review
* Mobile review
* Desktop review
* Logging review
* Security review
* Documentation review

---

# 67. Quality Gate

After each major phase:

```text
Typecheck
Lint
Test
Build
```

Fix failures before continuing.

---

# 68. End-to-End Simulation

Create fake:

```text
Management

Forward A
Forward B
Forward C

Defense A
Defense B

Goalie A

Extra Forward
```

Simulate:

```text
JOIN
↓
REGISTER
↓
EA TAG
↓
ROLES
↓
CREATE SCOUTING
↓
SIGN UP C
↓
EMBED UPDATE
↓
CONFIRMATION DM
↓
MORE SIGNUPS
↓
POSITION SWITCH
↓
INVALID POSITION ATTEMPT
↓
WAITLIST
↓
PLAYER LEAVES
↓
PROMOTION
↓
REMINDER
↓
LOCK
↓
START PARTIAL/FULL GAME
↓
COMPLETE
↓
ATTENDANCE
↓
EVALUATION
↓
PLAYER HISTORY
```

Then test PRIVATE_6V6.

---

# 69. Dedicated Discord UX Review

Once functionality works, review the bot as an actual Discord user.

For every interaction ask:

* Is this obvious?
* Is this necessary?
* Can this require fewer clicks?
* Is there too much text?
* Is anything confusing?
* Does it work well on mobile?
* Does it work well on desktop?
* Does it feel premium?
* Does it feel purpose-built for CHEL?
* Does it feel like a generic Discord bot?

Fix issues found.

---

# 70. Dedicated Embed Review

Inspect:

```text
ONE_SIDE
0/6
1/6
3/6
5/6
6/6
Locked
In Progress
Completed
Cancelled

PRIVATE_6V6
0/12
Partial
Nearly Full
12/12
Locked
In Progress
Completed
Cancelled

Registration
Profile
Confirmation DM
Reminder
Waitlist
Promotion
Management Player View
Management Board
Errors
Warnings
Success
```

Check:

* Spacing
* Hierarchy
* Mobile wrapping
* Desktop appearance
* Empty space
* Clutter
* Button organization
* Branding
* Readability

The scouting embed is the showcase feature.

Do not accept "good enough."

---

# 71. Final Repository Review

Inspect the entire project for:

* Giant files
* Duplicate logic
* Duplicate embed code
* Hardcoded configuration
* Missing validation
* Permission vulnerabilities
* Race conditions
* Restart issues
* Discord API problems
* Bad mobile layouts
* Inconsistent visual styling
* Dead code
* Unused dependencies
* Debug code
* TODOs
* Missing tests
* Missing documentation
* Secrets
* Needless abstractions
* Code created for hypothetical non-Discord interfaces

Refactor where appropriate.

---

# 72. Definition of Done

The project is complete when:

* It is entirely Discord-based.
* Architecture is modular without being overengineered.
* No giant source file exists.
* Database state persists.
* Guild configuration persists.
* Exact EA Tags work.
* Position groups work.
* Eligibility is enforced.
* Roles synchronize.
* ONE_SIDE scouting works.
* Partial lineups work.
* PRIVATE_6V6 works.
* Persistent scouting posts work.
* Embeds automatically update.
* Embeds look exceptional.
* Mobile UX is excellent.
* Desktop UX is excellent.
* Signup is extremely easy.
* Confirmation DMs work.
* Position switching works.
* Leaving works.
* Waitlists work.
* Promotions work.
* Conflict detection works.
* Management controls work.
* Partial games can start.
* Reminders work.
* DM failures are safe.
* Attendance works.
* Evaluations remain private.
* Notes remain private.
* Management statuses remain private.
* Management board works.
* Permissions are enforced.
* Concurrency is handled.
* Interactions survive restart.
* Deleted scouting messages can be recovered.
* Tests cover critical behavior.
* Typecheck passes.
* Lint passes.
* Tests pass.
* Build passes.
* README is complete.
* `.env.example` exists.
* No secrets are committed.
* No web/dashboard/API code exists without an actual Discord-specific reason.
* No required feature remains a placeholder.

Final validation:

```text
Typecheck: PASS
Lint: PASS
Tests: PASS
Build: PASS
```

---

# 73. Final Instruction

Read this entire file before implementation.

Inspect the repository and then build the project from start to finish.

Do not repeatedly ask for approval for normal technical decisions.

If a value must come from the owner, such as:

* Discord token
* Discord application ID
* Database credentials

make it configurable, document it, and continue with everything else.

Do not stop at scaffolding.

Do not stop after getting the bot online.

Do not stop after implementing commands.

Continue through:

```text
Implementation
→ Testing
→ Discord UX Review
→ Embed Polish
→ Hardening
→ Documentation
→ Final Validation
```

When choosing between more features and simplicity:

> **Choose simplicity.**

When choosing between clever architecture and maintainability:

> **Choose maintainability.**

When choosing between a slash command and a contextual Discord interaction:

> **Prefer the contextual interaction when it creates a better experience.**

When determining application state:

> **The database is authoritative.**

When designing for players:

> **Make it effortless.**

When designing for management:

> **Give them control without clutter.**

When designing scouting embeds:

> **Do not accept good enough.**

There is no future website to compensate for a mediocre Discord interface.

**Discord is the product.**

Make Antkogg's Bench Boss feel like one of the most polished and organized LG scouting systems a player has interacted with.
