# SPRINTRISK

> **An Agentic AI Sprint Operator Platform** — A multi-tenant SaaS that autonomously audits engineering sprint health, operates on behalf of users across GitHub, Jira, and Slack, and provides enterprise-grade security through Auth0 Token Vault.

Built during the Auth0 "Authorized to Act" Hackathon.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     SPRINTRISK Platform                         │
├──────────────────┬──────────────────────────────────────────────┤
│   Next.js 15     │          Fastify Backend (TypeScript)        │
│   Frontend       │  ┌────────────────────────────────────────┐  │
│                  │  │  Agent Orchestrator (7-Phase Loop)      │  │
│  ● Dashboard     │  │  OBSERVE → DIAGNOSE → PLAN → CLASSIFY  │  │
│  ● Approval Inbox│  │  → EXECUTE → VERIFY → LEARN            │  │
│  ● Audit Timeline│  ├────────────────────────────────────────┤  │
│  ● Integrations  │  │  Services                               │  │
│  ● Agent Chat    │  │  ● Policy Engine    ● Approval Service  │  │
│                  │  │  ● Memory Service   ● Audit Logger      │  │
│                  │  │  ● Token Vault      ● Rate Limiter      │  │
│                  │  ├────────────────────────────────────────┤  │
│                  │  │  Integration Adapters                    │  │
│                  │  │  ● GitHub  ● Jira  ● Slack              │  │
└──────────────────┴──┴────────────────────────────────────────┴──┘
                          │                       │
                    ┌─────┴─────┐          ┌──────┴──────┐
                    │ PostgreSQL│          │ Auth0       │
                    │ (RLS)     │          │ Token Vault │
                    └───────────┘          └─────────────┘
```

## Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | Next.js 15, React, Tailwind CSS, shadcn/ui, Framer Motion |
| **Backend** | Node.js, Fastify, TypeScript |
| **AI** | Google Gemini (`gemini-2.0-flash`) |
| **Auth** | Auth0 (OIDC + Token Vault) |
| **Database** | PostgreSQL with Row-Level Security |
| **Integrations** | Jira Cloud, GitHub, Slack |

## Security Posture (Enterprise Ready)

1. **Zero Hardcoded Credentials** — No PATs or long-lived API keys stored anywhere.
2. **Auth0 Token Vault** — All third-party access uses delegated tokens retrieved at runtime.
3. **Strict Scopes** — Minimum necessary permissions per integration.
4. **Multi-Tenant Isolation** — PostgreSQL Row-Level Security per organization.
5. **Human-in-the-Loop** — High-risk actions require explicit human approval.

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
* An Auth0 Tenant with Token Vault enabled
* Google Gemini API Key
* PostgreSQL 16+ (for production)

## Setup Instructions

### 1. Auth0 Configuration
1. Create an application in your Auth0 tenant.
2. Enable Auth0 Organizations for multi-tenancy.
3. Configure Token Vault connections for GitHub, Jira, and Slack.
4. Set up an M2M application for server-to-Auth0 Management API access.

### 2. Environment Variables

**Backend (`/.env`):**
```bash
cp .env.example .env
```

**Frontend (`/frontend/.env.local`):**
```bash
cp frontend/.env.example frontend/.env.local
```

### 3. Database Setup
```bash
# Run the schema migration
psql -d sprintrisk -f src/db/schema.sql
```

### 4. Install Dependencies
```bash
# Backend
npm install

# Frontend
cd frontend && npm install
```

### 5. Run the Application
```bash
# Backend (from root)
npm run dev
# → http://localhost:3001

# Frontend (from /frontend)
npm run dev
# → http://localhost:3000
```

## Project Structure

```
src/
├── agent/           # 🧠 Agent core (loop, planner, classifier, types)
├── services/        # 🔐 Core services (approval, audit, memory, policy, token vault)
├── tools/           # 🔧 Integration adapters (Jira, GitHub, Slack)
├── routes/          # 🌐 API routes (chat, approvals, audit, integrations)
├── plugins/         # Fastify plugins (auth)
├── scheduler/       # ⏰ Cron-based automation
├── db/              # 🗄️ Schema and migrations
└── lib/             # Shared utilities (retry, errors, rate limiter)

frontend/src/
├── app/             # Next.js App Router pages
│   ├── approvals/   # 🆕 Approval Inbox
│   ├── audit-log/   # 🆕 Audit Timeline
│   ├── integrations/# 🆕 Integrations Setup
│   ├── jira/        # Jira Issues
│   ├── github/      # GitHub PRs
│   └── settings/    # Settings
├── components/      # UI components (shadcn/ui, layout, features)
└── lib/             # API client, utilities
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

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Health check (unauthenticated) |
| `POST` | `/chat` | Send message to agent |
| `POST` | `/audit/trigger` | Trigger manual audit |
| `GET` | `/api/approvals` | List approvals |
| `POST` | `/api/approvals/:id/approve` | Approve an action |
| `POST` | `/api/approvals/:id/reject` | Reject an action |
| `GET` | `/api/agent-runs` | List agent run history |
| `GET` | `/api/audit-logs` | Query audit logs |
| `GET` | `/api/integrations/status` | Check integration connectivity |

## License
MIT License.
