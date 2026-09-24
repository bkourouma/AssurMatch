import { Notice } from "../notice";
import type { NoticeTone } from "../notice";

export interface ActionState {
  status: "idle" | "success" | "error" | string;
  message?: string | undefined;
  /** One-shot token returned by an activation or a password reset action. */
  token?: string | undefined;
  expiresAt?: string | undefined;
}

export interface ActionNoticeProps {
  state: ActionState;
  title?: string | undefined;
  /** Wording of the token line; the package ships no surface text of its own. */
  tokenLabel?: string | undefined;
  expiresLabel?: string | undefined;
}

const TONES: Record<string, NoticeTone> = {
  success: "success",
  error: "danger",
  warning: "warning"
};

/** Uniform rendering of a server action result; renders nothing while the state is idle. */
export function ActionNotice({ state, title, tokenLabel, expiresLabel }: ActionNoticeProps) {
  if (state.status === "idle") return null;
  const tone = TONES[state.status] ?? "info";

  return (
    <Notice tone={tone} title={title}>
      {state.message ? <p>{state.message}</p> : null}
      {state.token ? (
        <p>
          {tokenLabel ? `${tokenLabel} ` : null}
          <code>{state.token}</code>
        </p>
      ) : null}
      {state.expiresAt ? <p>{expiresLabel ? `${expiresLabel} ${state.expiresAt}` : state.expiresAt}</p> : null}
    </Notice>
  );
}
