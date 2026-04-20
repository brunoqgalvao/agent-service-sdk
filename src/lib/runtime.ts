import type { ZodTypeAny } from "zod";

import { ForbiddenError, InvalidOutputError } from "../errors.js";
import type { AuthIdentity, OperationDescriptor } from "../types.js";

export function ensureScopes<TServiceContext>(
  operation: OperationDescriptor<TServiceContext>,
  auth: AuthIdentity,
): void {
  if (operation.scopes.length === 0) {
    return;
  }

  const grantedScopes = new Set(auth?.scopes ?? []);
  const missingScopes = operation.scopes.filter((scope) => !grantedScopes.has(scope));

  if (missingScopes.length > 0) {
    throw new ForbiddenError(
      `Missing required scopes: ${missingScopes.join(", ")}`,
      { missingScopes },
    );
  }
}

export function validateOutput<TOutput>(
  schema: ZodTypeAny | undefined,
  result: TOutput,
): TOutput {
  if (!schema) {
    return result;
  }

  try {
    return schema.parse(result) as TOutput;
  } catch (error) {
    throw new InvalidOutputError("Handler returned data that does not match the declared output schema.", error);
  }
}
