import LogoMark from "./Logo";
import { storeHref } from "@/lib/store-url";

export default function Footer() {
  return (
    <footer className="site-foot">
      <a
        className="site-foot-giant"
        href="#top"
        aria-label="Incantly — back to top"
      >
        <LogoMark size={42} />
        <span>
          Incantly<span className="nav-logo-dot">.</span>
        </span>
      </a>
      <p className="site-foot-tag">Your text, alive.</p>
      <p className="site-foot-by">
        Built by someone who couldn’t sit through another lecture.
      </p>
      <nav className="site-foot-links">
        <a href="#idea">The idea</a>
        <a href="#how">How it lives</a>
        <a href="#not-this">Not this</a>
        <a href="#faq">FAQ</a>
        <a href={storeHref("ios")}>App Store</a>
        <a href={storeHref("android")}>Google Play</a>
      </nav>
    </footer>
  );
}
