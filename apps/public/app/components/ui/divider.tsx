export interface DividerProps {
  spacing?: "sm" | "md" | "lg";
  orientation?: "horizontal" | "vertical";
  className?: string;
}

/** Decorative rule that fades at both ends. */
export function Divider({ spacing = "md", orientation = "horizontal", className }: DividerProps) {
  return (
    <hr
      className={className ? `am-divider ${className}` : "am-divider"}
      data-spacing={spacing === "md" ? undefined : spacing}
      data-orientation={orientation === "horizontal" ? undefined : orientation}
      aria-hidden="true"
    />
  );
}
