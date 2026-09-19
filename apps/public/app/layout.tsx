import type { ReactNode } from "react";

/**
 * The real root layout lives in `app/[locale]/layout.tsx`, which owns `<html>` and `<body>`: the
 * locale is only known inside that segment. This one is a pass-through, as required by next-intl.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return children;
}
