import type { ReactNode } from "react";

export type Tone = "neutral" | "success" | "warning" | "danger" | "info" | "disabled";

export function PageHeader({ kicker, title, description, actions }: { kicker?: string; title: string; description?: string; actions?: ReactNode }) {
  return (
    <header className="page-header">
      <div>
        {kicker ? <p className="page-kicker">{kicker}</p> : null}
        <h1 className="page-title">{title}</h1>
        {description ? <p className="page-description">{description}</p> : null}
      </div>
      {actions ? <div>{actions}</div> : null}
    </header>
  );
}

export function Card({ children, plain = false }: { children: ReactNode; plain?: boolean }) {
  return <section className={`admin-card${plain ? " admin-card--plain" : ""}`}><div className="admin-card__body">{children}</div></section>;
}

export function KpiCard({ label, value, helper, tone = "neutral" }: { label: string; value: ReactNode; helper?: string; tone?: Tone }) {
  return (
    <article className="kpi-card" data-tone={tone} aria-label={label}>
      <div>
        <p className="kpi-card__label">{label}</p>
        <p className="kpi-card__value">{value}</p>
      </div>
      {helper ? <p className="kpi-card__helper">{helper}</p> : null}
    </article>
  );
}

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: Tone }) {
  return <span className="badge" data-tone={tone}>{children}</span>;
}

export function StateMessage({ title, children, tone = "neutral" }: { title?: string; children: ReactNode; tone?: Tone }) {
  return (
    <div className="state-message" data-tone={tone} role={tone === "danger" ? "alert" : "status"}>
      {title ? <strong>{title}</strong> : null}
      <div>{children}</div>
    </div>
  );
}

export interface TableColumn<T> {
  header: string;
  render: (item: T) => ReactNode;
}

export function DataTable<T>({ columns, items, getKey, emptyLabel }: { columns: Array<TableColumn<T>>; items: T[]; getKey: (item: T) => string; emptyLabel: string }) {
  return (
    <div className="admin-table-wrap">
      <table className="admin-table">
        <thead>
          <tr>
            {columns.map((column) => <th key={column.header} scope="col">{column.header}</th>)}
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={getKey(item)}>
              {columns.map((column) => <td key={column.header}>{column.render(item)}</td>)}
            </tr>
          ))}
          {items.length === 0 ? (
            <tr>
              <td colSpan={columns.length}>{emptyLabel}</td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
