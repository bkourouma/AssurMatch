import type { ReactNode } from "react";
import { Logo } from "../logo";

export interface AuthShellProps {
  children: ReactNode;
  /** Name of the surface under the logo, e.g. "Back-office Admin". */
  scope: string;
  homeHref?: string | undefined;
  footer?: ReactNode;
  /** `data-*` attributes the surface needs for its own static tests. */
  dataAttributes?: Record<string, string> | undefined;
}

/** Centred authentication screen shared by both back-offices; it carries no auth logic at all. */
export function AuthShell({ children, scope, homeHref, footer, dataAttributes }: AuthShellProps) {
  return (
    <div className="bo-auth" {...dataAttributes}>
      <div className="bo-auth__panel">
        <div className="bo-auth__brand">
          {homeHref ? (
            <a href={homeHref}>
              <Logo variant="color" height={30} priority />
            </a>
          ) : (
            <Logo variant="color" height={30} priority />
          )}
          <span className="bo-auth__scope">{scope}</span>
        </div>
        {children}
        {footer ? <div className="bo-auth__footer">{footer}</div> : null}
      </div>
    </div>
  );
}
