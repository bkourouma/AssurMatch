"use client";

import { FormEvent, useId, useState } from "react";
import {
  VISITOR_DECLINE_REASONS,
  VISITOR_RESPONSE_CALLBACK_SLOT_MAX,
  VISITOR_RESPONSE_QUESTION_MAX,
  type VisitorDeclineReason,
  type VisitorResponseType
} from "../../../../../packages/shared/contracts/lead-proposals";
import { respondToProposal, type ProposalResponseBody, type ProposalResponseResult } from "../../lib/public-api";
import { Button } from "../ui/button";
import { Field, fieldControlProps } from "../ui/field";
import { Notice } from "../ui/notice";

/**
 * Spec 055 US3 / FR-006: the visitor's follow-up on one broker proposal. Three answers only:
 * interested (optional callback slot), not following up (optional reason from the closed list) or a
 * question (500 characters at most). The answer only tells the named broker how to continue; it
 * never commits the visitor to anything. Labels come from the server page.
 */
export interface ProposalResponseFormLabels {
  legend: string;
  intro: string;
  interested: string;
  declined: string;
  question: string;
  callbackSlot: string;
  callbackSlotHint: string;
  declineReason: string;
  declineReasonNone: string;
  declineReasons: Record<VisitorDeclineReason, string>;
  questionLabel: string;
  questionHint: string;
  questionRequired: string;
  submit: string;
  sending: string;
  recordedTitle: string;
  recorded: Record<VisitorResponseType, string>;
  recordedAt: string;
  notRespondable: string;
  rateLimited: string;
  invalid: string;
  denied: string;
  error: string;
}

export interface ProposalResponseFormProps {
  publicReference: string;
  proposalId: string;
  token: string;
  locale: string;
  labels: ProposalResponseFormLabels;
}

type FailureStatus = Exclude<ProposalResponseResult["status"], "recorded">;

const RESPONSE_TYPES: readonly VisitorResponseType[] = ["interested", "declined", "question"];

export function ProposalResponseForm({ publicReference, proposalId, token, locale, labels }: ProposalResponseFormProps) {
  const baseId = useId();
  const [type, setType] = useState<VisitorResponseType>("interested");
  const [submitting, setSubmitting] = useState(false);
  const [failure, setFailure] = useState<FailureStatus | undefined>(undefined);
  const [questionError, setQuestionError] = useState<string | undefined>(undefined);
  const [recorded, setRecorded] = useState<{ type: VisitorResponseType; at: string } | undefined>(undefined);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const body: ProposalResponseBody = { type };
    if (type === "interested") {
      const callbackSlot = String(formData.get("callbackSlot") ?? "").trim().slice(0, VISITOR_RESPONSE_CALLBACK_SLOT_MAX);
      if (callbackSlot) body.callbackSlot = callbackSlot;
    }
    if (type === "declined") {
      const reason = String(formData.get("declineReason") ?? "");
      if ((VISITOR_DECLINE_REASONS as readonly string[]).includes(reason)) body.declineReason = reason as VisitorDeclineReason;
    }
    if (type === "question") {
      const question = String(formData.get("question") ?? "").trim().slice(0, VISITOR_RESPONSE_QUESTION_MAX);
      if (!question) {
        setQuestionError(labels.questionRequired);
        return;
      }
      body.question = question;
    }
    setQuestionError(undefined);
    setFailure(undefined);
    setSubmitting(true);
    const result = await respondToProposal(publicReference, proposalId, token, body);
    setSubmitting(false);
    if (result.status === "recorded") {
      setRecorded({ type: result.type, at: result.at });
      return;
    }
    setFailure(result.status);
  }

  if (recorded) {
    const date = new Date(recorded.at);
    const at = Number.isNaN(date.getTime()) ? null : new Intl.DateTimeFormat(locale, { dateStyle: "long", timeStyle: "short" }).format(date);
    return (
      <Notice tone="success" title={labels.recordedTitle} role="status">
        {labels.recorded[recorded.type]}
        {at ? (
          <>
            <br />
            {labels.recordedAt.replace("{date}", at)}
          </>
        ) : null}
      </Notice>
    );
  }

  if (failure === "not_respondable") {
    return (
      <Notice tone="info" role="status">
        {labels.notRespondable}
      </Notice>
    );
  }

  const failureMessage =
    failure === "rate_limited" ? labels.rateLimited
      : failure === "invalid" ? labels.invalid
        : failure === "denied" ? labels.denied
          : failure === "error" ? labels.error
            : undefined;
  const typeLabels: Record<VisitorResponseType, string> = { interested: labels.interested, declined: labels.declined, question: labels.question };
  const slotId = `${baseId}-slot`;
  const reasonId = `${baseId}-reason`;
  const questionId = `${baseId}-question`;

  return (
    <form className="am-stack" noValidate onSubmit={handleSubmit} data-form="proposal-response" data-proposal-id={proposalId}>
      {failureMessage ? (
        <Notice tone="error" role="alert">
          {failureMessage}
        </Notice>
      ) : null}
      <fieldset className="am-stack">
        <legend className="am-field__label">{labels.legend}</legend>
        <p className="am-field__hint">{labels.intro}</p>
        {RESPONSE_TYPES.map((value) => (
          <label className="am-checkline" key={value}>
            <input type="radio" name="type" value={value} checked={type === value} onChange={() => setType(value)} />
            <span>{typeLabels[value]}</span>
          </label>
        ))}
      </fieldset>

      {type === "interested" ? (
        <Field id={slotId} label={labels.callbackSlot} hint={labels.callbackSlotHint}>
          <input {...fieldControlProps(slotId, { hint: labels.callbackSlotHint })} name="callbackSlot" type="text" maxLength={VISITOR_RESPONSE_CALLBACK_SLOT_MAX} autoComplete="off" />
        </Field>
      ) : null}

      {type === "declined" ? (
        <Field id={reasonId} label={labels.declineReason}>
          <select {...fieldControlProps(reasonId, {})} name="declineReason" defaultValue="">
            <option value="">{labels.declineReasonNone}</option>
            {VISITOR_DECLINE_REASONS.map((reason) => (
              <option key={reason} value={reason}>
                {labels.declineReasons[reason]}
              </option>
            ))}
          </select>
        </Field>
      ) : null}

      {type === "question" ? (
        <Field id={questionId} label={labels.questionLabel} hint={labels.questionHint} error={questionError} required>
          <textarea
            {...fieldControlProps(questionId, { hint: labels.questionHint, error: questionError })}
            name="question"
            rows={4}
            maxLength={VISITOR_RESPONSE_QUESTION_MAX}
            required
          />
        </Field>
      ) : null}

      <div className="am-cluster">
        <Button type="submit" variant="primary" loading={submitting} disabled={submitting}>
          {submitting ? labels.sending : labels.submit}
        </Button>
      </div>
    </form>
  );
}
