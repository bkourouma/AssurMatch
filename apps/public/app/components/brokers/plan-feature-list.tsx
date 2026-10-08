import { Icon } from "../ui/icons";

export interface PlanFeatureListProps {
  items: readonly string[];
  /**
   * `included` draws a navy tick (a feature of the plan, not a confirmation: green stays for what is
   * confirmed); `excluded` draws a grey dash for what the plan does not contain.
   */
  tone?: "included" | "excluded";
  label?: string;
  className?: string;
}

/**
 * A trailing parenthesis, such as the transparency label « (généré par IA, à relire par votre
 * équipe) », goes on its own quieter line under the feature name. Every character of the content is
 * kept, the parentheses included: only the layout changes.
 */
function splitTrailingNote(feature: string): { main: string; note?: string } {
  const match = /^(.*\S)\s+(\([^()]+\))$/.exec(feature);
  const main = match?.[1];
  const note = match?.[2];
  return main && note ? { main, note } : { main: feature };
}

/** A ruled list of plan features: one row per feature, separated by 1px rules. */
export function PlanFeatureList({ items, tone = "included", label, className }: PlanFeatureListProps) {
  if (items.length === 0) return null;
  return (
    <ul className={className ? `am-planlist ${className}` : "am-planlist"} data-tone={tone} aria-label={label}>
      {items.map((item) => {
        const { main, note } = splitTrailingNote(item);
        return (
          <li key={item}>
            <Icon name={tone === "included" ? "check" : "minus"} size={18} />
            <span className="am-planlist__text">
              {main}
              {note ? (
                <>
                  {" "}
                  <span className="am-planlist__note">{note}</span>
                </>
              ) : null}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
