import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

import type { ZodTypeAny } from "zod";

export function schemaToJsonSchema(schema: ZodTypeAny, _name: string) {
  const jsonSchema = zodToJsonSchema(schema, {
    $refStrategy: "none",
    target: "openApi3",
  });

  if ("definitions" in jsonSchema) {
    delete jsonSchema.definitions;
  }

  return jsonSchema;
}

export function getObjectShape(schema: ZodTypeAny): Record<string, ZodTypeAny> | null {
  const unwrapped = unwrapSchema(schema);

  if (unwrapped instanceof z.ZodObject) {
    return unwrapped.shape;
  }

  return null;
}

export function unwrapSchema(schema: ZodTypeAny): ZodTypeAny {
  if (schema instanceof z.ZodObject) {
    return schema;
  }

  if (schema instanceof z.ZodEffects) {
    return unwrapSchema(schema.innerType());
  }

  if (schema instanceof z.ZodDefault) {
    return unwrapSchema(schema.removeDefault());
  }

  if (schema instanceof z.ZodOptional || schema instanceof z.ZodNullable) {
    return unwrapSchema(schema.unwrap());
  }

  return schema;
}

export function isBooleanLikeSchema(schema: ZodTypeAny): boolean {
  return unwrapSchema(schema) instanceof z.ZodBoolean;
}

export function isScalarLikeSchema(schema: ZodTypeAny): boolean {
  const unwrapped = unwrapSchema(schema);

  return unwrapped instanceof z.ZodString
    || unwrapped instanceof z.ZodNumber
    || unwrapped instanceof z.ZodBoolean
    || unwrapped instanceof z.ZodEnum
    || unwrapped instanceof z.ZodNativeEnum
    || unwrapped instanceof z.ZodLiteral
    || unwrapped instanceof z.ZodDate;
}

export function defaultHttpMethod(schema: ZodTypeAny): "GET" | "POST" {
  const shape = getObjectShape(schema);
  if (!shape) {
    return "POST";
  }

  const keys = Object.keys(shape);
  if (keys.length === 0) {
    return "GET";
  }

  return keys.every((key) => isScalarLikeSchema(shape[key])) ? "GET" : "POST";
}

export function parseCliFlags(args: string[]): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (let index = 0; index < args.length; index += 1) {
    const raw = args[index];
    if (!raw.startsWith("--")) {
      continue;
    }

    const inlineAssignmentIndex = raw.indexOf("=");
    const hasInlineAssignment = inlineAssignmentIndex !== -1;
    const key = hasInlineAssignment ? raw.slice(2, inlineAssignmentIndex) : raw.slice(2);
    const next = args[index + 1];

    if (hasInlineAssignment) {
      result[key] = raw.slice(inlineAssignmentIndex + 1);
      continue;
    }

    if (!next || next.startsWith("--")) {
      result[key] = true;
      continue;
    }

    result[key] = next;
    index += 1;
  }

  return result;
}

export function queryFromParsedInput(input: Record<string, unknown>): URLSearchParams {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(input)) {
    if (value === undefined || value === null) {
      continue;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        params.append(key, String(item));
      }
      continue;
    }

    params.set(key, String(value));
  }

  return params;
}
