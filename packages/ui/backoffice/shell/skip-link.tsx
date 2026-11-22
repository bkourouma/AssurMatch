export interface SkipLinkProps {
  /** Accessible, visible-on-focus label; the shell passes its own `skipLinkLabel`. */
  label: string;
  /** Id of the landmark to jump to; it must be focusable (`tabIndex={-1}`). */
  targetId?: string | undefined;
}

/**
 * First focusable element of a page: invisible until it takes the keyboard focus, then it jumps
 * past the navigation to the main landmark. Server-safe, no script: the browser moves the focus to
 * the target because the target carries `tabIndex={-1}`.
 */
export function SkipLink({ label, targetId = "bo-content" }: SkipLinkProps) {
  return (
    <a className="bo-skip-link" href={`#${targetId}`}>
      {label}
    </a>
  );
}
