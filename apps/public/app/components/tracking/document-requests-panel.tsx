"use client";

import { FormEvent, useId, useState } from "react";
import { DOCUMENT_REQUEST_UPLOAD_FILES_MAX, type VisitorDocumentRequest } from "../../../../../packages/shared/contracts/lead-messaging";
import { failureMessage, fillTemplate, formatDateTime, validateAttachments, type MessagingFailure } from "../../lib/messaging-helpers";
import { listVisitorDocumentRequests, uploadRequestedDocuments } from "../../lib/public-api";
import { Badge, type BadgeTone } from "../ui/badge";
import { Button } from "../ui/button";
import { Icon } from "../ui/icons";
import { IconTile } from "../ui/icon-tile";
import { Notice } from "../ui/notice";
import { FilePicker } from "./file-picker";
import type { DocumentRequestLabels } from "./messaging-labels";

/**
 * Spec 062 US3: the documents a broker asked for. The visitor sees each request (label, optional
 * note, indicative due date, status) and, while a request is open and uploads are allowed, sends up
 * to three files (PDF, JPEG or PNG, 5 MB each). The antivirus scan and the final checks happen
 * server-side; a quarantined or invalid file refuses the whole upload. Green is never used: a
 * provided document confirms nothing about the request.
 */
export interface DocumentRequestsPanelProps {
  publicReference: string;
  token: string;
  locale: string;
  /** Global switch of the messaging: off means no upload, the list stays readable. */
  messagingEnabled: boolean;
  items: readonly VisitorDocumentRequest[];
  labels: DocumentRequestLabels;
}

const STATUS_TONES: Record<string, BadgeTone> = { open: "new", fulfilled: "neutral", cancelled: "soon" };

export function DocumentRequestsPanel({ publicReference, token, locale, messagingEnabled, items: initialItems, labels }: DocumentRequestsPanelProps) {
  const [items, setItems] = useState<readonly VisitorDocumentRequest[]>(initialItems);
  const [reloading, setReloading] = useState(false);
  const [reloadFailed, setReloadFailed] = useState(false);
  const [lastUpload, setLastUpload] = useState<{ requestId: string; count: number } | null>(null);

  async function reload() {
    setReloading(true);
    setReloadFailed(false);
    const result = await listVisitorDocumentRequests(publicReference, token);
    setReloading(false);
    if (result.status === "failure") {
      setReloadFailed(true);
      return;
    }
    setItems(result.data.items);
  }

  return (
    <div className="am-stack am-stack--lg am-j-column" data-slot="visitor-document-requests">
      <div className="am-cluster">
        <Button variant="tertiary" size="sm" onClick={() => void reload()} loading={reloading} disabled={reloading} icon={<Icon name="refresh" size={16} />}>
          {labels.refresh}
        </Button>
      </div>
      {reloadFailed ? (
        <Notice tone="error" role="alert">
          {labels.loadError}
        </Notice>
      ) : null}
      <ul className="am-stack am-stack--lg am-msg__requests" aria-label={labels.listLabel}>
        {items.map((item) => (
          <li key={item.id}>
            <DocumentRequestCard
              item={item}
              publicReference={publicReference}
              token={token}
              locale={locale}
              messagingEnabled={messagingEnabled}
              labels={labels}
              uploadedNow={lastUpload?.requestId === item.id ? lastUpload.count : 0}
              onUploaded={(count) => {
                setLastUpload({ requestId: item.id, count });
                void reload();
              }}
              onStale={() => void reload()}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

interface CardProps {
  item: VisitorDocumentRequest;
  publicReference: string;
  token: string;
  locale: string;
  messagingEnabled: boolean;
  labels: DocumentRequestLabels;
  uploadedNow: number;
  onUploaded: (count: number) => void;
  onStale: () => void;
}

/** Refusals after which the request itself has to be re-read (it is no longer open). */
const STALE_FAILURES: readonly MessagingFailure[] = ["not_open", "read_only", "disabled"];

function DocumentRequestCard({ item, publicReference, token, locale, messagingEnabled, labels, uploadedNow, onUploaded, onStale }: CardProps) {
  const baseId = useId();
  const [files, setFiles] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const [failure, setFailure] = useState<MessagingFailure | undefined>(undefined);
  const [fileError, setFileError] = useState<string | undefined>(undefined);

  const due = formatDateTime(locale, item.dueAt, false);
  const created = formatDateTime(locale, item.createdAt, false);
  const fulfilled = formatDateTime(locale, item.fulfilledAt, false);
  const statusLabel = (labels.status as Record<string, string>)[item.status] ?? labels.status.open;
  const canUpload = item.status === "open" && item.canUpload && messagingEnabled;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending) return;
    setFailure(undefined);
    if (files.length === 0) {
      setFileError(labels.noFile);
      return;
    }
    setFileError(undefined);
    if (validateAttachments(files, DOCUMENT_REQUEST_UPLOAD_FILES_MAX).length > 0) return;
    setSending(true);
    const result = await uploadRequestedDocuments(publicReference, item.id, token, files);
    setSending(false);
    if (result.status === "uploaded") {
      setFiles([]);
      onUploaded(result.uploaded);
      return;
    }
    setFailure(result.failure);
    if (STALE_FAILURES.includes(result.failure)) onStale();
  }

  return (
    <article className="am-j-panel am-msg" data-request-id={item.id} data-request-status={item.status}>
      <div className="am-j-panel__head">
        <IconTile name="file-text" size="lg" />
        <div>
          <h3 className="am-j-panel__title">{item.label}</h3>
          <p className="am-j-fineprint">{fillTemplate(labels.requestedBy, { partnerName: item.partnerName })}</p>
        </div>
        <Badge tone={STATUS_TONES[item.status] ?? "neutral"} dot>
          {statusLabel}
        </Badge>
      </div>

      {item.note ? (
        <div>
          <p className="am-j-fineprint">{labels.noteLabel}</p>
          <p className="am-msg__body">{item.note}</p>
        </div>
      ) : null}

      <ul className="am-msg__meta">
        {created ? <li>{fillTemplate(labels.createdAt, { date: created })}</li> : null}
        {due && item.status === "open" ? <li>{fillTemplate(labels.due, { date: due })}</li> : null}
        {fulfilled ? <li>{fillTemplate(labels.fulfilledAt, { date: fulfilled })}</li> : null}
        {item.uploadedCount > 0 ? <li>{item.uploadedCount === 1 ? labels.uploadedOne : fillTemplate(labels.uploadedMany, { count: item.uploadedCount })}</li> : null}
      </ul>

      {uploadedNow > 0 ? (
        <Notice tone="success" role="status">
          {uploadedNow === 1 ? labels.uploadedStatusOne : fillTemplate(labels.uploadedStatusMany, { count: uploadedNow })}
        </Notice>
      ) : null}

      {item.status === "cancelled" ? <p className="am-j-fineprint">{labels.cancelledBody}</p> : null}
      {item.status === "fulfilled" && uploadedNow === 0 ? <p className="am-j-fineprint">{labels.fulfilledBody}</p> : null}
      {item.status === "open" && !canUpload ? (
        <Notice tone="info" role="status">
          {labels.uploadDisabled}
        </Notice>
      ) : null}

      {canUpload ? (
        <form className="am-stack" noValidate onSubmit={handleSubmit} data-form="document-upload" data-request-id={item.id}>
          <h4 className="am-msg__compose-title">{labels.uploadTitle}</h4>
          {failure ? (
            <Notice tone="error" role="alert">
              {failureMessage(labels.errors, failure)}
            </Notice>
          ) : null}
          <FilePicker
            id={`${baseId}-files`}
            files={files}
            max={DOCUMENT_REQUEST_UPLOAD_FILES_MAX}
            disabled={sending}
            error={fileError}
            onChange={(next) => {
              setFiles(next);
              setFileError(undefined);
            }}
            labels={{
              label: labels.fileLabel,
              hint: labels.fileHint,
              selectedFiles: labels.selectedFiles,
              removeFile: labels.removeFile,
              sizeKb: labels.sizeKb,
              sizeMb: labels.sizeMb,
              fileErrors: labels.fileErrors
            }}
          />
          <div className="am-cluster">
            <Button type="submit" variant="primary" loading={sending} disabled={sending} icon={<Icon name="upload" size={18} />}>
              {sending ? labels.submitting : labels.submit}
            </Button>
          </div>
        </form>
      ) : null}
    </article>
  );
}
