export interface ProgressStep {
  label: string;
}

export interface ProgressBarProps {
  /** Four steps of the quote journey. */
  steps: readonly ProgressStep[];
  /** 1-based index of the step in progress. */
  current: number;
  label: string;
  /** Accessible sentence, e.g. "Etape 2 sur 4", read out next to the current step. */
  stepLabel: string;
}

export function ProgressBar({ steps, current, label, stepLabel }: ProgressBarProps) {
  return (
    <nav className="am-progress" aria-label={label}>
      <ol className="am-progress__list">
        {steps.map((step, index) => {
          const position = index + 1;
          const state = position < current ? "done" : position === current ? "current" : "todo";
          return (
            <li
              className="am-progress__step"
              key={step.label}
              data-state={state}
              aria-current={state === "current" ? "step" : undefined}
            >
              <span className="am-progress__index">{position}</span>
              <span>{step.label}</span>
              {state === "current" ? <span className="am-visually-hidden">{stepLabel}</span> : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
