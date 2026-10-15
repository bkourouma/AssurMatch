"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { describeConversationOutcome, formatWordingList, isSuccessOutcome } from "../conversation-vocabulary";
import { Button, Notice } from "./broker-ui";

/**
 * Spec 062: the only client island of the conversation. It exists for one reason: a refused message
 * (forbidden wording, antivirus, read-only conversation...) must NOT lose what the broker typed.
 * A classic form post would answer with a redirect, and the draft (long text, possibly personal
 * data) would have to travel in the URL or be lost. Here the fields stay UNCONTROLLED and
 * server-rendered (passed as `children`); the submit is a `fetch` to the same-origin route handler
 * relay (`Accept: application/json`), the answer is rendered inline, the form is reset only on
 * success and the server components are refreshed.
 *
 * Without JavaScript the form still works as a plain multipart POST: the relay then answers with a
 * 303 back to the page (`?conv=<outcome>`), and the offending expression is shown but the draft is
 * not kept. The session token never reaches this component: the relay adds it server-side.
 */
export interface ConversationFormProps {
  /** Same-origin route handler of the relay (never the API). */
  action: string;
  ariaLabel: string;
  submitLabel: string;
  pendingLabel: string;
  /** Adds a `clientRequestId` (idempotent retry) kept until the send succeeds. */
  idempotent?: boolean;
  children: ReactNode;
}

interface RelayAnswer {
  ok?: boolean;
  outcome?: string;
  wording?: unknown;
  location?: unknown;
}

function newRequestId(): string {
  const random = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  return `req-${random}`.slice(0, 64);
}

function safeLocation(value: unknown): string | undefined {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//") ? value : undefined;
}

export function ConversationForm({ action, ariaLabel, submitLabel, pendingLabel, idempotent = false, children }: ConversationFormProps) {
  const router = useRouter();
  const requestId = useRef("");
  const [pending, setPending] = useState(false);
  const [answer, setAnswer] = useState<{ outcome: string; wording: string[] } | undefined>(undefined);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    if (idempotent) {
      if (!requestId.current) requestId.current = newRequestId();
      data.set("clientRequestId", requestId.current);
    }
    setPending(true);
    setAnswer(undefined);
    try {
      const response = await fetch(action, { method: "POST", body: data, headers: { accept: "application/json" }, credentials: "same-origin" });
      const json = (await response.json()) as RelayAnswer;
      const login = json.outcome === "session_expired" ? safeLocation(json.location) : undefined;
      if (login) {
        window.location.assign(login);
        return;
      }
      const outcome = typeof json.outcome === "string" ? json.outcome : "error";
      const wording = Array.isArray(json.wording) ? json.wording.filter((item): item is string => typeof item === "string") : [];
      if (json.ok === true && isSuccessOutcome(outcome)) {
        form.reset();
        requestId.current = "";
        router.refresh();
      }
      setAnswer({ outcome, wording });
    } catch {
      setAnswer({ outcome: "error", wording: [] });
    } finally {
      setPending(false);
    }
  }

  const described = answer ? describeConversationOutcome(answer.outcome, answer.wording) : undefined;

  return (
    <form action={action} method="post" encType="multipart/form-data" className="bo-form" aria-label={ariaLabel} onSubmit={onSubmit} data-conversation-form="true">
      <div aria-live="polite">
        {described ? (
          <Notice tone={described.tone}>
            {described.message}
            {described.wording.length > 0 ? <> Expression(s) refusée(s) : <strong>{formatWordingList(described.wording)}</strong>.</> : null}
          </Notice>
        ) : null}
      </div>
      {children}
      <Button type="submit" pending={pending} pendingLabel={pendingLabel}>{submitLabel}</Button>
    </form>
  );
}
