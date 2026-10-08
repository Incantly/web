const ITEMS = [
  {
    q: 'Why not a video or a chat?',
    a: 'You leave the notes to watch someone else. Observation. A chat is more text. Incantly stays on the line you wrote. Pull it.',
  },
  {
    q: 'Why not another notes app?',
    a: 'Those store handwriting. This is the moment the page becomes something you can touch. Recents sleep as stills. They do not loop.',
  },
  {
    q: 'Do I need to know what to ask?',
    a: 'No. Not a prompt. Stay on the formula. Pull it.',
  },
  {
    q: 'What kind of notes work?',
    a: 'Typed, handwritten, a page you are already on. Math and physics formulas first. We will not pretend anatomy is in.',
  },
  {
    q: 'How do I make it live?',
    a: 'Stay on the line. Select the idea. Pull it. You are not typing a prompt into a chat.',
  },
  {
    q: 'What happens when I leave?',
    a: 'The page is still there tomorrow. Recents sleep as stills. They do not loop in the list.',
  },
  {
    q: 'Which devices?',
    a: 'iPhone, iPad, Android phone, and tablet. Same living page. None of them is second.',
  },
  {
    q: 'Is this only math and physics?',
    a: 'That is where we start. The law is the same for anything you write to understand. More node-kinds later.',
  },
] as const

export default function Faq() {
  return (
    <section className="chap faq" id="faq" aria-labelledby="faq-title">
      <div className="chap-grid" aria-hidden />
      <p className="chap-kicker">FAQ</p>
      <h2 className="chap-display chap-display--sm" id="faq-title">
        Before you
        <br />
        pull.
      </h2>

      <div className="faq-list">
        {ITEMS.map((item, i) => (
          <details key={item.q} className="faq-item" open={i === 0}>
            <summary className="faq-q">
              <span className="faq-n">{String(i + 1).padStart(2, '0')}</span>
              <span>{item.q}</span>
            </summary>
            <p className="faq-a">{item.a}</p>
          </details>
        ))}
      </div>
    </section>
  )
}
