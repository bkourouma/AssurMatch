"use client";

import { FormEvent, useState } from "react";
import { submitSatisfactionSurvey } from "../../lib/public-api";
import { Button } from "../ui/button";
import { Field, fieldControlProps } from "../ui/field";
import { Notice } from "../ui/notice";

/**
 * Spec 054 US5: satisfaction survey. An expired, used or wrong link reads one neutral message,
 * whatever the reason. Labels come from the server page (`Feedback` is not a client namespace).
 */
export interface SatisfactionSurveyFormLabels {
  ratingLegend: string;
  ratings: readonly [string, string, string, string, string];
  ratingRequired: string;
  comment: string;
  commentHint: string;
  flaggedConcern: string;
  flaggedConcernHint: string;
  submit: string;
  sending: string;
  successTitle: string;
  successBody: string;
  unavailableTitle: string;
  unavailableBody: string;
  rateLimited: string;
  error: string;
}

export interface SatisfactionSurveyFormProps {
  publicReference: string;
  token: string;
  labels: SatisfactionSurveyFormLabels;
}

type FormStatus = "idle" | "submitting" | "submitted" | "unavailable" | "rate_limited" | "error";

const COMMENT_MAX = 1000;

export function SatisfactionSurveyForm({ publicReference, token, labels }: SatisfactionSurveyFormProps) {
  const [status, setStatus] = useState<FormStatus>("idle");
  const [ratingError, setRatingError] = useState<string | undefined>(undefined);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const rating = Number(formData.get("rating"));
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      setRatingError(labels.ratingRequired);
      return;
    }
    setRatingError(undefined);
    const comment = String(formData.get("comment") ?? "").trim().slice(0, COMMENT_MAX);
    const flaggedConcern = formData.get("flaggedConcern") === "on";

    setStatus("submitting");
    const result = await submitSatisfactionSurvey(publicReference, token, {
      rating,
      flaggedConcern,
      ...(comment ? { comment } : {})
    });
    setStatus(result);
  }

  if (status === "submitted") {
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
    <form className="am-stack" noValidate onSubmit={handleSubmit} data-form="satisfaction-survey">
      {status === "rate_limited" ? (
        <Notice tone="error" role="alert">
          {labels.rateLimited}
        </Notice>
      ) : null}
      {status === "error" ? (
        <Notice tone="error" role="alert">
          {labels.error}
        </Notice>
      ) : null}
      <fieldset className="am-stack" aria-describedby={ratingError ? "survey-rating-error" : undefined}>
        <legend className="am-field__label">{labels.ratingLegend}</legend>
        {labels.ratings.map((label, index) => (
          <label className="am-checkline" key={label}>
            <input type="radio" name="rating" value={index + 1} required />
            <span>{label}</span>
          </label>
        ))}
        {ratingError ? (
          <p className="am-field__error" id="survey-rating-error" role="alert">
            {ratingError}
          </p>
        ) : null}
      </fieldset>
      <Field id="survey-comment" label={labels.comment} hint={labels.commentHint}>
        <textarea {...fieldControlProps("survey-comment", { hint: labels.commentHint })} name="comment" rows={5} maxLength={COMMENT_MAX} />
      </Field>
      <div>
        <label className="am-checkline" htmlFor="survey-flagged">
          <input id="survey-flagged" name="flaggedConcern" type="checkbox" aria-describedby="survey-flagged-hint" />
          <span>{labels.flaggedConcern}</span>
        </label>
        <p className="am-field__hint" id="survey-flagged-hint">
          {labels.flaggedConcernHint}
        </p>
      </div>
      <div className="am-cluster">
        <Button type="submit" variant="primary" loading={status === "submitting"} disabled={status === "submitting"}>
          {status === "submitting" ? labels.sending : labels.submit}
        </Button>
      </div>
    </form>
  );
}
