import type { ReactNode } from "react";

export interface BreadcrumbItem {
  label: string;
  href?: string | undefined;
}

export interface PageHeaderProps {
  kicker?: string | undefined;
  title: string;
  description?: string | undefined;
  actions?: ReactNode;
  breadcrumb?: BreadcrumbItem[] | undefined;
  /** Accessible name of the breadcrumb navigation; the surface owns the wording. */
  breadcrumbLabel?: string | undefined;
}

export function PageHeader({ kicker, title, description, actions, breadcrumb, breadcrumbLabel = "Fil d'Ariane" }: PageHeaderProps) {
  return (
    <header className="bo-page-header">
      <div className="bo-page-header__text">
        {breadcrumb && breadcrumb.length > 0 ? (
          <nav aria-label={breadcrumbLabel}>
            <ol className="bo-breadcrumb">
              {breadcrumb.map((item) => (
                <li key={`${item.label}-${item.href ?? ""}`}>
                  {item.href ? <a href={item.href}>{item.label}</a> : <span>{item.label}</span>}
                </li>
              ))}
            </ol>
          </nav>
        ) : null}
        {kicker ? <p className="bo-kicker">{kicker}</p> : null}
        <h1 className="bo-title">{title}</h1>
        {description ? <p className="bo-description">{description}</p> : null}
      </div>
      {actions ? <div className="bo-page-header__actions">{actions}</div> : null}
    </header>
  );
}
