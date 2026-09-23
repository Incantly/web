export function IncantlyCloser() {
  return (
    <>
      <section className="closer" aria-labelledby="closer-heading">
        <p className="section-eyebrow closer-eyebrow">A place for the next question</p>
        <h2 id="closer-heading">The best part of a note is where it can take you next.</h2>
        <p className="closer-sub">Keep following the thought.</p>
      </section>
      <section className="closer-band" aria-labelledby="closer-band-heading">
        <div className="closer-band-inner">
          <div className="closer-band-copy">
            <h2 id="closer-band-heading">Your ideas deserve a place to grow.</h2>
            <p>Start with a note. See what becomes possible when you can ask, make, and explore in the same space.</p>
            <a className="closer-action" href="#get-started">Get started</a>
          </div>
          <span className="closer-mark" aria-hidden="true">✳</span>
        </div>
      </section>
    </>
  )
}
