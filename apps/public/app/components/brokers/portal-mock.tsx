export interface PortalMockProps {
  /** Visible caption explaining this is a drawn illustration, not a screenshot of the real portal. */
  caption: string;
}

/**
 * Purely decorative illustration of the broker portal, drawn in CSS. No screenshot asset exists for
 * the (separate, authenticated) broker application, so this stands in for one: a browser-style frame
 * with a side navigation and three kanban-style columns of blank lead cards. The whole drawing is
 * `aria-hidden`; only the caption below it is exposed to assistive technology.
 */
export function PortalMock({ caption }: PortalMockProps) {
  return (
    <figure className="am-portalmock">
      <div className="am-portalmock__frame" aria-hidden="true">
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
          <div className="am-portalmock__columns">
            {[0, 1, 2].map((column) => (
              <div className="am-portalmock__column" key={column}>
                <span className="am-portalmock__columnhead" />
                <span className="am-portalmock__card">
                  <span className="am-portalmock__cardline" data-tone="brand" />
                  <span className="am-portalmock__cardline" data-width="short" />
                </span>
                <span className="am-portalmock__card">
                  <span className="am-portalmock__cardline" />
                  <span className="am-portalmock__cardline" data-width="short" />
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <figcaption className="am-portalmock__caption">{caption}</figcaption>
    </figure>
  );
}
