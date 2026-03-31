# SPRINTRISK Demo Video Script (3 Minutes)

## Setup Before Recording
- Backend running (`npm run dev` in root)
- Frontend running (`npm run dev` in frontend/)
- Browser open to http://localhost:3000
- Network tab open in DevTools (to show Token Vault calls)
- Terminal visible showing backend logs

---

## [0:00 - 0:20] HOOK — The Problem

**NARRATION:**
> "Every engineering team tracks sprints across Jira, GitHub, and Slack — but nobody connects the dots. A stale ticket in Jira, a failing CI in GitHub, and a silent developer on Slack are three separate symptoms of one problem: a blocked engineer. Meet SPRINTRISK — an AI agent that securely operates across all three platforms to autonomously diagnose sprint health."

**SCREEN:** Show the Sprint Health dashboard with issue cards visible.

---

## [0:20 - 0:50] Auth0 Login + Token Vault

**NARRATION:**
> "Authentication is the foundation. The user signs in via Auth0 using their GitHub, Jira, and Slack social connections. Auth0 Token Vault securely stores the identity provider tokens — our server never sees or stores any third-party credentials."

**SCREEN:**
1. Click "Sign in with Auth0" in sidebar
2. Auth0 Universal Login page appears
3. Sign in (show the social connection buttons)
4. Redirect back to dashboard — user avatar appears in sidebar
5. **Switch to Network tab** — highlight the `access_token` in the response
6. **Show backend logs** — highlight "Token Vault delegated token retrieved"

**KEY POINT:** "Zero hardcoded API keys. Every token is delegated, short-lived, and fetched at runtime."

---

## [0:50 - 1:30] Trigger the 7-Phase Audit

**NARRATION:**
> "Now let's trigger an autonomous sprint audit. The agent runs a structured 7-phase pipeline — not just random API calls."

**SCREEN:**
1. Click "Run Audit" button on the Correlations page (or use the Agent Panel)
2. **Show backend logs scrolling** — each phase logs clearly:
   - `[OBSERVE] Gathering data from Jira, GitHub, and Slack`
   - `[DIAGNOSE] Root cause: CI failures blocking PR merges`
   - `[PLAN] Generated 3-step plan`
   - `[CLASSIFY] 2 auto, 1 approval required`
   - `[EXECUTE] Step 1 completed, Step 2 completed`
   - `[VERIFY] 2 completed, 1 pending approval`
   - `[LEARN] Stored 3 memory entries`

**NARRATION:**
> "OBSERVE gathers data using Token Vault delegated tokens. DIAGNOSE uses Gemini AI to find the root cause. PLAN creates a multi-step execution plan. CLASSIFY uses our policy engine to tag each step — read-only operations auto-execute, but Slack notifications require human approval."

---

## [1:30 - 2:00] Cross-System Intelligence

**NARRATION:**
> "This is where it gets powerful. The agent doesn't just list symptoms — it connects dots across systems."

**SCREEN:**
1. Navigate to the **Correlations** page
2. Show the correlation cards:
   - "Stale ticket ENG-402 linked to failing CI on PR #114"
   - "Review bottleneck causing cascade delay"
   - "Silent developer pattern detected"
3. **Click to expand** the first card — show the AI Analysis and Suggested Action

**NARRATION:**
> "The agent detected that ENG-402 hasn't moved in 4 days because PR-114 is failing CI, and Alex — the assignee — hasn't been active on Slack. Three separate signals across three platforms, one diagnosis: Alex is blocked."

---

## [2:00 - 2:30] Human-in-the-Loop Approval

**NARRATION:**
> "High-risk actions require human approval. The agent wants to notify the team on Slack, but the policy engine flagged it as medium risk."

**SCREEN:**
1. Navigate to **Approvals** page
2. Show the pending approval card:
   - Title: "Post sprint health warning to #engineering"
   - Risk level: Medium
   - Action preview with parameters
3. Click **Approve** with a note
4. **Show the audit log** entry confirming the approval

**NARRATION:**
> "Every action, every approval, every decision is logged in an immutable audit trail. This is enterprise-grade governance for AI agents."

---

## [2:30 - 3:00] Architecture + Closing

**NARRATION:**
> "Under the hood: a Fastify TypeScript backend, Next.js 15 frontend, Google Gemini AI for reasoning, and Auth0 Token Vault for secure credential delegation. The policy engine evaluates every action against organizational rules. The memory service learns from past runs to improve future decisions."

**SCREEN:** Show the architecture diagram from README (or a slide)

**NARRATION:**
> "SPRINTRISK proves that AI agents can be autonomous AND secure. With Auth0 Token Vault, the agent authenticates like a human — but faster, smarter, and fully auditable. No hardcoded keys. No credential leaks. Just intelligent, governed automation."

**SCREEN:** Show the GitHub repo URL and project name.

> "SPRINTRISK — an Agentic AI Sprint Operator. Built with Auth0 Token Vault."

---

## Recording Tips
- Use OBS or Loom for screen recording
- Record at 1920x1080
- Keep the terminal and browser side-by-side
- Speak at a natural pace — 3 minutes is tight
- Upload to YouTube as unlisted or public
