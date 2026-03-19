# Sprint Guardian

Sprint Guardian is an agentic AI system that audits engineering sprint health, designed for modern development workflows. It integrates deeply with Atlassian Jira, GitHub, and Slack to help your team unblock stalled tickets, review pull requests, and keep sprints on track. 

This project was built during the Auth0 "Authorized to Act" Hackathon, emphasizing robust security through the Auth0 Token Vault.

![Sprint Guardian Dashboard Demo](./frontend/public/sprint_guardian.png) **(Placeholder: add real screenshot here)*

## Architecture

![Architecture Diagram](./frontend/public/architecture.png) **(Placeholder)*

Sprint Guardian consists of a backend orchestrator and a Next.js frontend, driven by a powerful AI agent.

*   **Backend:** Node.js, Fastify, TypeScript
*   **Frontend:** Next.js 15, React, Tailwind CSS, shadcn/ui, Framer Motion
*   **AI:** Google Gemini (via `@google/generative-ai`)
*   **Identity & Security:** Auth0 (OIDC + Token Vault)
*   **Integrations:** Jira Cloud (Atlassian), GitHub, Slack

## Security Posture (Enterprise Ready)

Sprint Guardian follows strict enterprise security best practices:
1.  **Zero Hardcoded Credentials:** No Personal Access Tokens (PATs) or long-lived API keys are stored in the codebase or environment variables for third-party services.
2.  **Auth0 Token Vault Integration:** All third-party interactions (Jira, GitHub, Slack) are authenticated using short-lived, delegated access tokens dynamically retrieved from the Auth0 Token Vault at runtime.
3.  **Strict Scopes:** Application only requests the minimum necessary scopes for third-party services.

## Prerequisites

*   Node.js v20+
*   An Auth0 Tenant
*   Google Gemini API Key
*   Jira Cloud, GitHub, and Slack integrations configured in Auth0 Token Vault

## Setup Instructions

### 1. Auth0 Configuration
1.  Set up an application in your Auth0 tenant.
2.  Enable and configure the "Token Vault" for GitHub, Jira, and Slack.
3.  Ensure your application asks for the appropriate scopes corresponding to these services.

### 2. Environment Variables
Copy the example environment files and fill in the necessary details.

**Backend (`/.env`):**
```bash
cp .env.example .env
```
Ensure you set your Auth0 Domain, Audience, client details, and Gemini API key.

**Frontend (`/frontend/.env.local`):**
```bash
cp frontend/.env.example frontend/.env.local
```
Set the Next.js target URLs and Auth0 client credentials.

### 3. Install Dependencies
Install dependencies for both the backend and frontend.

```bash
# In the root (backend)
npm install

# In the frontend directory
cd frontend
npm install
```

### 4. Running the Application

**Run the Backend:**
```bash
# From the root directory
npm run dev
```
The backend Fastify server will start on `http://localhost:8080`.

**Run the Frontend:**
```bash
# From the frontend directory
npm run dev
```
The Next.js frontend will start on `http://localhost:3000`.

## Features

*   **Sprint Health Feed:** Get a real-time, AI-summarized feed of your sprint's status.
*   **AI Developer Assistant:** Persistent right-hand bot that you can chat with to get specific insights about PRs and Tickets.
*   **Proactive Block Resolution:** Automatically prompts to send Slack DMs to engineers whose tickets are stale or PRs are failing CI.
*   **Direct External Links:** Click directly into the Jira ticket or GitHub PR.

## License
MIT License.
