export interface NodErrorInfo {
  status?: number;
  /** Extra detail from the server, such as validation issues. */
  details?: unknown;
}

/** Base class for everything this SDK throws. */
export class NodError extends Error {
  readonly status?: number;
  readonly details?: unknown;
  constructor(message: string, info: NodErrorInfo = {}) {
    super(message);
    this.name = "NodError";
    this.status = info.status;
    this.details = info.details;
  }
}

/** The agent key was missing, wrong, revoked or rotated. Pair again or use the new key. */
export class NodAuthError extends NodError {
  constructor(message: string, info: NodErrorInfo = {}) {
    super(message, info);
    this.name = "NodAuthError";
  }
}

/** Too many requests. `retryAfterSeconds` says how long to wait. */
export class NodRateLimitError extends NodError {
  readonly retryAfterSeconds: number;
  constructor(message: string, retryAfterSeconds: number, info: NodErrorInfo = {}) {
    super(message, info);
    this.name = "NodRateLimitError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/** The request or the wait for a decision took too long. */
export class NodTimeoutError extends NodError {
  constructor(message: string) {
    super(message);
    this.name = "NodTimeoutError";
  }
}

/** The server could not be reached at all. */
export class NodNetworkError extends NodError {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = "NodNetworkError";
  }
}
