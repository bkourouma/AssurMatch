"use client";

import { FormEvent, useState } from "react";
import { unsubscribeFromSurveys } from "../../lib/public-api";
import { Button } from "../ui/button";
import { Notice } from "../ui/notice";

/**
 * Spec 061 FR-005: opt-out of the satisfaction survey e-mails. Opening the link changes nothing
 * (mail scanners prefetch links): the visitor confirms with one button. A wrong or forged link reads
 * one neutral message. Labels come from the server page.
 */
export interface UnsubscribeFormLabels {
  confirm: string;
  sending: string;
  successTitle: string;
  successBody: string;
  unavailableTitle: string;
  unavailableBody: string;
  error: string;
}

type FormStatus = "idle" | "submitting" | "unsubscribed" | "unavailable" | "error";

export function UnsubscribeForm({ token, labels }: { token: string; labels: UnsubscribeFormLabels }) {
  const [status, setStatus] = useState<FormStatus>("idle");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("submitting");
    setStatus(await unsubscribeFromSurveys(token));
  }

  if (status === "unsubscribed") {
    return (
      <Notice tone="success" title={labels.successTitle} role="status">
        {labels.successBody}
      </Notice>
    );
  }

  if (status === "unavailable") {
    return (
      <Notice tone="info" title={labels.unavailableTitle} role="status">
        {labels.unavailableBody}
      </Notice>
    );
  }

  return (
    <form className="am-stack" noValidate onSubmit={handleSubmit} data-form="unsubscribe">
      {status === "error" ? (
        <Notice tone="error" role="alert">
          {labels.error}
        </Notice>
      ) : null}
      <div className="am-cluster">
        <Button type="submit" variant="primary" loading={status === "submitting"} disabled={status === "submitting"}>
          {status === "submitting" ? labels.sending : labels.confirm}
        </Button>
      </div>
    </form>
  );
}
