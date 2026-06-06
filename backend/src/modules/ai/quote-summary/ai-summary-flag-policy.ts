import type { AIModuleConfig } from "../ai.module";

export interface AISummaryFlagInput {
  globalFlags?: Partial<Record<string, boolean>>;
  countryFlags?: Partial<Record<string, boolean>>;
  productFlags?: Partial<Record<string, boolean>>;
  moduleConfig?: AIModuleConfig;
}

export class AISummaryFlagPolicy {
  canRun(input: AISummaryFlagInput): boolean {
    return input.globalFlags?.ai_summary_enabled === true &&
      input.countryFlags?.country_ai_enabled === true &&
      input.productFlags?.product_ai_form_assistant_enabled === true &&
      input.moduleConfig?.status === "enabled" &&
      input.moduleConfig.guardrailStatus === "approved";
  }
}
