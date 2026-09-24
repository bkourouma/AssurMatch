import { Icon, type IconName } from "./icons";

export interface RadioCardOption {
  value: string;
  label: string;
  description?: string;
  /** Optional glyph shown in a soft tile on the left of the card. */
  icon?: IconName;
}

export interface RadioCardsProps {
  name: string;
  legend: string;
  /** 2 to 6 options; more than six becomes a select, which stays readable on a phone. */
  options: readonly RadioCardOption[];
  defaultValue?: string;
  required?: boolean;
}

export function RadioCards({ name, legend, options, defaultValue, required }: RadioCardsProps) {
  const visible = options.slice(0, 6);
  return (
    <fieldset className="am-radiocards">
      <legend className="am-radiocards__legend">{legend}</legend>
      <div className="am-radiocards__list">
        {visible.map((option) => (
          <label className="am-radiocard" key={option.value}>
            <input type="radio" name={name} value={option.value} defaultChecked={defaultValue === option.value} required={required} />
            {option.icon ? (
              <span className="am-radiocard__icon" aria-hidden="true">
                <Icon name={option.icon} size={20} />
              </span>
            ) : null}
            <span className="am-radiocard__body">
              <span className="am-radiocard__label">{option.label}</span>
              {option.description ? <span className="am-radiocard__description">{option.description}</span> : null}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
