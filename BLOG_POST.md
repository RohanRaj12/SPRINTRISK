# How We Built an AI Agent That Securely Operates Across Jira, GitHub, and Slack Using Auth0 Token Vault

## The Problem: AI Agents Need Real Access, Not Hardcoded Keys

When we set out to build SPRINTRISK — an AI-powered sprint health operator — we hit a fundamental security challenge: our agent needs to read Jira tickets, check GitHub CI status, and send Slack notifications *on behalf of real users*. The traditional approach (hardcoded PATs, long-lived API keys stored in `.env` files) is a security nightmare, especially for a multi-tenant SaaS where each organization has different access levels.

## Enter Auth0 Token Vault

Token Vault solved this elegantly. Instead of storing any third-party credentials on our servers, we let Auth0 handle the entire token lifecycle:

1. **User authenticates** via Auth0 with their GitHub/Jira/Slack social connections
2. **Auth0 stores the identity provider tokens** securely in Token Vault
3. **Our agent retrieves short-lived delegated tokens** at runtime via the Management API
4. **Tokens are never persisted** on our infrastructure — they're fetched, used, and discarded

This means our backend literally has zero long-lived third-party credentials. If our server is compromised, there are no GitHub tokens, no Jira secrets, no Slack keys to steal.

## The 7-Phase Agent Architecture

What makes SPRINTRISK unique is how Token Vault integrates into our structured agent pipeline:

- **OBSERVE**: Agent fetches Jira issues and GitHub PRs using delegated tokens from Token Vault
- **DIAGNOSE**: Gemini AI analyzes the data and finds cross-system correlations (e.g., "stale ticket ENG-402 is linked to failing CI on PR #114")
- **CLASSIFY**: Policy engine evaluates each planned action — read operations are auto-approved, but Slack DMs require human approval
- **EXECUTE**: Approved actions execute with rate-limited, Token Vault-backed API calls

The policy engine is the critical guardrail. Even though the agent *can* send Slack messages using the user's delegated token, it *won't* unless a human approves it first. This is enterprise-grade trust.

## Cross-System Intelligence: The "Wow" Moment

The most impressive capability is correlation detection. When the agent observes a stale Jira ticket AND a failing GitHub CI pipeline AND no Slack activity from the assignee, it connects these dots: "Alex hasn't moved ENG-402 in 4 days because PR #114 is failing CI, and Alex hasn't been active on Slack — they may be blocked or out of office."

This cross-system reasoning is only possible because Token Vault gives us secure, scoped access to all three platforms simultaneously.

## Key Takeaways

- **Token Vault eliminates credential storage risk** — no PATs, no long-lived keys
- **Delegated tokens are scoped and short-lived** — minimum privilege by default
- **The agent authenticates like a human** — but faster, smarter, and auditable
- **Every action is logged** — immutable audit trail for compliance

Auth0 Token Vault didn't just solve our security problem — it enabled the entire product concept. Without secure, delegated access to multiple platforms, an autonomous sprint operator simply couldn't exist in production.

---

*Built during the Auth0 "Authorized to Act" Hackathon. SPRINTRISK is open-source and available on GitHub.*
