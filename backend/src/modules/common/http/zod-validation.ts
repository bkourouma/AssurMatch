import { BadRequestException } from "@nestjs/common";
import type { ZodType } from "zod";

export function parseHttpInput<T>(schema: ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new BadRequestException({
      message: "Validation failed",
      issues: result.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message
      }))
    });
  }
  return result.data;
}
