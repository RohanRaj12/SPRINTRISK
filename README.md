# Sprint Guardian (SPRINTRISK)

> **AI-Powered Sprint Risk Intelligence** — An autonomous platform that monitors GitHub, Jira, and Slack in real-time, detects sprint risks before they escalate, and takes corrective actions through reactive AI agents. Auth0 provides the core identity and authorization layer.

Built for the Auth0 "Authorized to Act" Hackathon.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                     Sprint Guardian Platform                         │
├──────────────────┬──────────────────────────────────────────────────┤
│   Next.js 16     │          Fastify Backend (TypeScript, ESM)       │
│   React 19       │  ┌────────────────────────────────────────────┐  │
│   Frontend       │  │  Agent Orchestrator (7-Phase Loop)          │  │
│                  │  │  OBSERVE → DIAGNOSE → PLAN → CLASSIFY       │  │
│  ● Dashboard     │  │  → EXECUTE → VERIFY → LEARN                │  │
│  ● Integrations  │  ├────────────────────────────────────────────┤  │
│  ● Approval Inbox│  │  Reactive Agent (webhook-driven)            │  │
│  ● Audit Timeline│  │  CI failure → Slack alert                   │  │
│  ● Agent Chat    │  │  PR merged → Jira transition                │  │
│                  │  │  Sprint regression → auto-comment            │  │
│                  │  ├────────────────────────────────────────────┤  │
│                  │  │  Services                                    │  │
│                  │  │  ● Policy Engine    ● Approval Service       │  │
│                  │  │  ● Memory Service   ● Audit Logger           │  │
│                  │  │  ● Token Vault      ● Connection Manager     │  │
│                  │  ├────────────────────────────────────────────┤  │
│                  │  │  Live Integration Clients                    │  │
│                  │  │  ● GitHub REST API  ● Jira Cloud API         │  │
│                  │  │  ● Slack Web API    ● Auth0 Management API   │  │
└──────────────────┴──┴────────────────────────────────────────────┴──┘
        │                   │              │                │
   ┌────┴────┐       ┌─────┴─────┐  ┌─────┴──────┐  ┌─────┴──────┐
   │ Auth0   │       │ GitHub    │  │ Slack      │  │ Jira Cloud │
   │ (PKCE + │       │ Webhooks  │  │ Events     │  │ Webhooks   │
   │ M2M)    │       │ + REST    │  │ + Web API  │  │ + REST     │
   └─────────┘       └───────────┘  └────────────┘  └────────────┘
```

## Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | Next.js 16, React 19, Tailwind CSS, shadcn/ui, Framer Motion |
| **Backend** | Node.js, Fastify, TypeScript (ESM) |
| **AI** | Groq (Llama 3, default) or Google Gemini |
| **Auth** | Auth0 by Okta (PKCE + M2M + Token Vault) |
| **Integrations** | GitHub REST API, Jira Cloud REST API, Slack Web API |

## How Auth0 Powers Sprint Guardian

Auth0 is the **core identity and authorization backbone**:

1. **PKCE Authentication** — Frontend uses Auth0's authorization code flow with PKCE for secure login (no client secret exposed).
2. **JWT Verification** — Backend verifies every API request via Auth0 JWKS endpoint. No session cookies, no custom auth.
3. **M2M Credentials** — Server-to-Auth0 Management API calls use client credentials grant for service operations.
4. **Token Vault (Enterprise Path)** — Auth0 can store delegated IdP tokens for GitHub/Jira/Slack, eliminating the need for long-lived PATs.
5. **Connection Manager** — Real-time health checks validate Auth0 connectivity alongside GitHub/Slack/Jira.

## Security Posture

1. **Auth0 JWT on Every Request** — All API endpoints require valid JWT (except webhooks and health checks).
2. **Webhook Signature Verification** — GitHub webhooks verified via HMAC-SHA256; Slack via signing secret.
3. **Strict Scopes** — Minimum necessary permissions per integration.
4. **Human-in-the-Loop** — High-risk agent actions require explicit human approval.
5. **Audit Trail** — Every agent action is logged with full context.

## Agent Loop (7 Phases)

| Phase | Description |
|---|---|
| **OBSERVE** | Aggregate data from Jira, GitHub, Slack |
| **DIAGNOSE** | Identify root causes, not symptoms |
| **PLAN** | Generate multi-step execution plan with LLM |
| **CLASSIFY** | Mark each step as AUTO or APPROVAL_REQUIRED |
| **EXECUTE** | Run steps via integration adapters with Token Vault |
| **VERIFY** | Confirm success, retry on failure, fallback if needed |
| **LEARN** | Store outcomes and patterns for future improvement |

## Prerequisites

* Node.js v20+
* An Auth0 Tenant (free tier works)
* AI API key — Groq (free) or Google Gemini

## Quick Start

### 1. Clone and Install

```bash
# Backend
npm install

# Frontend
cd frontend && npm install
```

### 2. Auth0 Setup (Required)

1. **Create a tenant** at [auth0.com](https://auth0.com)
2. **Create an API** — Set identifier to `https://api.sprint-guardian.com` (or your preferred audience)
3. **Create a SPA Application** — Note the Client ID and Domain for the frontend
4. **Create an M2M Application** — Authorize it for the Auth0 Management API. Note the Client ID and Client Secret for the backend.

### 3. GitHub Setup

1. Go to [github.com/settings/tokens](https://github.com/settings/tokens) and create a Fine-grained PAT
2. Grant scopes: `Contents: read`, `Issues: read+write`, `Pull requests: read+write`, `Checks: read`
3. (Optional) Set up a webhook in your repo pointing to `https://<your-host>/api/webhooks/github` with a secret

### 4. Slack Setup

1. Create a Slack App at [api.slack.com/apps](https://api.slack.com/apps)
2. Add Bot Token Scopes: `chat:write`, `channels:read`, `users:read`, `users:read.email`
3. Install to workspace, copy the **Bot User OAuth Token** (`xoxb-...`)

### 5. Jira Setup

1. Go to [id.atlassian.com/manage-profile/security/api-tokens](https://id.atlassian.com/manage-profile/security/api-tokens)
2. Generate an API token
3. Note your Jira host (e.g., `yourcompany.atlassian.net`) and email

### 6. Environment Variables

**Backend (`/.env`):**
```bash
cp .env.example .env
# Fill in all values — see .env.example for documentation on every variable
```

**Frontend (`/frontend/.env.local`):**
```bash
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_AUTH0_DOMAIN=your-tenant.us.auth0.com
NEXT_PUBLIC_AUTH0_CLIENT_ID=<SPA application client ID>
NEXT_PUBLIC_AUTH0_AUDIENCE=https://api.sprint-guardian.com
NEXT_PUBLIC_AUTH0_REDIRECT_URI=http://localhost:3000
```

### 7. Run

```bash
# Backend (from root)
npm run dev
# → http://localhost:3001

# Frontend (from /frontend)
cd frontend && npm run dev
# → http://localhost:3000
```

### 8. Verify Connections

Visit `http://localhost:3000/integrations` to see real-time connection status for all 4 services. Green = connected, red = error, gray = not configured.

### 9. Webhook URLs (Optional)

For real-time reactive agent behavior, configure these webhook URLs in your services:

| Service | Webhook URL | Notes |
|---|---|---|
| GitHub | `https://<host>/api/webhooks/github` | Set `GITHUB_WEBHOOK_SECRET` for signature verification |
| Slack | `https://<host>/api/webhooks/slack` | Handles URL verification challenge automatically |
| Jira | `https://<host>/api/webhooks/jira` | Configure in Jira → System → Webhooks |

## Project Structure

```
src/
├── agent/
│   ├── orchestrator.ts     # 7-phase pipeline (OBSERVE→DIAGNOSE→PLAN→CLASSIFY→EXECUTE→VERIFY→LEARN)
│   ├── planner.ts          # LLM-powered diagnosis + plan generation
│   ├── classifier.ts       # Risk classification + policy engine gate
│   ├── agent.ts            # Freeform chat agent (tool-calling)
│   └── types.ts            # Full type system for all phases
├── agents/
│   └── reactive-agent.ts   # Autonomous event-driven webhook agent
├── integrations/
│   ├── github-client.ts    # GitHub REST API client (repos, PRs, CI, issues)
│   ├── slack-client.ts     # Slack Web API client (messages, channels, Block Kit)
│   ├── jira-client.ts      # Jira Cloud REST API client (issues, sprints, search)
│   ├── connection-manager.ts # Real-time health checker for all 4 services
│   └── index.ts            # Barrel exports
├── services/
│   ├── token-vault.ts      # Auth0 Token Vault delegated token retrieval
│   ├── approval-service.ts # Human-in-the-loop approval queue
│   ├── audit-logger.ts     # Immutable audit trail
│   ├── memory-service.ts   # Short-term + long-term agent memory
│   └── policy-engine.ts    # Org-level policy rules
├── routes/
│   ├── integrations.ts     # /api/integrations/* (live-status, connect-instructions)
│   ├── webhooks.ts         # /api/webhooks/* (GitHub, Slack, Jira) + /api/agents/*
│   └── ...                 # Dashboard, audit, approvals, settings, chat, events
├── plugins/
│   └── auth.ts             # Auth0 JWT verification (JWKS) with public path bypass
├── config.ts               # Centralized config with direct token + Token Vault support
├── lib/                    # Rate limiter, retry, errors, AI client
└── server.ts               # Fastify server with ConnectionManager boot

frontend/src/
├── app/
│   ├── integrations/       # Real-time integration status dashboard
│   ├── approvals/          # Approval Inbox
│   ├── audit-log/          # Audit Timeline
│   ├── issues/             # Issues & PRs
│   ├── github/             # GitHub PRs
│   ├── jira/               # Jira Issues
│   └── settings/           # Settings
├── components/
│   └── layout/sidebar.tsx  # Navigation with Integrations link
└── lib/
    ├── auth-context.tsx    # Auth0 PKCE login/logout (zero-dependency)
    └── api.ts              # Type-safe API client with token injection
```

## Key Features

* **Sprint Health Feed** — AI-summarized sprint status with actionable insights
* **Approval Inbox** — Card-based UI with risk indicators for human-in-the-loop review
* **Audit Timeline** — Chronological log of every agent action and decision
* **Agent Chat** — Natural language interface to query sprint health
* **Memory System** — Agent learns from past runs to improve future decisions
* **Policy Engine** — Configurable rules for risk classification and guardrails
* **Circuit Breaker** — Resilience patterns for external API failures

## API Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/health` | Public | Health check |
| `GET` | `/api/integrations/live-status` | Public | Real-time connection status for all 4 services |
| `GET` | `/api/integrations/connect-instructions` | JWT | Setup guide for each integration |
| `POST` | `/api/integrations/refresh` | JWT | Force re-check all connections |
| `POST` | `/api/webhooks/github` | Signature | GitHub webhook receiver |
| `POST` | `/api/webhooks/slack` | Signature | Slack webhook + URL verification |
| `POST` | `/api/webhooks/jira` | Public | Jira webhook receiver |
| `GET` | `/api/agents/actions` | Public | Recent reactive agent actions |
| `GET` | `/api/agents/health-check` | Public | Agent system health |
| `POST` | `/chat` | JWT | Send message to AI chat agent |
| `POST` | `/audit/trigger` | JWT | Trigger 7-phase orchestrated audit |
| `GET` | `/api/approvals` | JWT | List pending approvals |
| `POST` | `/api/approvals/:id/approve` | JWT | Approve an agent action |
| `POST` | `/api/approvals/:id/reject` | JWT | Reject an agent action |
| `GET` | `/api/dashboard/*` | JWT | Dashboard data |

## Reactive Agent

The reactive agent processes webhook events autonomously:

| Event | Action |
|---|---|
| GitHub CI failure | Posts Slack alert with failure details and commit link |
| PR merged | Adds label, optionally transitions Jira issue |
| Large PR opened (>500 lines) | Posts review complexity warning to Slack |
| Jira issue regression | Adds comment noting the backward status transition |
| Jira issue stale (>7 days) | Flags for team review |

## Auth0 Token Vault Flow (Enterprise Path)

```
User clicks "Sign in with Auth0" → PKCE redirect → Auth0 login
  → User authenticates with GitHub/Jira/Slack social connection
  → Auth0 stores the IdP token in Token Vault
  → Frontend receives access_token, injects into API calls
  → Backend verifies JWT, extracts user_id
  → Agent calls fetchWithDelegatedToken(userId, "github", url)
    → Backend calls Auth0 Management API: GET /api/v2/users/{userId}
    → Retrieves stored GitHub/Jira/Slack token from Token Vault
    → Makes API call with delegated token (rate-limited)
    → Token is short-lived, never stored on our servers
```

## Security Hardening Applied

- Auth0 JWT verification on all protected endpoints
- CORS locked to `ALLOWED_ORIGINS` env var
- GitHub webhook HMAC-SHA256 signature verification
- Slack request signing secret verification
- All IDs use `crypto.randomUUID()` (not predictable)
- JQL injection prevention with input validation
- Rate limiting on all external API calls
- Body size limit (1MB) on all requests
- Chat message length capped at 10,000 chars
- Internal errors masked from client responses
- Security headers (CSP, HSTS, X-Frame-Options) on frontend

## License
MIT License.
