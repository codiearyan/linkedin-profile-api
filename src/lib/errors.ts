export type ErrorCode =
  | "INVALID_URL"
  | "INVALID_FIELDS"
  | "PROFILE_NOT_FOUND"
  | "RATE_LIMITED"
  | "UPSTREAM_SESSION_EXPIRED"
  | "UPSTREAM_RATE_LIMITED"
  | "UPSTREAM_TIMEOUT"
  | "UPSTREAM_ERROR"
  | "INTERNAL";

//503 -> linkedin cookie expired
export type HttpStatus = 400 | 404 | 429 | 500 | 502 | 503 | 504;

export class ApiError extends Error {
  constructor(
    readonly code: ErrorCode,
    readonly status: HttpStatus,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}
