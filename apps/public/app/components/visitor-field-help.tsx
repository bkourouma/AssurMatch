"use client";

import { useLocale, useTranslations } from "next-intl";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { readVisitorAi, readVisitorAiAvailability, requestVisitorAi, type VisitorAiInteraction } from "../lib/public-api";
import { AiBox } from "./ui/ai-box";
import { BackendText } from "./ui/backend-text";
import { Skeleton } from "./ui/skeleton";
import "../styles/components/visitor-field-help.css";

const ASSIST_TYPE = "visitor_form_help";
const FIELD_ID_PREFIX = "am-answer-";
const POLL_INTERVAL_MS = 750;
const POLL_ATTEMPTS = 20;

type HelpStatus = "loading" | "done" | "refused" | "failed" | "timeout" | "unavailable";
interface HelpEntry {
  status: HelpStatus;
  open: boolean;
  interaction?: VisitorAiInteraction;
}

interface HelpContextValue {
  labels: Map<string, string>;
  entries: Record<string, HelpEntry>;
  toggle: (fieldKey: string) => void;
  close: (fieldKey: string) => void;
}

const HelpContext = createContext<HelpContextValue | null>(null);

/**
 * Per-field reading help for the quote form. Reads the availability ONCE for the whole form; while
 * `visitor_form_help` is not confirmed enabled for the country + product nothing is rendered and
 * nothing is requested. Only the field key, its published label, the country, the product and the
 * language leave the browser: never an entered value. Answers are cached per field key (the endpoint
 * is rate limited) and nothing is ever written into a field.
 */
export function VisitorFieldHelpProvider({
  countryCode,
  productKey,
  fields,
  children
}: {
  countryCode: string;
  productKey: string;
  fields: Array<{ key: string; label: string }>;
  children: ReactNode;
}) {
  const language = useLocale();
  const [available, setAvailable] = useState(false);
  const [entries, setEntries] = useState<Record<string, HelpEntry>>({});
  const entriesRef = useRef(entries);
  entriesRef.current = entries;
  const mounted = useRef(true);
  const labels = useMemo(() => new Map(fields.map((field) => [field.key, field.label])), [fields]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    readVisitorAiAvailability(countryCode, productKey).then((availability) => {
      if (active) setAvailable(availability.some((entry) => entry.assistType === ASSIST_TYPE && entry.enabled));
    });
    return () => {
      active = false;
    };
  }, [countryCode, productKey]);

  const patch = useCallback((fieldKey: string, entry: Partial<HelpEntry>) => {
    if (!mounted.current) return;
    setEntries((current) => ({ ...current, [fieldKey]: { status: "loading", open: true, ...current[fieldKey], ...entry } }));
  }, []);

  const load = useCallback(
    async (fieldKey: string) => {
      const fieldLabel = labels.get(fieldKey);
      if (!fieldLabel) return;
      patch(fieldKey, { status: "loading", open: true });
      const result = await requestVisitorAi(ASSIST_TYPE, { countryCode, productKey, fieldKey, fieldLabel, language });
      if (result.status !== "queued" || !result.interaction) {
        patch(fieldKey, { status: "unavailable" });
        return;
      }
      let interaction: VisitorAiInteraction | null = result.interaction;
      for (let attempt = 0; interaction && interaction.status === "queued" && attempt < POLL_ATTEMPTS; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
        if (!mounted.current) return;
        interaction = await readVisitorAi(result.interaction.id);
      }
      if (!interaction || interaction.status === "queued") {
        patch(fieldKey, { status: "timeout" });
        return;
      }
      patch(fieldKey, { status: interaction.status === "completed" && interaction.outputText ? "done" : interaction.status === "refused" ? "refused" : "failed", interaction });
    },
    [countryCode, productKey, language, labels, patch]
  );

  const toggle = useCallback(
    (fieldKey: string) => {
      const current = entriesRef.current[fieldKey];
      if (current?.open) {
        patch(fieldKey, { open: false });
        return;
      }
      // A finished or pending answer is reused; a failed, timed-out or unavailable one may be retried.
      if (current && (current.status === "done" || current.status === "refused" || current.status === "loading")) {
        patch(fieldKey, { open: true });
        return;
      }
      void load(fieldKey);
    },
    [load, patch]
  );
  const close = useCallback((fieldKey: string) => patch(fieldKey, { open: false }), [patch]);

  const value = useMemo<HelpContextValue | null>(() => (available ? { labels, entries, toggle, close } : null), [available, labels, entries, toggle, close]);
  return <HelpContext.Provider value={value}>{children}</HelpContext.Provider>;
}

/**
 * Rendered by `Field`. `trigger` is the "?" button (placed after the label), `panel` the answer region
 * (placed under the control). Without a provider, or while the flag is closed, both are null.
 */
export function VisitorFieldHelpSlot({ fieldId, part = "trigger" }: { fieldId: string; part?: "trigger" | "panel" }) {
  const context = useContext(HelpContext);
  const t = useTranslations("VisitorAi");
  if (!context || !fieldId.startsWith(FIELD_ID_PREFIX)) return null;
  const fieldKey = fieldId.slice(FIELD_ID_PREFIX.length);
  const fieldLabel = context.labels.get(fieldKey);
  if (!fieldLabel) return null;
  const entry = context.entries[fieldKey];
  const open = entry?.open === true;
  const panelId = `${fieldId}-help`;

  if (part === "trigger") {
    return (
      <button
        type="button"
        className="am-field-help__trigger"
        aria-label={t("fieldHelp.trigger", { field: fieldLabel })}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => context.toggle(fieldKey)}
      >
        <span aria-hidden="true">?</span>
      </button>
    );
  }

  const interaction = entry?.interaction;
  const title = t("fieldHelp.title", { field: fieldLabel });
  return (
    <div className="am-field-help__panel" id={panelId} aria-live="polite" data-visitor-field-help={fieldKey}>
      {open && entry ? (
        <AiBox generatedLabel={t("disclosureLabel")} disclaimer={t("fieldHelp.aiNotice")} title={title} ariaLabel={title}>
          {entry.status === "loading" ? (
            <div aria-busy="true">
              <span className="am-visually-hidden">{t("pending")}</span>
              <Skeleton lines={2} />
            </div>
          ) : null}
          {entry.status === "done" && interaction?.outputText ? (
            <>
              <p className="am-field-help__text">
                <BackendText>{interaction.outputText}</BackendText>
              </p>
              {interaction.fallback ? <p className="am-field__hint">{t("fallback")}</p> : null}
            </>
          ) : null}
          {entry.status === "refused" ? <p className="am-field-help__text">{t("refused")}</p> : null}
          {entry.status === "failed" ? <p className="am-field-help__text">{t("failed")}</p> : null}
          {entry.status === "timeout" ? <p className="am-field-help__text">{t("timeout")}</p> : null}
          {entry.status === "unavailable" ? <p className="am-field-help__text">{t("unavailable")}</p> : null}
          <p className="am-field__hint">{t("fieldHelp.note")}</p>
          <button type="button" className="am-field-help__close" onClick={() => context.close(fieldKey)}>
            {t("fieldHelp.close")}
          </button>
        </AiBox>
      ) : null}
    </div>
  );
}
