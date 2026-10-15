"use client";

import { FormEvent, useId, useRef, useState } from "react";
import { LEAD_MESSAGE_ATTACHMENTS_MAX, LEAD_MESSAGE_BODY_MAX, type LeadMessageView } from "../../../../../packages/shared/contracts/lead-messaging";
import { failureMessage, fillTemplate, newClientRequestId, validateAttachments, type MessagingFailure } from "../../lib/messaging-helpers";
import type { MessagingLabels } from "./messaging-labels";
import { sendVisitorMessage } from "../../lib/public-api";
import { Button } from "../ui/button";
import { Field, fieldControlProps } from "../ui/field";
import { Icon } from "../ui/icons";
import { Notice } from "../ui/notice";
import { FilePicker } from "./file-picker";

/**
 * Spec 062 US2: the visitor's message form inside one conversation. Plain text of 2000 characters at
 * most, up to three attachments, a hidden honeypot (`website`) and a `clientRequestId` that stays the
 * same while the visitor retries the same message, so a retry after a network failure never posts
 * the message twice. The API decides: every refusal is worded from the catalogue.
 */
export interface MessageComposeFormProps {
  publicReference: string;
  conversationId: string;
  token: string;
  labels: MessagingLabels;
  /** Called with the stored message (or null when the API only answered with a success). */
  onSent: (message: LeadMessageView | null) => void;
  /** Called when the API says the conversation can no longer be written to. */
  onBlocked: (failure: MessagingFailure) => void;
}

/** Refusals after which the conversation itself has to be re-read (it is no longer writable). */
const BLOCKING_FAILURES: readonly MessagingFailure[] = ["read_only", "disabled", "denied", "thread_limit"];

export function MessageComposeForm({ publicReference, conversationId, token, labels, onSent, onBlocked }: MessageComposeFormProps) {
  const baseId = useId();
  const bodyId = `${baseId}-body`;
  const filesId = `${baseId}-files`;
  const trapId = `${baseId}-website`;
  const counterId = `${baseId}-counter`;
  const formRef = useRef<HTMLFormElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  // Same key while the same message is retried; a new key as soon as the message changes.
  const requestId = useRef<string | null>(null);

  const [body, setBody] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const [failure, setFailure] = useState<MessagingFailure | undefined>(undefined);
  const [bodyError, setBodyError] = useState<string | undefined>(undefined);
  const [sent, setSent] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending) return;
    const text = body.trim();
    setSent(false);
    setFailure(undefined);
    if (!text) {
      setBodyError(labels.bodyRequired);
      bodyRef.current?.focus();
      return;
    }
    if (text.length > LEAD_MESSAGE_BODY_MAX) {
      setBodyError(fillTemplate(labels.bodyTooLong, { max: LEAD_MESSAGE_BODY_MAX }));
      bodyRef.current?.focus();
      return;
    }
    setBodyError(undefined);
    if (validateAttachments(files, LEAD_MESSAGE_ATTACHMENTS_MAX).length > 0) return;

    requestId.current ??= newClientRequestId();
    const website = String(new FormData(event.currentTarget).get("website") ?? "");
    setSending(true);
    const result = await sendVisitorMessage(publicReference, conversationId, token, {
      body: text,
      files,
      clientRequestId: requestId.current,
      website
    });
    setSending(false);

    if (result.status === "sent") {
      requestId.current = null;
      setBody("");
      setFiles([]);
      setSent(true);
      onSent(result.message);
      bodyRef.current?.focus();
      return;
    }
    setFailure(result.failure);
    if (BLOCKING_FAILURES.includes(result.failure)) onBlocked(result.failure);
  }

  return (
    <form ref={formRef} className="am-stack am-msg__compose" noValidate onSubmit={handleSubmit} data-form="visitor-message" data-conversation-id={conversationId}>
      <h4 className="am-msg__compose-title">{labels.composeTitle}</h4>
      {failure ? (
        <Notice tone="error" role="alert">
          {failureMessage(labels.errors, failure)}
        </Notice>
      ) : null}
      {sent ? (
        <Notice tone="success" role="status">
          {labels.sent}
        </Notice>
      ) : null}

      <Field id={bodyId} label={labels.composeLabel} hint={labels.composeHint} error={bodyError} required>
        <textarea
          {...fieldControlProps(bodyId, { hint: labels.composeHint, error: bodyError, required: true })}
          ref={bodyRef}
          name="body"
          rows={4}
          maxLength={LEAD_MESSAGE_BODY_MAX}
          value={body}
          disabled={sending}
          aria-describedby={`${bodyId}-hint ${counterId}${bodyError ? ` ${bodyId}-error` : ""}`}
          onChange={(event) => {
            setBody(event.target.value);
            requestId.current = null;
            if (bodyError) setBodyError(undefined);
          }}
        />
      </Field>
      <p className="am-msg__counter" id={counterId}>
        {fillTemplate(labels.counter, { count: body.length, max: LEAD_MESSAGE_BODY_MAX })}
      </p>

      <FilePicker
        id={filesId}
        files={files}
        max={LEAD_MESSAGE_ATTACHMENTS_MAX}
        disabled={sending}
        onChange={(next) => {
          setFiles(next);
          requestId.current = null;
        }}
        labels={{
          label: labels.attachLabel,
          hint: labels.attachHint,
          selectedFiles: labels.selectedFiles,
          removeFile: labels.removeFile,
          sizeKb: labels.sizeKb,
          sizeMb: labels.sizeMb,
          fileErrors: labels.fileErrors
        }}
      />

      {/* Honeypot: hidden from people and assistive technology, filled by bots only. */}
      <div className="am-msg__trap" aria-hidden="true">
        <label htmlFor={trapId}>{labels.honeypotLabel}</label>
        <input id={trapId} name="website" type="text" tabIndex={-1} autoComplete="off" defaultValue="" />
      </div>

      <div className="am-cluster">
        <Button type="submit" variant="primary" loading={sending} disabled={sending} icon={<Icon name="send" size={18} />}>
          {sending ? labels.sending : labels.send}
        </Button>
      </div>
    </form>
  );
}
