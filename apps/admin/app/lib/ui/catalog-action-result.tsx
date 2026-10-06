import type { AdminWriteBlocker } from "../admin-api";
import { blockerLabel, correctionTarget, scopeFromSection, type CorrectionScope } from "../catalog-messages";
import { Notice } from "./admin-ui";

export interface CatalogActionResultState {
  status: "idle" | "success" | "error";
  message?: string | undefined;
  blockers?: AdminWriteBlocker[] | undefined;
}

/**
 * Spec 050: result of a catalogue or consent action. A refusal by the activation checklist (422
 * `ACTIVATION_BLOCKED`) or by the consent rules (422 `CONSENT_TEXT_INVALID`) lists every failing
 * control with its evidence and, when a screen fixes it, a "Corriger" link.
 */
export function CatalogActionResult({ state, scope }: { state: CatalogActionResultState; scope?: CorrectionScope }) {
  if (state.status === "idle") return null;
  const blockers = state.blockers ?? [];
  return (
    <Notice tone={state.status === "success" ? "success" : "danger"}>
      {state.message ? <p>{state.message}</p> : null}
      {blockers.length > 0 ? <BlockersList blockers={blockers} {...(scope ? { scope } : {})} /> : null}
    </Notice>
  );
}

export function BlockersList({ blockers, scope }: { blockers: AdminWriteBlocker[]; scope?: CorrectionScope }) {
  return (
    <ul className="bo-list" data-catalog-blockers="true" aria-label="Contrôles bloquants">
      {blockers.map((blocker) => {
        const target = blocker.section === "consent_text"
          ? undefined
          : correctionTarget(blocker.control, { ...scope, ...scopeFromSection(blocker.section) });
        return (
          <li key={`${blocker.section}:${blocker.control}`}>
            <strong>{blockerLabel(blocker)}</strong>
            {blocker.evidence ? <> : {blocker.evidence}</> : null}
            {target ? <> — <a href={target.href}>Corriger</a></> : null}
            {target?.note ? <> ({target.note})</> : null}
          </li>
        );
      })}
    </ul>
  );
}
