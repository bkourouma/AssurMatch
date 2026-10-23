"use client";

import { useTranslations } from "next-intl";
import { useRef, useState, type ChangeEvent } from "react";
import {
  defaultDocumentLabel,
  STAGED_DOCUMENT_LABEL_MAX,
  STAGED_DOCUMENT_MAX_BYTES,
  STAGED_DOCUMENT_MAX_FILES,
  validateStagedFile,
  type StagedFileProblem
} from "../../lib/quote-journey";
import { Button } from "../ui/button";
import { Field, fieldControlProps } from "../ui/field";
import { Icon } from "../ui/icons";
import { Notice } from "../ui/notice";

/** Same document kinds as the tracking page upload (`quote-document-upload.tsx`). */
export const STAGED_DOCUMENT_KINDS = [
  "identity",
  "vehicle_registration",
  "driving_license",
  "proof_of_address",
  "medical_form",
  "existing_policy",
  "other"
] as const;

/** A file picked in the optional documents step. It lives in memory only and is never part of the quote submission. */
export interface StagedDocument {
  id: string;
  file: File;
  kind: string;
  label: string;
}

let stagedCounter = 0;

/**
 * Optional "Documents" step of the quote form (JavaScript only). The visitor picks files and gives
 * each a type and a label; nothing is sent here. The parent uploads them after the request is saved.
 */
export function QuoteDocumentsStep({ documents, onChange }: { documents: StagedDocument[]; onChange: (next: StagedDocument[]) => void }) {
  const t = useTranslations("QuoteForm.documents");
  const kinds = useTranslations("DocumentUpload");
  const inputRef = useRef<HTMLInputElement>(null);
  const [problems, setProblems] = useState<Array<{ name: string; problem: StagedFileProblem }>>([]);

  function pick(event: ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(event.target.files ?? []);
    const next = [...documents];
    const rejected: Array<{ name: string; problem: StagedFileProblem }> = [];
    for (const file of picked) {
      const problem = validateStagedFile(file, next.length);
      if (problem) {
        rejected.push({ name: file.name, problem });
        continue;
      }
      stagedCounter += 1;
      next.push({ id: `doc-${stagedCounter}`, file, kind: "other", label: defaultDocumentLabel(file.name) });
    }
    setProblems(rejected);
    if (next.length !== documents.length) onChange(next);
    // Let the visitor pick the same file again after removing it.
    if (inputRef.current) inputRef.current.value = "";
  }

  function update(id: string, patch: Partial<Pick<StagedDocument, "kind" | "label">>) {
    onChange(documents.map((doc) => (doc.id === id ? { ...doc, ...patch } : doc)));
  }

  function remove(id: string) {
    onChange(documents.filter((doc) => doc.id !== id));
    setProblems([]);
  }

  const full = documents.length >= STAGED_DOCUMENT_MAX_FILES;
  const problemText = (name: string, problem: StagedFileProblem) =>
    problem === "type"
      ? t("errorType", { name })
      : problem === "size"
        ? t("errorSize", { name })
        : problem === "count"
          ? t("errorCount", { name })
          : t("errorEmpty", { name });

  return (
    <div className="am-stack">
      <p className="am-j-panel__lead">{t("intro", { max: STAGED_DOCUMENT_MAX_FILES, size: STAGED_DOCUMENT_MAX_BYTES / (1024 * 1024) })}</p>
      <p className="am-j-fineprint">{t("memory")}</p>

      <Field id="am-quote-documents-file" label={t("pick")}>
        <input
          {...fieldControlProps("am-quote-documents-file", {})}
          ref={inputRef}
          type="file"
          multiple
          accept="application/pdf,image/jpeg,image/png"
          disabled={full}
          onChange={pick}
        />
      </Field>
      {full ? (
        <Notice tone="info" role="status">
          {t("full")}
        </Notice>
      ) : null}
      {problems.length > 0 ? (
        <Notice tone="error" role="alert">
          {problems.map((item) => (
            <span key={`${item.name}-${item.problem}`} style={{ display: "block" }}>
              {problemText(item.name, item.problem)}
            </span>
          ))}
        </Notice>
      ) : null}

      {documents.length > 0 ? (
        <ul className="am-stack" aria-label={t("listLabel")}>
          {documents.map((doc) => (
            <li key={doc.id} className="am-stack">
              <div className="am-j-form__grid">
                <Field id={`am-staged-kind-${doc.id}`} label={`${t("kind")} (${doc.file.name})`}>
                  <select
                    {...fieldControlProps(`am-staged-kind-${doc.id}`, {})}
                    value={doc.kind}
                    onChange={(event) => update(doc.id, { kind: event.target.value })}
                  >
                    {STAGED_DOCUMENT_KINDS.map((value) => (
                      <option key={value} value={value}>
                        {kinds(`kinds.${value}`)}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field id={`am-staged-label-${doc.id}`} label={`${t("label")} (${doc.file.name})`}>
                  <input
                    {...fieldControlProps(`am-staged-label-${doc.id}`, {})}
                    value={doc.label}
                    maxLength={STAGED_DOCUMENT_LABEL_MAX}
                    onChange={(event) => update(doc.id, { label: event.target.value })}
                  />
                </Field>
              </div>
              <div>
                <Button type="button" variant="secondary" onClick={() => remove(doc.id)} icon={<Icon name="x" size={18} />}>
                  {`${t("remove")} ${doc.file.name}`}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
