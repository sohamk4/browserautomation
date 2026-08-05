# AI Browser Automation — Workflow Recorder

A production-grade browser automation platform built around a **record → store → replay** pipeline.
Record real user interactions inside a Playwright-controlled browser, persist them as
structured workflows in PostgreSQL, then replay them with variable injection and
data extraction. A live Next.js UI connects via WebSocket to stream recorded steps
in real time.

> **This is the first production module** of a broader AI Browser Automation Platform.
> Future modules will add AI-powered selector repair, validation, and intelligent
> workflow synthesis.

---

## Table of Contents

- [Architecture](#architecture)
  - [Repository Layout](#repository-layout)
  - [Clean Architecture](#clean-architecture)
  - [Data Flow](#data-flow)
- [Stack](#stack)
- [Prerequisites](#prerequisites)
- [Setup & Development](#setup--development)
  - [Database](#database-setup)
  - [Running the App](#running-the-app)
- [API Reference](#api-reference)
  - [REST Endpoints](#rest-endpoints)
  - [WebSocket Events](#websocket-events)
  - [Background Queue (BullMQ)](#background-queue-bullmq)
- [Recorded Action Types](#recorded-action-types)
- [Web UI](#web-ui)
- [Environment Variables](#environment-variables)
- [Build & Deploy](#build--deploy)
- [Development Notes](#development-notes)

---

## Architecture

### Repository Layout

```
browserauto/
├── package.json              # Root: pnpm workspace scripts (turbo, prettier, ts)
├── pnpm-workspace.yaml       # Workspace config
├── turbo.json                # Turborepo task pipeline
├── .env                      # Supabase Postgres connection (DATABASE_URL, DIRECT_URL)
├── .gitignore
├──
├── apps/
│   ├── api/                  # NestJS backend (REST + WebSocket + Playwright)
│   │   ├── src/
│   │   │   ├── app.module.ts           # Root module — conditionally imports queue module
│   │   │   ├── main.ts                  # Bootstraps the Nest app + CORS
│   │   │   ├── modules/
│   │   │   │   ├── browser/              # Playwright browser driver (Infrastructure)
│   │   │   │   │   ├── browser.service.ts
│   │   │   │   ├── recorder/             # In-page recorder init script (DOM capture)
│   │   │   │   │   ├── recorder-init-script.ts   # Injected into every page
│   │   │   │   │   ├── recorder-init.ts    # Modular variant
│   │   │   │   │   ├── extraction-popup.ts # Data extraction popup UI
│   │   │   │   │   └── utils.ts          # CSS/XPath selector helpers
│   │   │   │   ├── recorder/             # Recording orchestration (Application)
│   │   │   │   │   ├── recorder.service.ts  # Event→Step mapper, variable detection
│   │   │   │   │   ├── recorder.gateway.ts # WebSocket gateway (live step broadcast)
│   │   │   │   │   └── recorder.controller.ts # REST endpoints (/recorder/*)
│   │   │   │   ├── workflow/             # Workflow persistence + replay (Domain/Infra)
│   │   │   │   │   ├── workflow.repository.ts   # Prisma adapter
│   │   │   │   │   ├── workflow.controller.ts   # REST endpoints (/workflows/*)
│   │   │   │   │   ├── workflow.processor.ts    # BullMQ worker (stub)
│   │   │   │   │   ├── workflow.queue.module.ts # Opt-in BullMQ module
│   │   │   │   │   └── workflow.queue.service.ts
│   │   │   │   ├── replay/              # Replay engine
│   │   │   │   │   ├── replay.service.ts   # Step-by-step replay with element lookup
│   │   │   │   │   └── replay.controller.ts
│   │   │   │   ├── prisma/              # Prisma client wrapper
│   │   │   │   └── shared/
│   │   │   │       ├── logger.ts        # Pino logger (pretty in dev, JSON in prod)
│   │   │   │       └── utils.ts         # delay(), shortId(), toErrorMessage()
│   │   └── package.json
│   │
│   └── web/                   # Next.js frontend (App Router + Tailwind)
│       ├── app/
│       │   ├── layout.tsx        # Root HTML layout + metadata
│       │   ├── page.tsx          # Main page: record/stop + live step feed
│       │   └── globals.css       # Tailwind directives
│       ├── lib/
│       │   └── recorder.ts       # API client (fetch + socket.io wrappers)
│       ├── components/
│       │   └── README.md         # Component structure guidance
│       ├── next.config.js        # transpilePackages: @repo/core
│       ├── package.json
│       └── tailwind.config.ts
│
├── packages/
│   ├── core/                   # Domain types + application ports (shared)
│   │   ├── src/
│   │   │   ├── domain/action.ts          # Zod schemas: ActionType, Step, Workflow, Variable, SelectorSet
│   │   │   ├── application/ports/
│   │   │   │   ├── browser.port.ts       # IBrowserService interface
│   │   │   │   ├── recorder.port.ts      # IRecorderService, IActionMapper, ISelectorGenerator, IVariableDetector
│   │   │   │   └── workflow.port.ts      # IWorkflowRepository, IStepRepository, IVariableRepository
│   │   │   └── index.ts                  # Barrel re-export
│   │   └── package.json + tsconfig.json
│   │
│   └── db/                     # Prisma client + schema
│       ├── prisma/schema.prisma          # Data model: Workflow, Step, Variable, RecordingSession
│       ├── src/index.ts                  # Exports a singleton PrismaClient
│       └── package.json + tsconfig.json
│
└── .claude/                   # Claude-specific config (if present)
```

### Clean Architecture

The project follows **Clean Architecture** (a.k.a. Onion/Hexagonal). Dependencies
point inward:

```
Infrastructure  →  Application  →  Domain
(apps/api/modules)   (@repo/core ports)   (@repo/core types)
```

- **Domain** (`@repo/core`) — Zod-validated types: `Workflow`, `Step`, `Variable`,
  `ActionType`, `SelectorSet`, `BoundingBox`. These are pure data definitions
  shared across all packages.
- **Application ports** (`@repo/core`) — Interfaces that define *what* the domain
  needs without knowing *how*: `IBrowserService`, `IRecorderService`,
  `IWorkflowRepository`, etc.
- **Infrastructure** (`apps/api`) — NestJS modules that *implement* these ports:
  `BrowserService` (Playwright), `WorkflowRepository` (Prisma),
  `RecorderService` (application orchestrator).

### Data Flow

```
User interacts in browser
         │
         ▼
In-page recorder script (injected via addInitScript)
  → captures DOM events → pushes to window.__recorderEvents__[]
         │
         ▼  (polled every 150ms via page.evaluate)
BrowserService (Playwright)
  → drains events → emits BrowserEvent via EventEmitter
         │
         ▼
RecorderService
  → maps BrowserEvent → Step (with selector computation)
  → deduplicates within 500ms
  → detects variables (passwords, emails, URLs, etc.)
  → broadcasts Step via WebSocket gateway → live UI
         │
         ▼  (on /recorder/stop)
WorkflowRepository
  → persists Step[] + Variable[] atomically via Prisma → PostgreSQL
```

Replay flow:

```
POST /replay/:workflowId
  → ReplayService loads workflow from DB
  → launches a fresh Playwright browser
  → for each step → locates element via multi-strategy selectors → executes
  → collects extracted data → returns result
```

---

## Stack

| Layer | Technology |
|---|---|
| **Language** | TypeScript 5 (NodeNext modules) |
| **Package Manager** | pnpm 8.15.0 |
| **Task Runner** | Turborepo |
| **Backend Framework** | NestJS 10 (REST + Socket.IO gateway) |
| **Frontend** | Next.js 14 (App Router), React 18, Tailwind CSS 3 |
| **Browser Automation** | Playwright (Chromium, using Brave browser) |
| **Database** | PostgreSQL (Supabase hosted) |
| **ORM** | Prisma 5 |
| **Validation** | Zod 3 (schemas in `@repo/core`) |
| **Logging** | Pino (pretty in dev, structured JSON in prod) |
| **Job Queue** | BullMQ (opt-in, requires Redis) |
| **UUID** | uuid 9 |

---

## Prerequisites

- **Node.js 22** (or compatible)
- **pnpm 8.15.0+** (`corepack` recommended)
- **Brave Browser** installed at `C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe`
  (the `BrowserService` launches Chromium via Brave's executable path; see [Dev Note](#browser-executable-path-windows))

---

## Setup & Development

### Installation

```bash
git clone <repo>
cd browserauto
pnpm install
```

### Database Setup

The app uses a Supabase-hosted PostgreSQL instance. The connection strings
(`DATABASE_URL` and `DIRECT_URL`) are in `.env` at the project root:

```env
DATABASE_URL="postgresql://...@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true"
DIRECT_URL="postgresql://...@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres"
```

To create a local database and run migrations:

```bash
cd packages/db
pnpm migrate:dev
```

### Running the App

From the repo root, the Turborepo `dev` task starts both the API and web app:

```bash
pnpm dev
```

This runs:
- `turbo dev` → starts `apps/api` (`nest start --watch`) and `apps/web` (`next dev`)

| Service | URL | Description |
|---|---|---|
| **API (REST)** | `http://localhost:3000` | REST endpoints: `/recorder/*`, `/workflows/*`, `/replay/*` |
| **WebSocket** | `ws://localhost:3000` | Socket.IO — emits `step` and `status` events |
| **Web UI** | `http://localhost:3003` | Next.js dev server (default port 3003) |

> **Port note:** The NestJS API defaults to port 3000, and the Next.js dev server
> defaults to port 3003 (`next dev -p 3003` in `apps/web/package.json`). The web
> app connects to the API via `NEXT_PUBLIC_API_URL` (default `http://localhost:3000`).

---

## API Reference

### REST Endpoints

All endpoints are on the **API server** (`http://localhost:3000`).

#### Recorder

| Method | Path | Body | Description |
|---|---|---|---|
| `POST` | `/recorder/start` | — | Launches a Playwright browser (headless=false), starts a recording session, returns `{ sessionId }` |
| `POST` | `/recorder/pause` | — | Pauses recording (events still emitted but not recorded) |
| `POST` | `/recorder/resume` | — | Resumes recording |
| `POST` | `/recorder/stop` | `{ save?: boolean }` | Stops recording, returns the `Workflow` object. If `save` is not `false` (default), persists to DB and returns the saved workflow with `id`. Also closes the browser. |
| `POST` | `/recorder/command` | `{ action: string, ms?: number }` | Fire a command-driven action while recording. Supported actions: `back`, `forward`, `refresh`, `wait`, `screenshot`, `extract`. Returns `{ recorded: boolean, step }`. |

#### Workflows

| Method | Path | Description |
|---|---|---|
| `GET` | `/workflows` | List all workflows (most recent first), with step counts |
| `GET` | `/workflows/:id` | Get a single workflow with its steps and variables |
| `DELETE` | `/workflows/:id` | Delete a workflow |

#### Replay

| Method | Path | Body | Description |
|---|---|---|---|
| `POST` | `/replay/:workflowId` | `{ variables?: Record<string, string>, headless?: boolean, timeout?: number, storageState?: string }` | Replays a saved workflow step-by-step in a fresh browser |

### WebSocket Events

The API runs a Socket.IO gateway on `ws://localhost:3000`.

**Client → Server:**
- `toggleExtraction` — toggles the extraction mode in the browser (opens the
  inspector popup for data extraction)

**Server → Client:**
| Event | Payload | Description |
|---|---|---|
| `step` | `Step` | Emitted live for each recorded step |
| `status` | `'recording' \| 'paused' \| 'stopped'` | Broadcast when recording status changes |
| `error` | string or `{ message: string }` | Error notifications |


When enabled, `POST /recorder/stop` enqueues a `process` job for the saved workflow.
The `WorkflowProcessor` (currently a stub that logs) handles it.

---

## Recorded Action Types

The recorder captures interactions from two sources:

### 1. Automatic (DOM events captured in-page)

Captured by the injected recorder script and drained on a 150ms poll loop:

| Category | Actions |
|---|---|
| **Mouse** | `click`, `dblclick`, `rightclick`, `hover`, `drag`, `drop` |
| **Keyboard / Input** | `keydown`, `keyup`, `type` (input/change events), `select`, `check`, `uncheck` |
| **Files** | `upload` (file input change), `download` (Playwright `page.on('download')`) |
| **Navigation** | `navigate` (URL change via `framenavigated`), `closeTab`, `newTab` |
| **Clipboard** | `copy` |

### 2. Command-driven (fired from the UI while recording)

Triggered via `POST /recorder/command` or the WebSocket:

| Action | Description |
|---|---|
| `back` / `forward` / `refresh` | Navigation commands. Suppresses the automatic `navigate` step for 3 seconds to avoid duplicates. |
| `wait` | Pauses the page for N ms (`{ ms: number }` in the payload) |
| `screenshot` | Captures the viewport as a base64 PNG data-URL on the step |
| `extract` | Records the current text selection as an `extract` step |

### 3. Specialized modes (in-page recorder)

- **Loop Mode** (`Ctrl+Shift+L`): Select a repeating container (e.g. a product list)
  to record a `loop` step that iterates over all matching items during replay.
- **Extraction Mode** (`Ctrl+Shift+E`): Hover and click any element to open a popup
  for configuring data extraction (field name, extraction type, "extract all" for
  lists/tables).

---

## Web UI

The frontend is a Next.js app with a single page (`app/page.tsx`) that provides:

- **Record / Stop** buttons that hit `POST /recorder/start` and `POST /recorder/stop`
- **Live step feed** via Socket.IO — each `step` event appears in a scrollable list
- **Extract** button — toggles extraction mode via WebSocket

The API client utilities live in `lib/recorder.ts`:


### Future UI

As the UI grows, extract presentational components into `apps/web/components/`.
See [`apps/web/components/README.md`](apps/web/components/README.md) for guidance.

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `DATABASE_URL` | — | PostgreSQL connection string (Supabase) |
| `DIRECT_URL` | — | Direct PostgreSQL connection for Prisma migrations |
| `PORT` | `3000` | API server port |
| `BULLMQ_ENABLED` | `false` | Set to `true` to enable the background queue |
| `LOG_LEVEL` | `info` | Pino log level |
| `NEXT_PUBLIC_API_URL` | `http://localhost:3000` | API URL consumed by the Next.js client |

---

## Build & Deploy

### Build everything

```bash
pnpm build    # Runs: turbo build → builds @repo/core, @repo/db, then apps/api and apps/web
```

Output: `apps/api/src/modules/browser/recorder/recorder-init.js` (IIF format,
browser platform).

### Lint & Format

```bash
pnpm lint      # Runs turbo lint across all packages
pnpm format    # Runs prettier --write .
```

---

## Development Notes

### Browser Executable Path (Windows)

The `BrowserService` hardcodes the Brave browser executable path:

```typescript
const bravePath = 'C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe';
```

On non-Windows systems or if you use a different browser, update this in
`apps/api/src/modules/browser/browser.service.ts`. You can use `chromium`
without a custom `executablePath` if you prefer the bundled Chromium:

```typescript
this.browser = await chromium.launch({
  headless,
  // executablePath: bravePath,  // remove this line to use bundled Chromium
});
```

### Storage State (LinkedIn Authentication)

Both `RecorderService.startRecording()` and `ReplayService.replay()` load a
browser storage state file (`./linkedin_state.json` by default). This file
contains an authenticated session (cookies, localStorage) so the browser opens
directly on the logged-in page. Place your Supabase S3 or local storage state
JSON at the expected path before recording or replaying.

### Replay Engine — Selector Strategies

The `ReplayService.findElement()` tries multiple selector strategies per element
in priority order:

1. `dataTestId` → `[data-testid="..."]`
2. `id` → `#...`
3. `css` → raw CSS selector
4. `xpath` → Playwright `xpath=...`
5. `text` → `page.getByText(..., { exact: true })`
6. `role` → `page.getByRole(...)`
7. `placeholder` → `[placeholder="..."]`
8. `name` → `[name="..."]`
9. `className` → `.class-name`
10. `domPath` → CSS fallback

This multi-strategy approach makes replay more resilient to DOM changes than a
single-selector approach.

### Variable Detection

When a user types into a field during recording, the `RecorderService`
inspects the value and classifies it:

| Type | Detection criteria |
|---|---|
| `password` | `inputType === 'password'` |
| `email` | `inputType === 'email'` or value matches email regex |
| `url` | Value starts with `http://` or `https://` |
| `number` | `inputType === 'number'` or value is all digits |
| `search` | `inputType === 'search'` or input type contains "search" |
| `text` | Long mixed-case alphanumeric (≥8 chars with uppercase + digit) or any string ≥4 chars |

Detected variables are stored on the `Workflow` and can be overridden at replay
time via `POST /replay/:workflowId` with a `variables` object. Variable values
in payloads use `{{variableName}}` interpolation syntax (resolved by
`ReplayService.resolveVariables()`).

### Event Filtering

The `RecorderService.handleEvent()` applies several filters:

- **Extraction popup events** are skipped (so clicks inside the popup config
  don't get recorded)
- **`hover`, `keydown`, `keyup`, `mouseover`, `mouseout`** are skipped by default
  (too noisy for most workflows)
- **Duplicate steps** within 500ms with the same action + payload are deduplicated

---

## License

Private — all rights reserved.
