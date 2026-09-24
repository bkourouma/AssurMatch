import type { ReactNode } from "react";

export interface BlockProps {
  children: ReactNode;
  className?: string | undefined;
  /** `section` turns the block into a landmark; the default stays a plain `div`. */
  as?: "div" | "section" | "article" | undefined;
  /** Accessible name of the block; only meaningful together with `as="section"`. */
  "aria-label"?: string | undefined;
}

function join(base: string, className?: string | undefined): string {
  return className ? `${base} ${className}` : base;
}

function Block({ base, props }: { base: string; props: BlockProps }) {
  const Tag = props.as ?? "div";
  return (
    <Tag className={join(base, props.className)} aria-label={props["aria-label"]}>
      {props.children}
    </Tag>
  );
}

/** Vertical rhythm of a back-office page: header, notices, cards. */
export function PageStack(props: BlockProps) {
  return <Block base="bo-page" props={props} />;
}

export interface GridProps extends BlockProps {
  columns?: "two" | "three" | "kpi" | undefined;
}

export function Grid({ columns, ...props }: GridProps) {
  return <Block base={columns ? `bo-grid bo-grid--${columns}` : "bo-grid"} props={props} />;
}

/** Two thirds of content plus a side column that collapses under 1100px. */
export function Split(props: BlockProps) {
  return <Block base="bo-split" props={props} />;
}

export function Cluster(props: BlockProps) {
  return <Block base="bo-cluster" props={props} />;
}

export function Stack(props: BlockProps) {
  return <Block base="bo-stack" props={props} />;
}
