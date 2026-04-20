export class AgentServiceError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = "AgentServiceError";
  }
}

export class UnauthorizedError extends AgentServiceError {
  constructor(message = "Unauthorized") {
    super(401, "unauthorized", message);
  }
}

export class ForbiddenError extends AgentServiceError {
  constructor(message = "Forbidden", details?: unknown) {
    super(403, "forbidden", message, details);
  }
}

export class InvalidRequestError extends AgentServiceError {
  constructor(message = "Invalid request", details?: unknown) {
    super(400, "invalid_request", message, details);
  }
}

export class InvalidOutputError extends AgentServiceError {
  constructor(message = "Invalid service output", details?: unknown) {
    super(500, "invalid_output", message, details);
  }
}
