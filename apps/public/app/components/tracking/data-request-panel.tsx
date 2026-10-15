"use client";

import { FormEvent, useId, useRef, useState } from "react";
import {
  DATA_REQUEST_DETAIL_MAX,
  DATA_REQUEST_OPEN_STATUSES,
  DATA_REQUEST_TYPES,
  type DataRequestType,
  type VisitorDataRequest
} from "../../../../../packages/shared/contracts/data-requests";
import { fillTemplate, formatDateTime } from "../../lib/messaging-helpers";
import { createVisitorDataRequest, listVisitorDataRequests } from "../../lib/public-api";
import { Badge, type BadgeTone } from "../ui/badge";
import { Button } from "../ui/button";
import { Field, fieldControlProps } from "../ui/field";
import { Icon } from "../ui/icons";
import { IconTile } from "../ui/icon-tile";
import { Notice } from "../ui/notice";
import type { DataRequestLabels } from "./messaging-labels";

/**
 * Spec 062 US4 (D-10): the visitor's own data requests (access, rectification, erasure). Filing one
 * creates a request with a reference `DR-...` that the compliance team reviews; nothing is ever
 * erased from here, and an erasure is never automatic. The section does not depend on the
 * messaging switch: it is a right of the visitor and works even when messaging is paused.
 */
export interface DataRequestPanelProps {
  publicReference: string;
  token: string;
  locale: string;
  /** Null when the list could not be read: the form still works. */
  items: readonly VisitorDataRequest[] | null;
  labels: DataRequestLabels;
}

const STATUS_TONES: Record<string, BadgeTone> = { received: "new", in_review: "neutral", completed: "neutral", rejected: "soon" };

export function DataRequestPanel({ publicReference, token, locale, items: initialItems, labels }: DataRequestPanelProps) {
  const baseId = useId();
  const detailId = `${baseId}-detail`;
  const trapId = `${baseId}-website`;
  const counterId = `${baseId}-counter`;
  const formRef = useRef<HTMLFormElement>(null);
  const [items, setItems] = useState<readonly VisitorDataRequest[] | null>(initialItems);
  const [type, setType] = useState<DataRequestType | "">("");
  const [detail, setDetail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [typeError, setTypeError] = useState<string | undefined>(undefined);
  const [detailError, setDetailError] = useState<string | undefined>(undefined);
  const [failureText, setFailureText] = useState<string | undefined>(undefined);
  const [createdReference, setCreatedReference] = useState<string | undefined>(undefined);

  const typeLabels = labels.types as Record<DataRequestType, string>;
  const typeHints = labels.typeHints as Record<DataRequestType, string>;
  const statusLabels = labels.status as Record<string, string>;
  const errors = labels.errors as Record<string, string>;

  async function reload() {
    const result = await listVisitorDataRequests(publicReference, token);
    if (result.status === "success") setItems(result.data.items);
  }

  function openReferenceOf(wanted: DataRequestType): string | null {
    const open = (items ?? []).find((item) => item.type === wanted && (DATA_REQUEST_OPEN_STATUSES as readonly string[]).includes(item.status));
    return open?.reference ?? null;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setFailureText(undefined);
    setCreatedReference(undefined);
    if (type === "") {
      setTypeError(labels.typeRequired);
      return;
    }
    setTypeError(undefined);
    if (detail.length > DATA_REQUEST_DETAIL_MAX) {
      setDetailError(fillTemplate(labels.detailTooLong, { max: DATA_REQUEST_DETAIL_MAX }));
      return;
    }
    setDetailError(undefined);

    const website = String(new FormData(event.currentTarget).get("website") ?? "");
    setSubmitting(true);
    const result = await createVisitorDataRequest(publicReference, token, { type, detail, website });
    setSubmitting(false);

    if (result.status === "created") {
      setCreatedReference(result.result.reference);
      setType("");
      setDetail("");
      void reload();
      return;
    }
    if (result.failure === "already_open") {
      const reference = result.existingReference ?? openReferenceOf(type);
      setFailureText(reference ? fillTemplate(errors.already_open ?? "", { reference }) : (errors.already_open_unknown ?? ""));
      void reload();
      return;
    }
    setFailureText(errors[result.failure] ?? errors.error);
  }

  return (
    <div className="am-stack am-stack--xl am-j-column" data-slot="visitor-data-requests">
      <div className="am-j-panel">
        <div className="am-j-panel__head">
          <IconTile name="shield-check" size="lg" />
          <h3 className="am-j-panel__title">{labels.howTitle}</h3>
        </div>
        <ul className="am-j-list">
          {[labels.howReceived, labels.howReview, labels.howDeadline, labels.howErasure].map((line) => (
            <li key={line}>
              <Icon name="info" size={18} />
              <span>{line}</span>
            </li>
          ))}
        </ul>
      </div>

      <form ref={formRef} className="am-stack am-msg__compose" noValidate onSubmit={handleSubmit} data-form="data-request">
        <h3 className="am-j-panel__title">{labels.formTitle}</h3>
        {createdReference ? (
          <Notice tone="success" title={labels.confirmTitle} role="status">
            {fillTemplate(labels.confirmBody, { reference: createdReference })}
          </Notice>
        ) : null}
        {failureText ? (
          <Notice tone="error" role="alert">
            {failureText}
          </Notice>
        ) : null}

        <fieldset className="am-stack" aria-describedby={typeError ? `${baseId}-type-error` : undefined}>
          <legend className="am-field__label">{labels.typeLegend}</legend>
          {DATA_REQUEST_TYPES.map((value) => (
            <label className="am-checkline" key={value}>
              <input type="radio" name="type" value={value} checked={type === value} disabled={submitting} onChange={() => { setType(value); setTypeError(undefined); }} />
              <span>
                <strong>{typeLabels[value]}</strong>
                <span className="am-msg__option-hint">{typeHints[value]}</span>
              </span>
            </label>
          ))}
          {typeError ? (
            <p className="am-field__error" id={`${baseId}-type-error`} role="alert">
              <Icon name="alert" size={16} />
              {typeError}
            </p>
          ) : null}
        </fieldset>

        <Field id={detailId} label={labels.detailLabel} hint={labels.detailHint} error={detailError}>
          <textarea
            {...fieldControlProps(detailId, { hint: labels.detailHint, error: detailError })}
            name="detail"
            rows={4}
            maxLength={DATA_REQUEST_DETAIL_MAX}
            value={detail}
            disabled={submitting}
            aria-describedby={`${detailId}-hint ${counterId}${detailError ? ` ${detailId}-error` : ""}`}
            onChange={(event) => setDetail(event.target.value)}
          />
        </Field>
        <p className="am-msg__counter" id={counterId}>
          {fillTemplate(labels.counter, { count: detail.length, max: DATA_REQUEST_DETAIL_MAX })}
        </p>

        {/* Honeypot: hidden from people and assistive technology, filled by bots only. */}
        <div className="am-msg__trap" aria-hidden="true">
          <label htmlFor={trapId}>{labels.honeypotLabel}</label>
          <input id={trapId} name="website" type="text" tabIndex={-1} autoComplete="off" defaultValue="" />
        </div>

        <div className="am-cluster">
          <Button type="submit" variant="primary" loading={submitting} disabled={submitting} icon={<Icon name="send" size={18} />}>
            {submitting ? labels.submitting : labels.submit}
          </Button>
        </div>
      </form>

      <div className="am-j-panel">
        <div className="am-j-panel__head">
          <IconTile name="list" size="lg" />
          <h3 className="am-j-panel__title">{labels.listTitle}</h3>
        </div>
        {items === null ? (
          <Notice tone="error" role="alert">
            {labels.loadError}
          </Notice>
        ) : items.length === 0 ? (
          <p className="am-j-fineprint">{labels.listEmpty}</p>
        ) : (
          <ul className="am-msg__requests" aria-label={labels.listLabel}>
            {items.map((item) => {
              const created = formatDateTime(locale, item.createdAt, false);
              const due = formatDateTime(locale, item.dueAt, false);
              const closed = formatDateTime(locale, item.closedAt, false);
              return (
                <li className="am-msg__request" key={item.reference} data-request-status={item.status}>
                  <p className="am-msg__request-head">
                    <strong className="am-tabular">{fillTemplate(labels.reference, { reference: item.reference })}</strong>
                    <Badge tone={STATUS_TONES[item.status] ?? "neutral"} dot>
                      {statusLabels[item.status] ?? item.status}
                    </Badge>
                  </p>
                  <p>{typeLabels[item.type] ?? item.type}</p>
                  <ul className="am-msg__meta">
                    {created ? <li>{fillTemplate(labels.createdAt, { date: created })}</li> : null}
                    {due && !closed ? <li>{fillTemplate(labels.dueAt, { date: due })}</li> : null}
                    {closed ? <li>{fillTemplate(labels.closedAt, { date: closed })}</li> : null}
                  </ul>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
