import { useTranslations } from "next-intl";
import { Notice } from "../ui/notice";

/**
 * The regulatory positioning of AssurMatch. The French wording keeps the exact substrings
 * "plateforme technique" and "comparaison indicative" required by Constitution principle I.
 */
const FR_PLATFORM_STATUS =
  "AssurMatch est une plateforme technique de comparaison indicative et de mise en relation avec des courtiers partenaires autorises.";

export function PlatformStatusNotice({ tone = "info" }: { tone?: "info" | "indicative" }) {
  const t = useTranslations("Common");
  const text = t("platformStatus") || FR_PLATFORM_STATUS;
  return <Notice tone={tone}>{text}</Notice>;
}
