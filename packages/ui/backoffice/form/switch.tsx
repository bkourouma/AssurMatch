"use client";

import { useId, useState } from "react";

export interface SwitchProps {
  name: string;
  label: string;
  defaultChecked?: boolean | undefined;
  /** Value posted when the switch is on; anything else posts an empty string. */
  value?: string | undefined;
  disabled?: boolean | undefined;
  describedBy?: string | undefined;
}

/**
 * A `role="switch"` button backed by a hidden input so the state is posted by a plain form. Without
 * JavaScript the switch cannot be toggled, so it is reserved for optional preferences.
 */
export function Switch({ name, label, defaultChecked = false, value = "on", disabled, describedBy }: SwitchProps) {
  const [checked, setChecked] = useState(defaultChecked);
  const labelId = useId();

  return (
    <span className="bo-switch-row" data-disabled={disabled ? "true" : undefined}>
      <input type="hidden" name={name} value={checked ? value : ""} />
      <button
        className="bo-switch"
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={labelId}
        aria-describedby={describedBy}
        disabled={disabled}
        onClick={() => setChecked((previous) => !previous)}
      />
      {/* The visible text names the switch and toggles it, like a native label. */}
      <span className="bo-switch-row__label" id={labelId} onClick={disabled ? undefined : () => setChecked((previous) => !previous)}>
        {label}
      </span>
    </span>
  );
}
