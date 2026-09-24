import type { ReactNode } from "react";
import { Icon } from "./icons";

export interface AiBoxProps {
  children: ReactNode;
  /** Short label displayed on the pill, e.g. "genere par IA". */
  generatedLabel: string;
  /** Permanent disclaimer, never hidden behind an interaction. */
  disclaimer: string;
  title?: string;
  ariaLabel?: string;
}

/** Any AI-produced content is framed, labelled and carries its disclaimer at all times. */
export function AiBox({ children, generatedLabel, disclaimer, title, ariaLabel }: AiBoxProps) {
  return (
    <section className="am-aibox" aria-label={ariaLabel ?? title ?? generatedLabel}>
      <span className="am-aibox__label">
        <Icon name="sparkles" size={16} />
        {generatedLabel}
      </span>
      {title ? <h3 className="am-aibox__title">{title}</h3> : null}
      <div>{children}</div>
      <p className="am-aibox__disclaimer">{disclaimer}</p>
    </section>
  );
}
