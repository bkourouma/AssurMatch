import type { ComponentProps, ReactNode } from "react";
import { Link } from "../../../i18n/navigation";

type LinkHref = ComponentProps<typeof Link>["href"];

export interface RouteStop {
  key: string;
  title: ReactNode;
  body?: ReactNode;
  /** `confirm` paints the stop green: it is the stop where the broker confirms. */
  state?: "default" | "confirm";
}

export interface RouteProps {
  stops: readonly RouteStop[];
  /** `auto` lays the stops in a row from 900px; `vertical` keeps the line down the page. */
  orientation?: "auto" | "vertical";
  headingLevel?: 3 | 4;
  label?: string;
  className?: string;
}

/**
 * Numbered stops on a navy line: how a journey unfolds ("Comparez", "Demandez un devis", "Le courtier
 * confirme"). The numbering carries information (the order), which is why it is shown.
 */
export function Route({ stops, orientation = "auto", headingLevel = 3, label, className }: RouteProps) {
  const Heading = headingLevel === 4 ? "h4" : "h3";
  return (
    <ol className={className ? `am-route ${className}` : "am-route"} data-orientation={orientation} aria-label={label}>
      {stops.map((stop, index) => (
        <li className="am-route__stop" key={stop.key} data-state={stop.state === "confirm" ? "confirm" : undefined}>
          <span className="am-route__dot" aria-hidden="true">
            {index + 1}
          </span>
          <Heading className="am-route__title">{stop.title}</Heading>
          {stop.body ? <p className="am-route__body">{stop.body}</p> : null}
        </li>
      ))}
    </ol>
  );
}

export interface RouteStripStop {
  key: string;
  label: string;
  href?: LinkHref;
  state: "done" | "current" | "todo";
}

export interface RouteStripProps {
  stops: readonly RouteStripStop[];
  /** Accessible name, e.g. « Votre parcours ». */
  label: string;
  /** Screen-reader text appended to the current stop, e.g. « (vous êtes ici) ». */
  currentLabel: string;
}

/**
 * « Vous êtes ici »: the journey line printed on the navy sign of every journey page
 * (Pays, Produit, Offres, Demande, Courtier). Stops already passed are links back.
 */
export function RouteStrip({ stops, label, currentLabel }: RouteStripProps) {
  return (
    <nav className="am-routestrip" aria-label={label}>
      <ol className="am-routestrip__list">
        {stops.map((stop) => (
          <li className="am-routestrip__stop" key={stop.key} data-state={stop.state} aria-current={stop.state === "current" ? "step" : undefined}>
            <span className="am-routestrip__mark" aria-hidden="true" />
            <span className="am-routestrip__label">
              {stop.state === "done" && stop.href ? <Link href={stop.href}>{stop.label}</Link> : stop.label}
              {stop.state === "current" ? <span className="am-visually-hidden"> {currentLabel}</span> : null}
            </span>
          </li>
        ))}
      </ol>
    </nav>
  );
}
