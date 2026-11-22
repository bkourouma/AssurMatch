/**
 * `@types/react-dom` is not a dependency of the workspace. The shared UI only needs these two entry
 * points (`useFormStatus` in the confirm dialog, `renderToStaticMarkup` in its tests); drop this file
 * if the real typings are ever installed.
 */
declare module "react-dom" {
  export function useFormStatus(): {
    pending: boolean;
    data: FormData | null;
    method: string | null;
    action: string | ((formData: FormData) => void | Promise<void>) | null;
  };
}

declare module "react-dom/server" {
  import type { ReactNode } from "react";
  export function renderToStaticMarkup(element: ReactNode): string;
  export function renderToString(element: ReactNode): string;
}
