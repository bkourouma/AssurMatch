/**
 * `@types/react-dom` is not installed in this workspace, yet React 19 ships `useFormStatus` in `react-dom`.
 * Only the hook the admin back-office uses is declared here (see `pending-action-button.tsx`, `auth-submit-button.tsx`).
 */
declare module "react-dom" {
  export function useFormStatus(): { pending: boolean; data: FormData | null; method: string | null; action: string | ((formData: FormData) => void | Promise<void>) | null };
}
