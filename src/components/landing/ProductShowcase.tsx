import type { ReactNode } from 'react'

type ProductShowcasePart = { children?: ReactNode }

function Frame({ children }: ProductShowcasePart) {
  return (
    <section className="product-section" id="product" aria-labelledby="product-heading">
      {children}
    </section>
  )
}

function Intro() {
  return (
    <div className="product-intro">
      <p className="section-eyebrow">Your ideas, in motion</p>
      <h2 id="product-heading">Everything you need to follow an idea</h2>
      <p>Write it down, see where it leads, and keep every discovery connected.</p>
    </div>
  )
}

function Tabs() {
  return (
    <nav className="product-tabs" aria-label="Ways to work in Incantly">
      <a href="#product-notes" aria-current="page">Your notes</a>
      <a href="#product-context">Research with context</a>
      <a href="#product-visual">Make it visual</a>
      <a href="#product-simulation">Try a simulation</a>
    </nav>
  )
}

function Surface() {
  return (
    <div className="product-surface-wrap">
      <div className="product-app" id="product-notes">
        <aside className="product-sidebar" aria-label="Incantly workspace">
          <div className="product-brand">incantly</div>
          <p className="product-sidebar-label">My space</p>
          <nav className="product-nav" aria-label="Notes">
            <a href="#product-notes" className="is-active">Search notes</a>
            <a href="#product-context">Field notes</a>
            <a href="#product-visual">Questions to explore</a>
            <a href="#product-simulation">Saved visuals</a>
          </nav>
          <div className="product-sidebar-note">
            <span aria-hidden="true">+</span>
            <span>New note</span>
          </div>
        </aside>

        <div className="product-main">
          <div className="product-note-header">
            <div>
              <p className="product-kicker">Field notes / Learning journal</p>
              <h3>Why do cities stay warm at night?</h3>
            </div>
            <button className="product-icon-button" type="button" aria-label="More note options">•••</button>
          </div>
          <div className="product-note-layout">
            <article className="product-note-copy">
              <p>The pavement still felt warm after sunset. I wonder how concrete, trees, and moving air change what the neighborhood feels like.</p>
              <p className="product-note-muted">A question to come back to</p>
              <div className="product-note-lines" aria-hidden="true"><span /><span /><span /></div>
            </article>
            <aside className="product-assistant" aria-label="Incantly suggestions">
              <div className="product-assistant-mark" aria-hidden="true">✦</div>
              <p className="product-assistant-kicker">Incantly can help</p>
              <p className="product-assistant-copy">Let&apos;s explore this together. Turn your observation into a visual comparison, find useful context, or experiment with a simple city scene.</p>
              <div className="product-chips">
                <a href="#product-visual">Create a visual</a>
                <a href="#product-simulation">Explore with a simulation</a>
                <a href="#product-context">Find related ideas</a>
              </div>
              <div className="product-input" role="textbox" aria-label="Ask anything about this note">Ask anything about this note… <span aria-hidden="true">↗</span></div>
            </aside>
          </div>
        </div>
      </div>
    </div>
  )
}

function Caption() {
  return (
    <div className="product-caption">
      <h3>Your thoughts, still together.</h3>
      <p>Ask questions and build on what you already wrote. Every answer, visual, and experiment stays connected to the note that started it.</p>
    </div>
  )
}

export const ProductShowcase = { Frame, Intro, Tabs, Surface, Caption }

export function IncantlyProductShowcase() {
  return (
    <ProductShowcase.Frame>
      <ProductShowcase.Intro />
      <ProductShowcase.Tabs />
      <ProductShowcase.Surface />
      <ProductShowcase.Caption />
    </ProductShowcase.Frame>
  )
}
