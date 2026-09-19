export interface RadioCardOption {
  value: string;
  label: string;
  description?: string;
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
