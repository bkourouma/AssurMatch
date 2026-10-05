import type { ReactNode } from "react";
import { Section } from "../ui/section";

/**
 * Reserved place of the broker proposals on the tracking space. Spec 054 never receives a
 * `proposals` field; spec 055 adds it to the status view and fills this slot. Until then the slot
 * renders nothing, so no empty "proposals" heading is ever shown to a visitor.
 */
export interface QuoteProposalsSlotProps {
  proposals: readonly unknown[] | undefined;
  title: string;
  lead: string;
  children?: ReactNode;
}

export function hasProposals(view: object): view is { proposals: readonly unknown[] } {
  const candidate = (view as { proposals?: unknown }).proposals;
  return Array.isArray(candidate) && candidate.length > 0;
}

export function QuoteProposalsSlot({ proposals, title, lead, children }: QuoteProposalsSlotProps) {
  if (!proposals || proposals.length === 0) return null;
  return (
    <Section title={title} lead={lead}>
      <div className="am-j-column" data-slot="quote-proposals">
        {children}
      </div>
    </Section>
  );
}
