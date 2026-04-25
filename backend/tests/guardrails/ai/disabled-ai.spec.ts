import { describe, expect, it } from "vitest";
import { AuditLogWriter } from "../../../src/modules/audit-logs/audit-log-writer.service";
import { AIService } from "../../../src/modules/ai/ai.module";
import { expectZeroModelCalls } from "../helpers/ai-call-assertions";
import { superAdminActor } from "../../integration/helpers/enterprise-seed";

describe("disabled AI guardrail", () => {
  it("does not make model calls when AI module is disabled", () => {
    const ai = new AIService(new AuditLogWriter());
    const module = ai.register({ key: "lead_scoring", status: "disabled" }, superAdminActor);

    expect(() => ai.invoke(module.id)).toThrow("AI disabled");
    expectZeroModelCalls(module);
  });
});
