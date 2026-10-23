"use client";

import { useRef } from "react";
import { ATTACHMENT_ACCEPT, describeAttachmentIssue, fillTemplate, humanFileSize, validateAttachments, type AttachmentIssueTemplates } from "../../lib/messaging-helpers";
import { Field, fieldControlProps } from "../ui/field";
import { Icon } from "../ui/icons";

/**
 * Spec 062: file selection shared by the message form and the requested-document form. It keeps
 * the chosen files in the parent (controlled), adds new picks to the list, shows each file with a
 * remove button and states the client-side hints (count, size, type). The API stays the authority:
 * the hints only spare a round trip, and the antivirus scan happens server-side.
 */
export interface FilePickerLabels {
  label: string;
  hint: string;
  selectedFiles: string;
  removeFile: string;
  sizeKb: string;
  sizeMb: string;
  fileErrors: AttachmentIssueTemplates;
}

export interface FilePickerProps {
  id: string;
  files: readonly File[];
  onChange: (files: File[]) => void;
  max: number;
  labels: FilePickerLabels;
  disabled?: boolean;
  /** Error to show next to the issues found by the hints (for instance "choose a file"). */
  error?: string | undefined;
}

function sameFile(left: File, right: File): boolean {
  return left.name === right.name && left.size === right.size && left.lastModified === right.lastModified;
}

export function FilePicker({ id, files, onChange, max, labels, disabled, error }: FilePickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const issues = validateAttachments(files, max).map((issue) => describeAttachmentIssue(issue, labels.fileErrors));
  const shownError = [error, ...issues].filter(Boolean).join(" ") || undefined;

  function handlePick(picked: FileList | null) {
    if (!picked || picked.length === 0) return;
    const next = [...files];
    for (const file of Array.from(picked)) {
      if (!next.some((existing) => sameFile(existing, file))) next.push(file);
    }
    onChange(next);
    // The same file can then be picked again after a removal.
    if (inputRef.current) inputRef.current.value = "";
  }

  function remove(index: number) {
    onChange(files.filter((_, position) => position !== index));
    inputRef.current?.focus();
  }

  function sizeLabel(file: File): string {
    const size = humanFileSize(file.size);
    return fillTemplate(size.unit === "kb" ? labels.sizeKb : labels.sizeMb, { value: size.value });
  }

  return (
    <div className="am-stack">
      <Field id={id} label={labels.label} hint={labels.hint} error={shownError}>
        <input
          {...fieldControlProps(id, { hint: labels.hint, error: shownError })}
          ref={inputRef}
          type="file"
          multiple
          accept={ATTACHMENT_ACCEPT}
          disabled={disabled}
          onChange={(event) => handlePick(event.target.files)}
        />
      </Field>
      {files.length > 0 ? (
        <ul className="am-msg__files" aria-label={labels.selectedFiles}>
          {files.map((file, index) => (
            <li className="am-msg__file" key={`${file.name}-${file.size}-${file.lastModified}`}>
              <Icon name="paperclip" size={16} />
              <span className="am-msg__file-name">
                {file.name} <span className="am-msg__muted">({sizeLabel(file)})</span>
              </span>
              <button
                type="button"
                className="am-msg__remove"
                onClick={() => remove(index)}
                disabled={disabled}
                aria-label={fillTemplate(labels.removeFile, { fileName: file.name })}
              >
                <Icon name="x" size={16} />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
