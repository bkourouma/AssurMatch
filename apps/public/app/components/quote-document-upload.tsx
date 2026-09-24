"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { uploadQuoteDocument, type PublicQuoteDocumentUploadState } from "../lib/public-api";
import { Button } from "./ui/button";
import { Field, fieldControlProps } from "./ui/field";
import { Icon } from "./ui/icons";
import { IconTile } from "./ui/icon-tile";
import { Notice } from "./ui/notice";

const kindKeys = [
  "identity",
  "vehicle_registration",
  "driving_license",
  "proof_of_address",
  "medical_form",
  "existing_policy",
  "other"
] as const;

export function QuoteDocumentUpload({ publicReference, token, remainingSlots }: { publicReference: string; token: string; remainingSlots: number }) {
  const t = useTranslations("DocumentUpload");
  const router = useRouter();
  const [state, setState] = useState<PublicQuoteDocumentUploadState | { status: "idle" | "submitting"; publicMessage?: string }>({ status: "idle" });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) {
      setState({ status: "error", messageKey: "documentRejected", publicMessage: t("selectFile") });
      return;
    }
    setState({ status: "submitting", publicMessage: t("submitting") });
    const result = await uploadQuoteDocument(publicReference, token, formData);
    setState(result);
    if (result.status === "success") {
      form.reset();
      router.refresh();
    }
  }

  if (remainingSlots <= 0) {
    return (
      <Notice tone="info" role="status">
        {t("full")}
      </Notice>
    );
  }

  return (
    <form className="am-j-panel" onSubmit={submit} aria-label={t("formLabel")}>
      <div className="am-j-panel__head">
        <IconTile name="upload" size="lg" />
        <h3 className="am-j-panel__title">{t("formLabel")}</h3>
      </div>
      <Notice tone="info">{t("hint")}</Notice>
      <div className="am-j-form__grid">
        <Field id="am-document-kind" label={t("kindLabel")}>
          <select {...fieldControlProps("am-document-kind", {})} name="documentKind" defaultValue="other">
            {kindKeys.map((value) => (
              <option key={value} value={value}>
                {t(`kinds.${value}`)}
              </option>
            ))}
          </select>
        </Field>
        <Field id="am-document-label" label={t("labelLabel")} required>
          <input
            {...fieldControlProps("am-document-label", { required: true })}
            name="label"
            maxLength={120}
            placeholder={t("labelPlaceholder")}
          />
        </Field>
        <Field id="am-document-file" label={t("fileLabel")} hint={t("fileHint")} required>
          <input
            {...fieldControlProps("am-document-file", { hint: t("fileHint"), required: true })}
            name="file"
            type="file"
            accept="application/pdf,image/jpeg,image/png"
          />
        </Field>
      </div>
      {state.status === "success" || state.status === "disabled" ? (
        <Notice tone={state.status === "success" ? "success" : "info"} role="status">
          {state.publicMessage}
        </Notice>
      ) : null}
      {state.status === "error" || state.status === "rate_limited" ? (
        <Notice tone="error" role="alert">
          {state.publicMessage}
        </Notice>
      ) : null}
      {state.status === "submitting" ? (
        <Notice tone="info" role="status">
          {state.publicMessage}
        </Notice>
      ) : null}
      <div className="am-cluster">
        <Button type="submit" loading={state.status === "submitting"} icon={<Icon name="paperclip" size={18} />}>
          {t("submit")}
        </Button>
        <p className="am-j-fineprint">{t("remaining", { count: remainingSlots })}</p>
      </div>
    </form>
  );
}
