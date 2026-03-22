/**
 * Sprint Guardian — Custom Error Classes
 *
 * Structured error types for better error handling and logging.
 */

/**
 * Base error for Sprint Guardian with structured metadata.
 */
export class SprintGuardianError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly metadata: Record<string, unknown>;

  constructor(
    message: string,
    code: string,
    statusCode: number = 500,
    metadata: Record<string, unknown> = {}
  ) {
    super(message);
    this.name = "SprintGuardianError";
    this.code = code;
    this.statusCode = statusCode;
    this.metadata = metadata;
  }
}

/**
 * Authentication/authorization errors.
 */
export class AuthError extends SprintGuardianError {
  constructor(message: string, metadata?: Record<string, unknown>) {
    super(message, "AUTH_ERROR", 401, metadata);
    this.name = "AuthError";
  }
}

/**
 * Token Vault errors (token not found, expired, etc.)
 */
export class TokenVaultError extends SprintGuardianError {
  constructor(
    message: string,
    public readonly provider: string,
    metadata?: Record<string, unknown>
  ) {
    super(message, "TOKEN_VAULT_ERROR", 502, {
      ...metadata,
      provider,
    });
    this.name = "TokenVaultError";
  }
}

/**
 * External API errors (GitHub, Jira, Slack).
 */
export class IntegrationError extends SprintGuardianError {
  constructor(
    message: string,
    public readonly provider: string,
    public readonly httpStatus?: number,
    metadata?: Record<string, unknown>
  ) {
    super(message, "INTEGRATION_ERROR", 502, {
      ...metadata,
      provider,
      externalHttpStatus: httpStatus,
    });
    this.name = "IntegrationError";
  }
}

/**
 * Agent execution errors.
 */
export class AgentError extends SprintGuardianError {
  constructor(
    message: string,
    public readonly phase: string,
    metadata?: Record<string, unknown>
  ) {
    super(message, "AGENT_ERROR", 500, {
      ...metadata,
      phase,
    });
    this.name = "AgentError";
  }
}

/**
 * Approval-related errors.
 */
export class ApprovalError extends SprintGuardianError {
  constructor(message: string, metadata?: Record<string, unknown>) {
    super(message, "APPROVAL_ERROR", 400, metadata);
    this.name = "ApprovalError";
  }
}

/**
 * Rate limit errors from external services.
 */
export class RateLimitError extends SprintGuardianError {
  constructor(
    public readonly provider: string,
    public readonly retryAfterMs?: number,
    metadata?: Record<string, unknown>
  ) {
    super(
      `Rate limited by ${provider}${
        retryAfterMs ? `. Retry after ${Math.ceil(retryAfterMs / 1000)}s` : ""
      }`,
      "RATE_LIMIT_ERROR",
      429,
      { ...metadata, provider, retryAfterMs }
    );
    this.name = "RateLimitError";
  }
}

/**
 * Validation errors for bad input.
 */
export class ValidationError extends SprintGuardianError {
  constructor(
    message: string,
    public readonly field?: string,
    metadata?: Record<string, unknown>
  ) {
    super(message, "VALIDATION_ERROR", 400, {
      ...metadata,
      field,
    });
    this.name = "ValidationError";
  }
}
