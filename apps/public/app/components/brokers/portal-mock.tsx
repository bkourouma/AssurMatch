import { Reveal } from "../motion/reveal";

export interface PortalMockProps {
  /** Visible caption explaining this is a drawn illustration, not a screenshot of the real portal. */
  caption: string;
}

/**
 * Purely decorative illustration of the broker portal, drawn in CSS. No screenshot asset exists for
 * the (separate, authenticated) broker application, so this stands in for one: a browser-style frame
 * with a side navigation and three kanban-style columns of blank lead cards. The whole drawing is
 * `aria-hidden`; only the caption below it is exposed to assistive technology. It floats gently and
 * three of its placeholder bars shimmer on a loop (`prefers-reduced-motion` turns both off, see
 * `motion.css` and the reduced-motion override in `brokers.css`), and the three columns fade in
 * staggered. Only the first column's head and its first card carry `data-shimmer`: twelve bars all
 * looping at once was twelve infinite animations for a decoration nobody reads.
 */
export function PortalMock({ caption }: PortalMockProps) {
  return (
    <figure className="am-portalmock">
      <div aria-hidden="true">
        <Reveal from="scale" className="am-portalmock__frame am-animate-float">
          <div className="am-portalmock__bar">
            <span className="am-portalmock__dot" />
            <span className="am-portalmock__dot" />
            <span className="am-portalmock__dot" />
          </div>
          <div className="am-portalmock__body">
            <div className="am-portalmock__nav">
              <span className="am-portalmock__navitem" data-active="true" />
              <span className="am-portalmock__navitem" />
              <span className="am-portalmock__navitem" />
              <span className="am-portalmock__navitem" />
            </div>
            <Reveal as="div" stagger className="am-portalmock__columns">
              {[0, 1, 2].map((column) => (
                <div className="am-portalmock__column" key={column}>
                  <span className="am-portalmock__columnhead" {...(column === 0 ? { "data-shimmer": "true" } : {})} />
                  <span className="am-portalmock__card">
                    <span className="am-portalmock__cardline" data-tone="brand" {...(column === 0 ? { "data-shimmer": "true" } : {})} />
                    <span className="am-portalmock__cardline" data-width="short" {...(column === 0 ? { "data-shimmer": "true" } : {})} />
                  </span>
                  <span className="am-portalmock__card">
                    <span className="am-portalmock__cardline" />
                    <span className="am-portalmock__cardline" data-width="short" />
                  </span>
                </div>
              ))}
            </Reveal>
          </div>
        </Reveal>
      </div>
      <figcaption className="am-portalmock__caption">{caption}</figcaption>
    </figure>
  );
}
