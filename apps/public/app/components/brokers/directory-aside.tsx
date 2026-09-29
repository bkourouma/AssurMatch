import { BackendText } from "../ui/backend-text";
import { Icon, type IconName } from "../ui/icons";
import { CountryFlag } from "../journey/country-flag";

export interface DirectoryAsideStat {
  key: string;
  icon: IconName;
  /** A length or a sum of counts the page already fetched from the API: never an invented figure. */
  value: number;
  label: string;
}

export interface DirectoryAsideProps {
  countryIso: string;
  countryName: string;
  stats: readonly DirectoryAsideStat[];
  /** Line under the counters (licence or indicative-price reminder), already translated. */
  footnote?: string;
}

/**
 * Hero aside of the per-country broker and insurer pages: a floating glass card with the country and
 * counters read from the lists the page fetched. It reuses the country card of the journey sheet
 * (`am-j-countrycard--live`), so the directories share the hero language of the country page. Purely
 * informative: no link, no form, nothing from the back-office.
 */
export function DirectoryAside({ countryIso, countryName, stats, footnote }: DirectoryAsideProps) {
  return (
    <div className="am-j-countrycard am-j-countrycard--live am-dir-aside">
      <div className="am-j-countrycard__head">
        <CountryFlag isoCode={countryIso} size="lg" />
        <div>
          <p className="am-j-countrycard__name">
            <BackendText>{countryName}</BackendText>
          </p>
        </div>
      </div>
      {stats.length > 0 ? (
        <dl className="am-j-countrycard__stats">
          {stats.map((stat) => (
            <div className="am-j-countrycard__stat" key={stat.key}>
              <dt>
                <Icon name={stat.icon} size={16} />
                {stat.label}
              </dt>
              <dd className="am-tabular">{stat.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {footnote ? (
        <p className="am-j-countrycard__licensed">
          <span className="am-j-countrycard__shield" aria-hidden="true">
            <Icon name="shield-check" size={12} />
          </span>
          {footnote}
        </p>
      ) : null}
    </div>
  );
}
