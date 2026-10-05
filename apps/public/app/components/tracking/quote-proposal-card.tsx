import type { PublicLeadProposal, PublicProposalStatus } from "../../../../../packages/shared/contracts/lead-proposals";
import { proposalDocumentHref } from "../../lib/public-api";
import { BackendText } from "../ui/backend-text";
import { Badge, type BadgeTone } from "../ui/badge";
import { Icon } from "../ui/icons";
import { IconTile } from "../ui/icon-tile";
import { Notice } from "../ui/notice";
import { ProposalResponseForm, type ProposalResponseFormLabels } from "./proposal-response-form";

/**
 * Spec 055 US2 / FR-004 / FR-005: one broker proposal on the visitor tracking space. Every proposal
 * comes from the named broker and carries its non-contractual notice; AssurMatch shows it as sent,
 * never ranks, compares or recommends it. The broker's message is rendered as plain text only.
 */
export interface QuoteProposalCardLabels {
  from: string;
  sentAt: string;
  validUntil: string;
  validUntilExpired: string;
  messageLabel: string;
  priceLabel: string;
  price: string | null;
  guaranteesLabel: string;
  noGuarantees: string;
  document: string;
  documentHint: string;
  noticeTitle: string;
  status: Record<PublicProposalStatus, string>;
  closedBody: string;
  expiredBody: string;
  previousTitle: string;
  previousLines: string[];
  changeHint: string;
  response: ProposalResponseFormLabels;
}

export interface QuoteProposalCardProps {
  proposal: PublicLeadProposal;
  publicReference: string;
  token: string;
  locale: string;
  labels: QuoteProposalCardLabels;
}

/** Green stays reserved for the licence signal: a proposal status is never a validation. */
const STATUS_TONES: Record<PublicProposalStatus, BadgeTone> = {
  sent: "new",
  viewed: "neutral",
  responded: "neutral",
  expired: "soon",
  closed: "soon"
};

export function QuoteProposalCard({ proposal, publicReference, token, locale, labels }: QuoteProposalCardProps) {
  const status = proposal.status;
  return (
    <article className="am-j-panel am-stack" data-proposal-id={proposal.id} data-proposal-status={status}>
      <div className="am-j-panel__head">
        <IconTile name="file-text" size="lg" />
        <div>
          <h3 className="am-j-panel__title">
            <BackendText>{labels.from}</BackendText>
          </h3>
          <p className="am-j-fineprint">{labels.sentAt}</p>
        </div>
        <Badge tone={STATUS_TONES[status] ?? "neutral"} dot>
          {labels.status[status] ?? labels.status.sent}
        </Badge>
      </div>

      <Notice tone="indicative" title={labels.noticeTitle} role="note">
        <BackendText>{proposal.nonContractualNotice}</BackendText>
      </Notice>

      <div>
        <p className="am-j-fineprint">{labels.messageLabel}</p>
        <p style={{ whiteSpace: "pre-line" }}>
          <BackendText>{proposal.message}</BackendText>
        </p>
      </div>

      {labels.price ? (
        <p>
          <strong>{labels.priceLabel}</strong>
          {" : "}
          <span className="am-tabular">{labels.price}</span>
        </p>
      ) : null}

      <div>
        <p className="am-j-fineprint">{labels.guaranteesLabel}</p>
        {proposal.guarantees.length > 0 ? (
          <ul className="am-j-list">
            {proposal.guarantees.map((guarantee, index) => (
              <li key={`${guarantee}-${index}`}>
                <Icon name="check-circle" size={18} />
                <BackendText>{guarantee}</BackendText>
              </li>
            ))}
          </ul>
        ) : (
          <p className="am-j-fineprint">{labels.noGuarantees}</p>
        )}
      </div>

      <p className="am-j-fineprint">{status === "expired" ? labels.validUntilExpired : labels.validUntil}</p>

      {proposal.hasDocument ? (
        <div>
          <a
            className="am-button"
            data-variant="secondary"
            href={proposalDocumentHref(publicReference, proposal.id, token)}
            rel="noreferrer nofollow"
            referrerPolicy="no-referrer"
            download
          >
            <Icon name="file-text" size={18} />
            {labels.document}
          </a>
          <p className="am-j-fineprint">{labels.documentHint}</p>
        </div>
      ) : null}

      {proposal.visitorResponse ? (
        <Notice tone="info" title={labels.previousTitle} role="status">
          {labels.previousLines.map((line, index) => (
            <span key={index}>
              {index > 0 ? <br /> : null}
              {line}
            </span>
          ))}
        </Notice>
      ) : null}

      {proposal.canRespond ? (
        <>
          {proposal.visitorResponse ? <p className="am-j-fineprint">{labels.changeHint}</p> : null}
          <ProposalResponseForm
            publicReference={publicReference}
            proposalId={proposal.id}
            token={token}
            locale={locale}
            labels={labels.response}
          />
        </>
      ) : (
        <Notice tone="info" role="status">
          {status === "expired" ? labels.expiredBody : labels.closedBody}
        </Notice>
      )}
    </article>
  );
}
