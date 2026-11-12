import { BadRequestException } from "@nestjs/common";
import { ErrorCodes } from "../../../../packages/shared/contracts/error-codes";
import { QuoteRedisKeys } from "../common/redis/quote-redis-keys";
import type { RedisClientPort } from "../common/redis/redis.module";

/** Lot 4 A-03g: 400 VALIDATION_FAILED (no extra error code allowed in this lot), a neutral message that does not reveal the mechanism (honeypot or session counter). */
function spamRejected(): BadRequestException {
  return new BadRequestException({ code: ErrorCodes.VALIDATION_FAILED, message: "Request could not be processed" });
}

export class PublicAntiSpamService {
  constructor(private readonly redis: RedisClientPort) {}

  async assertClean(input: { sessionId?: string; answers: Record<string, unknown> }): Promise<void> {
    if (typeof input.answers.website === "string" && input.answers.website.trim().length > 0) {
      throw spamRejected();
    }
    if (input.sessionId) {
      const key = QuoteRedisKeys.spamSession(input.sessionId);
      const count = await this.redis.incr(key, 300);
      if (count > 10) throw spamRejected();
    }
  }
}
