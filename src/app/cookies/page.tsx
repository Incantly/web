import type { Metadata } from 'next'
import Link from 'next/link'
import { CookieSettingsButton } from '../../components/consent/CookieConsent'
import { Email, InShort, LegalDocument, LegalTable, type LegalSection } from '../../components/legal/LegalDocument'
import { buttonSecondary } from '../../components/product/workspace/ui'
import { legalEntity as e } from '../../lib/legal/company'
import { CONSENT_COOKIE } from '../../lib/consent/consent'

export const metadata: Metadata = {
  title: 'Cookie Policy · Incantly',
  description: 'The cookies and browser storage Incantly uses, and how to control them.',
}

const code = (value: string) => <code className="rounded bg-surface px-1 py-0.5 text-[0.8125rem] text-foreground">{value}</code>

const sections: LegalSection[] = [
  {
    id: 'what',
    title: 'What cookies and similar technologies are',
    body: <>
      <p>Cookies are small text files that a website stores in your browser. Similar technologies, such as <strong>local storage</strong> and <strong>IndexedDB</strong>, let a website keep data in your browser too, and pixels or SDKs can do the same in emails and apps. In this policy, “cookies” means all of these.</p>
      <p><strong>First-party</strong> cookies are set by Incantly. <strong>Third-party</strong> cookies are set by another company’s domain. Session cookies are deleted when you close your browser; persistent cookies stay until they expire or you delete them.</p>
    </>,
  },
  {
    id: 'consent',
    title: 'How we ask for your consent',
    body: <>
      <InShort>Only strictly necessary cookies run by default. Everything else stays off until you say yes, and you can change your mind at any time.</InShort>
      <ul>
        <li>On your first visit, we show a banner where you can <strong>Accept all</strong>, <strong>Reject all</strong>, or <strong>Customize</strong> your choice by category. Rejecting is as easy as accepting, and no optional category is switched on in advance.</li>
        <li>Until you choose, and whenever you reject, we use only strictly necessary cookies.</li>
        <li>We remember your choice in the {code(CONSENT_COOKIE)} cookie for six months, then ask again. We also ask again if we add new categories or purposes.</li>
        <li>We treat a <strong>Global Privacy Control</strong> signal from your browser as a refusal of marketing cookies, whatever you chose in the banner.</li>
        <li>You can change or withdraw your consent at any time with the Cookie settings link in the footer of every page, or with the button below.</li>
      </ul>
      <p><CookieSettingsButton className={buttonSecondary}>Open cookie settings</CookieSettingsButton></p>
    </>,
  },
  {
    id: 'necessary',
    title: 'Strictly necessary',
    body: <>
      <p>These are essential to provide the Service you ask for, so they don’t require consent under the EU ePrivacy Directive, UK PECR or the NDPA. They keep you signed in, protect your account, remember your cookie choice, and let your notes work offline.</p>
      <LegalTable label="Strictly necessary cookies" head={['Name', 'Type', 'Purpose', 'Duration']} rows={[
        [code('better-auth.session_token'), 'First-party cookie, HTTP-only', 'Keeps you signed in and identifies your session securely. On secure connections the name starts with __Secure-.', 'Up to 7 days, renewed while you use Incantly'],
        [code('better-auth.session_data'), 'First-party cookie, HTTP-only', 'A short-lived, signed copy of your session so pages load without re-checking it each time.', 'A few minutes'],
        [code('better-auth.state'), 'First-party cookie, HTTP-only', 'Protects Google sign-in against forgery by linking the request to the response.', 'Around 10 minutes, during sign-in only'],
        [code(CONSENT_COOKIE), 'First-party cookie', 'Records your cookie choices and when you made them.', '6 months'],
        [code('incantly-notes'), 'IndexedDB', 'Copies of your notes and changes waiting to sync, so Incantly works offline and doesn’t lose edits.', 'Until synced, you sign out, or you clear site data'],
        [code('incantly-documents'), 'IndexedDB', 'Local copies of documents open in the editor.', 'Until you clear site data'],
        [<span key="names" className="flex flex-col gap-1">{code('incantly-assets')}{code('incantly-asset-previews')}</span>, 'IndexedDB', 'Images and file previews used in your notes, so they display quickly and offline.', 'Until you clear site data'],
        [code('incantly-api'), 'IndexedDB', 'Remembers uploads and imports in progress, so they resume after a reload and a retry is never applied twice.', 'Until the upload or import finishes'],
        [code('incantly-client-id'), 'Local storage', 'A random identifier for this browser, used to sync edits from several devices without conflicts. It is not used for tracking.', 'Until you clear site data'],
        [code('incantly-imports:<account>'), 'Local storage', 'Tracks files and web pages you are importing, so progress survives a page reload.', 'Until the import finishes'],
      ]} />
    </>,
  },
  {
    id: 'preferences',
    title: 'Preferences',
    body: <>
      <p>Preference cookies remember choices you make, such as layout and display settings, between visits. <strong>We do not currently use any preference cookies.</strong> If we add them, we will list them here before switching them on, and they will run only with your consent.</p>
    </>,
  },
  {
    id: 'analytics',
    title: 'Analytics',
    body: <>
      <p>Analytics cookies help us understand how people use Incantly, such as which features they open, how they move between pages, and where errors happen, so we can improve the Service. We configure analytics to use pseudonymous identifiers and to truncate or mask IP addresses where the tool allows.</p>
      <p><strong>We do not currently use any analytics cookies.</strong> When we introduce an analytics provider, we will list each cookie here with its provider, purpose and duration, and it will run only if you allow Analytics.</p>
    </>,
  },
  {
    id: 'marketing',
    title: 'Marketing',
    body: <>
      <p>Marketing cookies and pixels help us measure whether our campaigns work and show relevant Incantly ads on other websites. They may be set by advertising partners, who can combine them with other information they hold under their own privacy policies.</p>
      <p><strong>We do not currently use any marketing cookies.</strong> If we add them, we will list them here first, they will run only if you allow Marketing, and they will stay off while your browser sends a Global Privacy Control signal.</p>
    </>,
  },
  {
    id: 'third-party',
    title: 'Third-party cookies',
    body: <>
      <p>If you choose to sign in with Google, you are taken to Google’s sign-in page, where Google sets its own cookies on its domain under the <a href="https://policies.google.com/technologies/cookies" rel="noopener noreferrer" target="_blank">Google cookie policy</a>. We do not control those cookies.</p>
      <p>Imported web pages and transcripts are fetched by our servers and shown as text, so they do not place cookies in your browser.</p>
    </>,
  },
  {
    id: 'manage',
    title: 'Managing cookies in your browser',
    body: <>
      <p>As well as using Cookie settings, you can block or delete cookies and site data in your browser’s settings. Each browser explains how: <a href="https://support.google.com/chrome/answer/95647" rel="noopener noreferrer" target="_blank">Chrome</a>, <a href="https://support.apple.com/guide/safari/manage-cookies-sfri11471" rel="noopener noreferrer" target="_blank">Safari</a>, <a href="https://support.mozilla.org/kb/clear-cookies-and-site-data-firefox" rel="noopener noreferrer" target="_blank">Firefox</a>, and <a href="https://support.microsoft.com/microsoft-edge/delete-cookies-in-microsoft-edge-63947406-40ac-c3b8-57b9-2a946a29ae09" rel="noopener noreferrer" target="_blank">Edge</a>.</p>
      <p>If you block strictly necessary cookies, you won’t be able to sign in. If you clear Incantly’s site data, notes saved in your browser that have not yet synced will be lost, so make sure you are online and your notes show as saved first.</p>
    </>,
  },
  {
    id: 'regions',
    title: 'Rules where you live',
    body: <>
      <p>We apply the same opt-in approach to everyone, which meets the rules in each region we serve:</p>
      <ul>
        <li><strong>European Union:</strong> Article 5(3) of the ePrivacy Directive, as implemented in each member state, requires prior consent for storing or reading anything on your device that isn’t strictly necessary. Consent must meet the GDPR standard: freely given, specific, informed and unambiguous.</li>
        <li><strong>United Kingdom:</strong> Regulation 6 of the Privacy and Electronic Communications Regulations 2003 (PECR), as amended by the Data (Use and Access) Act 2025, together with the UK GDPR. Although UK law now allows some low-risk analytics without consent, we still ask for it.</li>
        <li><strong>Nigeria:</strong> the Nigeria Data Protection Act 2023 and the General Application and Implementation Directive treat cookie identifiers as personal data, requiring a lawful basis and clear information. We rely on consent for all non-essential cookies.</li>
      </ul>
    </>,
  },
  {
    id: 'changes',
    title: 'Changes and contact',
    body: <>
      <p>We will update this policy whenever we add, change or remove cookies, and ask for your consent again where needed. The “Last updated” date at the top shows when it last changed. For questions, contact <Email value={e.privacyEmail} missing="privacy email" />. For more about how we use personal data, read our <Link href="/privacy">Privacy Policy</Link>.</p>
    </>,
  },
]

export default function CookiesPage() {
  return <LegalDocument current="/cookies" title="Cookie Policy" sections={sections} intro={<>
    <p>This policy explains the cookies and browser storage Incantly uses, why we use them, and how you can control them. It works alongside our <Link href="/privacy">Privacy Policy</Link>.</p>
  </>} />
}
