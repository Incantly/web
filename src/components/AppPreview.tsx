import LogoMark from './Logo'

const RECENTS = [
  'How do earthquakes work?',
  'Q2 cash dashboard from CSV',
  'Summer moodboard direction',
  'Dinner for four nearby',
]

const QUAKES = [
  ['6.9', 'Honshu, Japan', '32 km'],
  ['6.1', 'Mindanao', '58 km'],
  ['5.6', 'Valparaíso', '21 km'],
] as const

/**
 * Static product shot for the landing page — the real Incantly workspace
 * layout (sidebar + chat + generated panel) with a short earthquake session.
 */
export default function AppPreview() {
  return (
    <div className="lp-app" aria-hidden>
      <aside className="lp-app-side">
        <div className="lp-app-side-top">
          <span className="lp-app-side-ico" />
          <span className="lp-app-side-ico" />
        </div>
        <button type="button" className="lp-app-new" tabIndex={-1}>
          <span>+</span> New chat
        </button>
        <nav className="lp-app-nav">
          <span className="lp-app-nav-item lp-app-nav-item--on">Chats</span>
          <span className="lp-app-nav-item">Docs</span>
          <span className="lp-app-nav-item">Artifacts</span>
          <span className="lp-app-nav-item">Customize</span>
        </nav>
        <p className="lp-app-recents-label">Recents</p>
        <ul className="lp-app-recents">
          {RECENTS.map((r, i) => (
            <li key={r} className={i === 0 ? 'lp-app-recent--on' : undefined}>
              {r}
            </li>
          ))}
        </ul>
        <div className="lp-app-profile">
          <span className="lp-app-avatar">I</span>
          <div>
            <p>Iteoluwakisi</p>
            <span>Early access</span>
          </div>
        </div>
      </aside>

      <div className="lp-app-chat">
        <header className="lp-app-chat-head">
          <p>How do earthquakes work?</p>
          <span className="lp-app-hide">Hide</span>
        </header>

        <div className="lp-app-thread">
          <div className="lp-app-msg lp-app-msg--user">How do earthquakes work?</div>
          <div className="lp-app-msg lp-app-msg--ai">
            <LogoMark size={18} />
            <p>
              Casting <em>seismic-model</em> for that — plates, stress, and live M5+ events on the
              right. Ask a follow-up anytime.
            </p>
          </div>
          <div className="lp-app-msg lp-app-msg--user">What about magnitude 7+ this year?</div>
          <div className="lp-app-msg lp-app-msg--ai">
            <LogoMark size={18} />
            <p>Pulled live USGS zones into the model. Tap a pulse on the globe to inspect depth.</p>
          </div>
        </div>

        <div className="lp-app-composer">
          <span className="lp-app-composer-plus">+</span>
          <span className="lp-app-composer-ph">Ask for an interface — or type / for skills</span>
          <span className="lp-app-composer-meta">Incantly</span>
          <span className="lp-app-composer-meta lp-app-composer-meta--live">Live</span>
          <span className="lp-app-composer-send" />
        </div>
      </div>

      <div className="lp-app-art">
        <header className="lp-app-art-head">
          <LogoMark size={16} />
          <div>
            <p>seismic-model.incantly</p>
            <span>Generated · how earthquakes work</span>
          </div>
          <span className="lp-app-art-pill">Generated</span>
        </header>

        <div className="lp-app-art-body">
          <div className="lp-app-globe">
            <span className="lp-app-globe-ring" />
            <span className="lp-app-globe-plate" />
            <span className="lp-app-globe-dot lp-app-globe-dot--a" />
            <span className="lp-app-globe-dot lp-app-globe-dot--b" />
          </div>
          <div className="lp-app-quake-copy">
            <p className="lp-app-quake-kicker">Plate boundary · stress release</p>
            <h3>Earth’s crust locks, then slips</h3>
            <p>
              Tectonic plates grind. Friction stores energy until the rock breaks — that sudden slip
              is the quake. Waves radiate through the crust; magnitude measures the energy released.
            </p>
            <ul className="lp-app-quake-list">
              {QUAKES.map(([m, place, depth]) => (
                <li key={place}>
                  <strong>{m}</strong>
                  <div>
                    <p>{place}</p>
                    <span>{depth} deep</span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
