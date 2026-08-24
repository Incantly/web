import { storeHref } from '@/lib/store-url'

export default function GetTheApp() {
  return (
    <section className="chap get-app" id="get-app" aria-labelledby="get-app-title">
      <div className="chap-grid" aria-hidden />
      <p className="chap-kicker">Get the app</p>
      <h2 className="chap-display" id="get-app-title">
        Keep the
        <br />
        living page.
      </h2>
      <p className="chap-line">iPhone, iPad, Android phone, and tablet.</p>
      <div className="get-app-ctas">
        <a className="get-app-cta" href={storeHref('ios')}>
          App Store
        </a>
        <a className="get-app-cta get-app-cta--ghost" href={storeHref('android')}>
          Google Play
        </a>
      </div>
    </section>
  )
}
