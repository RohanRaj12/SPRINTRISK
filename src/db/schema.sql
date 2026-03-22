-- ============================================================
-- Sprint Guardian — PostgreSQL Schema
-- Multi-tenant, RLS-enabled, production-grade
-- ============================================================

-- ── Extensions ──
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- 1. ORGANIZATIONS (Tenant Boundary)
-- ============================================================
CREATE TABLE organizations (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name          VARCHAR(255) NOT NULL,
  slug          VARCHAR(100) NOT NULL UNIQUE,
  auth0_org_id  VARCHAR(255) UNIQUE,           -- Auth0 Organizations mapping
  plan          VARCHAR(50)  NOT NULL DEFAULT 'free',  -- free | pro | enterprise
  settings      JSONB        NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_organizations_slug ON organizations(slug);
CREATE INDEX idx_organizations_auth0_org ON organizations(auth0_org_id);

-- ============================================================
-- 2. USERS
-- ============================================================
CREATE TABLE users (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  auth0_user_id   VARCHAR(255) NOT NULL UNIQUE, -- e.g. "auth0|abc123" or "github|12345"
  email           VARCHAR(320) NOT NULL,
  display_name    VARCHAR(255),
  avatar_url      TEXT,
  metadata        JSONB        NOT NULL DEFAULT '{}',
  last_login_at   TIMESTAMPTZ,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_users_auth0_id ON users(auth0_user_id);
CREATE INDEX idx_users_email ON users(email);

-- ============================================================
-- 3. MEMBERSHIPS (User ↔ Org M:N with roles)
-- ============================================================
CREATE TABLE memberships (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  org_id     UUID         NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  role       VARCHAR(50)  NOT NULL DEFAULT 'member', -- owner | admin | member | viewer
  joined_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  
  UNIQUE(user_id, org_id)
);

CREATE INDEX idx_memberships_user ON memberships(user_id);
CREATE INDEX idx_memberships_org ON memberships(org_id);

-- ============================================================
-- 4. CONNECTED ACCOUNTS (Auth0 Identity Mapping)
-- ============================================================
-- Tracks WHICH providers a user has linked via Auth0.
-- We NEVER store tokens here — only metadata about the connection.
CREATE TABLE connected_accounts (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider        VARCHAR(50)  NOT NULL, -- 'github' | 'jira' | 'slack'
  provider_user_id VARCHAR(255),          -- e.g. GitHub username or Jira account ID
  connection_name VARCHAR(100) NOT NULL,  -- Auth0 connection name
  display_label   VARCHAR(255),           -- Human-readable label (e.g. "acme.atlassian.net")
  scopes          TEXT[],                 -- Granted scopes
  is_active       BOOLEAN      NOT NULL DEFAULT true,
  linked_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  last_used_at    TIMESTAMPTZ,
  
  UNIQUE(user_id, provider)
);

CREATE INDEX idx_connected_accounts_user ON connected_accounts(user_id);
CREATE INDEX idx_connected_accounts_provider ON connected_accounts(provider);

-- ============================================================
-- 5. AGENT RUNS (Top-level execution records)
-- ============================================================
CREATE TYPE agent_run_status AS ENUM (
  'pending',
  'observing',
  'diagnosing',
  'planning',
  'executing',
  'waiting_approval',
  'verifying',
  'completed',
  'failed',
  'cancelled'
);

CREATE TABLE agent_runs (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id       UUID              NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  triggered_by UUID              NOT NULL REFERENCES users(id),
  status       agent_run_status  NOT NULL DEFAULT 'pending',
  trigger_type VARCHAR(50)       NOT NULL DEFAULT 'manual', -- manual | scheduled | webhook
  
  -- Input/Output
  input_prompt TEXT              NOT NULL,
  final_response TEXT,
  
  -- Execution metadata
  model_used    VARCHAR(100),
  total_steps   INTEGER          NOT NULL DEFAULT 0,
  completed_steps INTEGER        NOT NULL DEFAULT 0,
  total_tokens  INTEGER          NOT NULL DEFAULT 0,
  
  -- Timing
  started_at    TIMESTAMPTZ,
  completed_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
  
  -- Error tracking
  error_message TEXT,
  retry_count   INTEGER          NOT NULL DEFAULT 0
);

CREATE INDEX idx_agent_runs_org ON agent_runs(org_id);
CREATE INDEX idx_agent_runs_user ON agent_runs(triggered_by);
CREATE INDEX idx_agent_runs_status ON agent_runs(status);
CREATE INDEX idx_agent_runs_created ON agent_runs(created_at DESC);

-- ============================================================
-- 6. AGENT STEPS (Individual steps within a run)
-- ============================================================
CREATE TYPE step_phase AS ENUM (
  'observe',
  'diagnose',
  'plan',
  'classify',
  'execute',
  'verify',
  'learn'
);

CREATE TYPE step_status AS ENUM (
  'pending',
  'running',
  'waiting_approval',
  'approved',
  'rejected',
  'completed',
  'failed',
  'skipped'
);

CREATE TYPE step_classification AS ENUM (
  'auto',
  'approval_required'
);

CREATE TABLE agent_steps (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  run_id            UUID                NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
  step_index        INTEGER             NOT NULL, -- Order within the run
  phase             step_phase          NOT NULL,
  status            step_status         NOT NULL DEFAULT 'pending',
  classification    step_classification NOT NULL DEFAULT 'auto',
  
  -- What this step does
  action_type       VARCHAR(100)        NOT NULL, -- e.g. 'jira_query', 'github_pr_comment', 'slack_dm'
  action_description TEXT,
  action_params     JSONB               NOT NULL DEFAULT '{}',
  
  -- Risk assessment
  risk_level        VARCHAR(20)         NOT NULL DEFAULT 'low', -- low | medium | high | critical
  risk_reasoning    TEXT,
  
  -- Results
  result            JSONB,
  error_message     TEXT,
  
  -- Timing
  started_at        TIMESTAMPTZ,
  completed_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ         NOT NULL DEFAULT NOW(),
  
  -- Retry tracking
  retry_count       INTEGER             NOT NULL DEFAULT 0,
  max_retries       INTEGER             NOT NULL DEFAULT 3
);

CREATE INDEX idx_agent_steps_run ON agent_steps(run_id);
CREATE INDEX idx_agent_steps_status ON agent_steps(status);
CREATE INDEX idx_agent_steps_phase ON agent_steps(phase);
CREATE INDEX idx_agent_steps_order ON agent_steps(run_id, step_index);

-- ============================================================
-- 7. APPROVALS (Human-in-the-Loop Queue)
-- ============================================================
CREATE TYPE approval_status AS ENUM (
  'pending',
  'approved',
  'rejected',
  'expired',
  'auto_approved'
);

CREATE TABLE approvals (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id          UUID             NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  step_id         UUID             NOT NULL REFERENCES agent_steps(id) ON DELETE CASCADE,
  run_id          UUID             NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
  
  -- What needs approval
  title           VARCHAR(500)     NOT NULL,
  description     TEXT,
  action_preview  JSONB            NOT NULL, -- Structured preview of what will happen
  risk_level      VARCHAR(20)      NOT NULL DEFAULT 'medium',
  risk_reasoning  TEXT,
  
  -- Status tracking
  status          approval_status  NOT NULL DEFAULT 'pending',
  decided_by      UUID             REFERENCES users(id),
  decided_at      TIMESTAMPTZ,
  decision_note   TEXT,
  
  -- Expiration
  expires_at      TIMESTAMPTZ      NOT NULL DEFAULT (NOW() + INTERVAL '24 hours'),
  
  created_at      TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
  
  UNIQUE(step_id)
);

CREATE INDEX idx_approvals_org ON approvals(org_id);
CREATE INDEX idx_approvals_status ON approvals(status);
CREATE INDEX idx_approvals_run ON approvals(run_id);
CREATE INDEX idx_approvals_pending ON approvals(org_id, status) WHERE status = 'pending';

-- ============================================================
-- 8. AUDIT LOGS (Immutable Trail)
-- ============================================================
CREATE TABLE audit_logs (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id        UUID         NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id       UUID         REFERENCES users(id),
  run_id        UUID         REFERENCES agent_runs(id),
  step_id       UUID         REFERENCES agent_steps(id),
  
  -- What happened
  action        VARCHAR(200) NOT NULL, -- e.g. 'agent.step.executed', 'approval.approved'
  category      VARCHAR(50)  NOT NULL DEFAULT 'agent', -- agent | approval | integration | auth | system
  severity      VARCHAR(20)  NOT NULL DEFAULT 'info',  -- info | warning | error | critical
  
  -- Details
  description   TEXT         NOT NULL,
  metadata      JSONB        NOT NULL DEFAULT '{}', -- Flexible additional data
  
  -- Snapshot (what the state was at this point)
  before_state  JSONB,
  after_state   JSONB,
  
  -- Context
  ip_address    INET,
  user_agent    TEXT,
  
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Audit logs are append-only, heavily indexed for reads
CREATE INDEX idx_audit_logs_org ON audit_logs(org_id);
CREATE INDEX idx_audit_logs_created ON audit_logs(created_at DESC);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_category ON audit_logs(org_id, category);
CREATE INDEX idx_audit_logs_run ON audit_logs(run_id) WHERE run_id IS NOT NULL;
CREATE INDEX idx_audit_logs_user ON audit_logs(user_id) WHERE user_id IS NOT NULL;

-- ============================================================
-- 9. MEMORY STORE (Learning System)
-- ============================================================
CREATE TYPE memory_type AS ENUM (
  'pattern',        -- Learned correlations (e.g. "CI fail + stale = blocked")
  'outcome',        -- What happened when we took action X
  'preference',     -- Org-specific preferences
  'context'         -- Reusable context snippets
);

CREATE TABLE memory_store (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id        UUID         NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  type          memory_type  NOT NULL,
  
  -- Content
  key           VARCHAR(500) NOT NULL,  -- Searchable key/tag
  content       TEXT         NOT NULL,  -- The learned information
  embedding     VECTOR(768),            -- Optional: for semantic search (pgvector)
  
  -- Provenance
  source_run_id UUID         REFERENCES agent_runs(id),
  confidence    REAL         NOT NULL DEFAULT 0.5, -- 0.0 - 1.0
  usage_count   INTEGER      NOT NULL DEFAULT 0,
  
  -- Lifecycle
  last_used_at  TIMESTAMPTZ,
  expires_at    TIMESTAMPTZ,            -- Optional TTL
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_memory_org ON memory_store(org_id);
CREATE INDEX idx_memory_type ON memory_store(org_id, type);
CREATE INDEX idx_memory_key ON memory_store(key);
CREATE INDEX idx_memory_confidence ON memory_store(org_id, confidence DESC);

-- ============================================================
-- ROW-LEVEL SECURITY (Multi-Tenant Isolation)
-- ============================================================

-- Enable RLS on all tenant-scoped tables
ALTER TABLE agent_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE memory_store ENABLE ROW LEVEL SECURITY;

-- Application role
CREATE ROLE app_user;

-- RLS Policies: each table filtered by org_id from session variable
CREATE POLICY tenant_isolation_runs ON agent_runs
  FOR ALL TO app_user
  USING (org_id = current_setting('app.current_org_id')::UUID);

CREATE POLICY tenant_isolation_approvals ON approvals
  FOR ALL TO app_user
  USING (org_id = current_setting('app.current_org_id')::UUID);

CREATE POLICY tenant_isolation_audit ON audit_logs
  FOR ALL TO app_user
  USING (org_id = current_setting('app.current_org_id')::UUID);

CREATE POLICY tenant_isolation_memory ON memory_store
  FOR ALL TO app_user
  USING (org_id = current_setting('app.current_org_id')::UUID);

-- Steps are accessed through their parent run's org
CREATE POLICY tenant_isolation_steps ON agent_steps
  FOR ALL TO app_user
  USING (run_id IN (
    SELECT id FROM agent_runs 
    WHERE org_id = current_setting('app.current_org_id')::UUID
  ));

-- ============================================================
-- UPDATED_AT TRIGGERS
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_organizations_updated
  BEFORE UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_users_updated
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_memory_updated
  BEFORE UPDATE ON memory_store
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
