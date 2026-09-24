"use client";

import { useState } from "react";
import { withdrawQuoteConsent } from "../../lib/public-api";
import { Icon } from "../ui/icons";
import { Notice } from "../ui/notice";

/**
 * Labels come from the server page, already formatted: the `QuoteRequest` namespace is not shipped
 * to the browser by the locale layout, so this boundary only carries the interaction.
 */
export interface ConsentWithdrawalLabels {
  explanation: string;
  confirmToggle: string;
  confirmQuestion: string;
  confirm: string;
  cancel: string;
  submitting: string;
  successTitle: string;
  successDescription: string;
  error: string;
}

export interface ConsentWithdrawalProps {
  publicReference: string;
  token: string;
  labels: ConsentWithdrawalLabels;
}

type WithdrawalState =
  | { status: "idle" }
  | { status: "confirming" }
  | { status: "submitting" }
  | { status: "error"; message: string }
  | { status: "success"; message: string };

/**
 * Consent withdrawal of a quote request (SITE-316 and SITE-317).
 *
 * The confirmation is an explicit second step rendered in the page, never a browser `confirm()`
 * dialog, so it stays readable, translatable and reachable with a keyboard. The buttons are plain
 * elements carrying the `am-button` tokens because the `Button` primitive has no click handler.
 */
export function ConsentWithdrawal({ publicReference, token, labels }: ConsentWithdrawalProps) {
  const [state, setState] = useState<WithdrawalState>({ status: "idle" });

  async function withdraw() {
    setState({ status: "submitting" });
    const result = await withdrawQuoteConsent(publicReference, token);
    if (result.status === "success") {
      setState({ status: "success", message: result.publicMessage });
      return;
    }
    setState({ status: "error", message: result.publicMessage || labels.error });
  }

  if (state.status === "success") {
    return (
      <Notice tone="success" title={labels.successTitle} role="status">
        {labels.successDescription}
      </Notice>
    );
  }

  const confirming = state.status === "confirming" || state.status === "submitting";

  return (
    <div className="am-stack">
      <p className="am-j-panel__lead">{labels.explanation}</p>
      {state.status === "error" ? (
        <Notice tone="error" role="alert">
          {state.message}
        </Notice>
      ) : null}
      {confirming ? (
        <>
          <Notice tone="indicative" role="status">
            <strong>{labels.confirmQuestion}</strong>
          </Notice>
          <div className="am-cluster">
            <button
              className="am-button"
              data-variant="primary"
              type="button"
              onClick={withdraw}
              disabled={state.status === "submitting"}
              data-loading={state.status === "submitting" ? "true" : undefined}
              aria-busy={state.status === "submitting" ? true : undefined}
            >
              <Icon name="check" size={18} />
              <span>{state.status === "submitting" ? labels.submitting : labels.confirm}</span>
            </button>
            <button
              className="am-button"
              data-variant="tertiary"
              type="button"
              onClick={() => setState({ status: "idle" })}
            >
              <span>{labels.cancel}</span>
            </button>
          </div>
        </>
      ) : (
        <div className="am-cluster">
          <button
            className="am-button"
            data-variant="secondary"
            type="button"
            onClick={() => setState({ status: "confirming" })}
          >
            <Icon name="x-circle" size={18} />
            <span>{labels.confirmToggle}</span>
          </button>
        </div>
      )}
    </div>
  );
}
