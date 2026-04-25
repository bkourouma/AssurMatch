import { expect } from "vitest";
import type { AIModuleConfig } from "../../../src/modules/ai/ai.module";

export function expectZeroModelCalls(module: AIModuleConfig): void {
  expect(module.modelCallCount).toBe(0);
}
