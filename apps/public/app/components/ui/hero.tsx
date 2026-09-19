import type { ReactNode } from "react";

export interface HeroProps {
  title: string;
  kicker?: string;
  lead?: string;
  actions?: ReactNode;
  children?: ReactNode;
}

/** Hero band on primary-50, with a primary-700 title. Never a green background. */
export function Hero({ title, kicker, lead, actions, children }: HeroProps) {
  return (
    <section className="am-hero">
      <div className="am-container">
        <div className="am-hero__inner">
          {kicker ? <p className="am-hero__kicker">{kicker}</p> : null}
          <h1 className="am-hero__title">{title}</h1>
          {lead ? <p className="am-hero__lead">{lead}</p> : null}
          {actions ? <div className="am-cluster">{actions}</div> : null}
          {children}
        </div>
      </div>
    </section>
  );
}
