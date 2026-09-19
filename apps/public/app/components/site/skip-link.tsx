export interface SkipLinkProps {
  label: string;
  targetId?: string;
}

/** First focusable element of every page: jumps straight to the main content. */
export function SkipLink({ label, targetId = "contenu" }: SkipLinkProps) {
  return (
    <a className="am-skip-link" href={`#${targetId}`}>
      {label}
    </a>
  );
}
