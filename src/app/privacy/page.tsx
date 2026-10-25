import type { Metadata } from 'next'
import Link from 'next/link'
import { Detail, Email, InShort, LegalDocument, LegalTable, type LegalSection } from '../../components/legal/LegalDocument'
import { legalEntity as e } from '../../lib/legal/company'

export const metadata: Metadata = {
  title: 'Privacy Policy · Incantly',
  description: 'How Genesis HQ collects, uses, shares and protects personal data when you use Incantly.',
}

const privacy = <Email value={e.privacyEmail} missing="privacy email" />

const sections: LegalSection[] = [
  {
    id: 'who-we-are',
    title: 'Who we are',
    body: <>
      <InShort>Genesis HQ makes Incantly and is responsible for your personal data. You can reach us about privacy at any time.</InShort>
      <p>Incantly is a product of <strong>{e.company}</strong>, a company organised under the laws of {e.country} (registration number <Detail value={e.registrationNumber} missing="CAC registration number" />), registered address <Detail value={e.registeredAddress} missing="registered address" />.</p>
      <p>Genesis HQ is the <strong>data controller</strong> for the personal data described in this policy. This means we decide why and how it is processed, under the Nigeria Data Protection Act 2023 (“NDPA”) and the General Application and Implementation Directive issued under it, the EU General Data Protection Regulation (“GDPR”), and the UK GDPR and Data Protection Act 2018.</p>
      <ul>
        <li><strong>Privacy contact and Data Protection Officer:</strong> {privacy}</li>
        <li><strong>Representative in the European Union</strong> (Article 27 GDPR): <Detail value={e.euRepresentative} missing="EU representative" /></li>
        <li><strong>Representative in the United Kingdom</strong> (Article 27 UK GDPR): <Detail value={e.ukRepresentative} missing="UK representative" /></li>
      </ul>
      <p>When a school, company or other organisation provides Incantly to you under a separate agreement, that organisation may be the controller for some of your data, and we act as its processor. In that case, its privacy notice also applies, and you should direct requests to it first.</p>
    </>,
  },
  {
    id: 'scope',
    title: 'What this policy covers',
    body: <>
      <p>This policy applies to personal data we process when you visit our websites, use the Incantly web, mobile or desktop applications, contact us, or otherwise interact with us (together, the “Service”). It does not cover third-party websites or services that the Service links to or lets you sign in with; their own policies apply.</p>
      <p>Words such as “personal data”, “processing”, “controller” and “processor” have the meanings given to them in the data-protection laws listed above.</p>
    </>,
  },
  {
    id: 'collect',
    title: 'The personal data we collect',
    body: <>
      <InShort>We collect what you give us (your account and your content), what the Service needs to work and stay secure (technical and usage data), and, only if you allow it, analytics and marketing data.</InShort>
      <h3>Data you give us</h3>
      <ul>
        <li><strong>Account data:</strong> your first and last name, email address, and the one-time codes used to verify it. If you sign in with Google, we receive your name, email address, profile picture and Google account identifier, as allowed by your Google settings. We do not receive your Google password.</li>
        <li><strong>Your content:</strong> notes and documents, their titles and version history, Spaces, Library sources (uploaded files such as PDFs, audio and documents; web addresses and the pages imported from them; video and audio transcripts; pasted text), sensitivity labels, and anything else you put into the Service. Your content may contain personal data about you or other people, depending on what you write or upload.</li>
        <li><strong>AI interactions:</strong> the questions, prompts and instructions you give AI features, the context we send with them, and the Output generated.</li>
        <li><strong>Communications:</strong> messages you send us, such as support requests, feedback, survey answers and legal or privacy requests, together with our replies.</li>
        <li><strong>Payment data</strong> (if you buy a Paid Plan): billing name, billing address, plan, transaction history and the last digits and expiry of your card. Full card details are collected and stored by our payment processor, not by us.</li>
      </ul>
      <h3>Data collected automatically</h3>
      <ul>
        <li><strong>Technical and log data:</strong> IP address, approximate location derived from it (country or city), browser and operating-system type, device type, language, referring page, and the date and time of requests.</li>
        <li><strong>Security data:</strong> sign-in events, session identifiers, failed attempts, rate-limit events and signals we use to detect abuse and protect accounts.</li>
        <li><strong>Usage data:</strong> features used, actions taken, errors encountered and performance measurements, linked to your account where needed to provide and support the Service.</li>
        <li><strong>Data stored on your device:</strong> to make the Service fast and usable offline, your browser stores copies of notes, pending changes, a random device identifier and import progress. See our <Link href="/cookies">Cookie Policy</Link>.</li>
        <li><strong>Cookies and similar technologies:</strong> strictly necessary cookies always; preference, analytics and marketing cookies only with your consent. See our <Link href="/cookies">Cookie Policy</Link>.</li>
      </ul>
      <h3>Data from others</h3>
      <ul>
        <li><strong>Sign-in providers</strong> such as Google, as described above.</li>
        <li><strong>Analytics and advertising partners,</strong> only if you have consented to those cookies, such as aggregated information about how you found Incantly.</li>
        <li><strong>Organisations</strong> that provide Incantly to you, such as your name, email and role.</li>
      </ul>
    </>,
  },
  {
    id: 'use',
    title: 'How we use personal data and our lawful bases',
    body: <>
      <InShort>We use your data to run Incantly for you, keep it secure, improve it, and meet legal duties. Analytics and marketing happen only with your consent.</InShort>
      <p>Data-protection law requires a lawful basis for each use of personal data. Under the GDPR and UK GDPR these are set out in Article 6, and under the NDPA in section 25. The bases we rely on are:</p>
      <LegalTable label="Purposes and lawful bases" head={['Purpose', 'Personal data', 'Lawful basis']} rows={[
        ['Create and manage your account, sign you in, and verify your email', 'Account data, security data', 'Performance of our contract with you'],
        ['Provide the Service: store, sync, search, organise and display your content, and keep it available offline', 'Your content, device storage, technical data', 'Performance of contract'],
        ['Run AI features you ask for, such as explanations, visuals and simulations', 'Your content, AI interactions', 'Performance of contract'],
        ['Process payments and manage subscriptions', 'Payment data, account data', 'Performance of contract; legal obligation (tax and accounting records)'],
        ['Provide support and respond to requests', 'Account data, communications, relevant content you share with us', 'Performance of contract; legitimate interests in helping you'],
        ['Send service messages, such as sign-in codes, security alerts, and changes to terms', 'Account data', 'Performance of contract; legal obligation'],
        ['Keep the Service and accounts secure, prevent fraud and abuse, and enforce our Terms', 'Security data, technical data, account data, content where needed for an investigation', 'Legitimate interests in protecting our users and the Service; legal obligation'],
        ['Understand how the Service is used and improve it using analytics cookies', 'Usage data, technical data, cookie identifiers', 'Consent'],
        ['Diagnose errors and measure performance using data that does not require cookie consent', 'Technical data, usage data', 'Legitimate interests in a reliable Service'],
        ['Send marketing emails about Incantly', 'Account data', 'Consent, or where permitted, legitimate interests for similar products, with an easy opt-out in every message'],
        ['Measure campaigns and show relevant ads with marketing cookies', 'Cookie identifiers, technical data', 'Consent'],
        ['Comply with law, respond to lawful requests, and establish or defend legal claims', 'Any relevant data', 'Legal obligation; legitimate interests'],
      ]} />
      <p>Where we rely on <strong>legitimate interests</strong>, we have weighed our interests against your rights and expectations and concluded that they are not overridden. You can ask us for details and object at any time (see <a href="#rights">Your rights</a>).</p>
      <p>Where we rely on <strong>consent</strong>, you can withdraw it at any time, as easily as you gave it, for example through Cookie settings or the unsubscribe link in an email. Withdrawal does not affect processing that already took place.</p>
      <p>Providing account data is necessary to enter into our contract; without it we cannot provide the Service. Everything else you share is up to you.</p>
    </>,
  },
  {
    id: 'ai',
    title: 'AI processing',
    body: <>
      <InShort>When you use AI features, the relevant part of your content is sent to an AI provider to produce the answer. It is not used to train AI models, and sources you mark Restricted are never sent.</InShort>
      <ul>
        <li><strong>What is sent.</strong> When you use an AI feature, we send the AI provider only what the request needs: your instruction and the relevant parts of your notes and Library sources.</li>
        <li><strong>Restricted sources.</strong> Library sources you label <strong>Restricted</strong> are never sent to an external AI provider. Label material Sensitive or Restricted to control how it is handled.</li>
        <li><strong>No training.</strong> We do not use your content or AI interactions to train general-purpose AI models. Our AI providers act as processors under contracts that prohibit them from using your data to train their models and that limit how long they may keep it.</li>
        <li><strong>Search indexing.</strong> To let you search and ask questions about your material, we create derived data such as text extracts and search indexes. These are treated as part of your content and deleted with it.</li>
        <li><strong>No automated decisions with legal effects.</strong> We do not make decisions based solely on automated processing that produce legal or similarly significant effects about you within the meaning of Article 22 GDPR or section 37 NDPA.</li>
        <li><strong>Human review.</strong> People at Genesis HQ do not read your content or AI interactions, except where you ask us to (for example in a support request), where needed to investigate abuse or a security incident, or where required by law.</li>
      </ul>
    </>,
  },
  {
    id: 'sensitive',
    title: 'Sensitive personal data',
    body: <>
      <p>We do not ask for sensitive personal data, such as data about health, religion, ethnicity, political opinions, sexual life or biometrics. If you choose to include such data in your content, we process it only to provide the Service as you direct, on the basis of your explicit choice to store it, and you can delete it at any time. Please do not add sensitive data about other people unless you have the right to do so.</p>
    </>,
  },
  {
    id: 'sharing',
    title: 'How we share personal data',
    body: <>
      <InShort>We share data only with service providers who help us run Incantly, when the law requires it, or when you ask us to. We never sell your personal data.</InShort>
      <p><strong>We do not sell your personal data, and we do not share it with third parties for their own advertising.</strong> We share it only as follows:</p>
      <ul>
        <li><strong>Service providers (processors)</strong> that process data on our behalf under written contracts requiring confidentiality, security and use only on our instructions. They fall into these categories: cloud hosting, content delivery and networking; databases and file storage; AI model providers; email delivery for sign-in codes and service messages; authentication; error monitoring; analytics and advertising measurement (only with your consent); payment processing; and customer support tools. A current list of our sub-processors is available on request from {privacy}.</li>
        <li><strong>Sign-in providers</strong> you choose, such as Google, which learn that you signed in to Incantly.</li>
        <li><strong>Organisations</strong> that provide Incantly to you, in line with their agreement with us.</li>
        <li><strong>At your direction,</strong> for example when you share a note or summary with someone.</li>
        <li><strong>Legal and safety.</strong> When we believe in good faith that disclosure is necessary to comply with law or a valid legal process, to protect the rights, property or safety of our users, the public or Genesis HQ, or to detect and prevent fraud or security issues. Where lawful, we will tell you about requests for your data.</li>
        <li><strong>Business transfers.</strong> If Genesis HQ is involved in a merger, acquisition, financing or sale of assets, personal data may be transferred under appropriate confidentiality protections. We will tell you before your data becomes subject to a different privacy policy.</li>
      </ul>
    </>,
  },
  {
    id: 'transfers',
    title: 'International transfers',
    body: <>
      <p>Genesis HQ is based in {e.country}, and our service providers may process data in other countries, including in Europe and the United States. When personal data is transferred across borders, we protect it as the law requires:</p>
      <ul>
        <li><strong>From the EU/EEA:</strong> to countries with an adequacy decision from the European Commission, or under the European Commission’s Standard Contractual Clauses with supplementary measures where needed.</li>
        <li><strong>From the UK:</strong> to countries covered by UK adequacy regulations, or under the UK International Data Transfer Agreement or the UK Addendum to the Standard Contractual Clauses.</li>
        <li><strong>From Nigeria:</strong> in line with sections 41 to 43 of the NDPA, to countries or organisations with an adequate level of protection, or on another lawful basis such as appropriate contractual safeguards or your consent after being told of the risks.</li>
      </ul>
      <p>You can ask for a copy of the safeguards we use by contacting {privacy}.</p>
    </>,
  },
  {
    id: 'retention',
    title: 'How long we keep personal data',
    body: <>
      <InShort>We keep your data while your account is open and delete it after you remove it or close your account, apart from limited records the law or security requires.</InShort>
      <LegalTable label="Retention periods" head={['Data', 'How long we keep it']} rows={[
        ['Account data', 'While your account is open, then deleted within 30 days of account closure'],
        ['Your content, including version history, derived text and search indexes', 'Until you delete it or close your account. Removed from live systems within 30 days, and from encrypted backups within a further 90 days'],
        ['AI interactions held by AI providers', 'Only as long as needed to return the result and, where a provider keeps short-term logs for abuse monitoring, no longer than its contract with us allows (at most 30 days)'],
        ['Data stored in your browser', 'Until you sign out, clear site data, or the app removes it after syncing'],
        ['Security and server logs', 'Up to 12 months, unless needed longer to investigate an incident'],
        ['Support communications', 'Up to 24 months after the conversation ends'],
        ['Payment and tax records', 'As long as tax and accounting laws require, generally six years'],
        ['Consent records (cookie and marketing choices)', 'While the consent applies, plus up to 3 years as proof that we obtained it'],
        ['Marketing preferences after you unsubscribe', 'A minimal suppression record, kept so we don’t contact you again'],
        ['Inactive accounts', 'Closed after 24 months of inactivity, following at least 30 days’ notice by email'],
      ]} />
      <p>We may keep data longer where the law requires it or to establish, exercise or defend legal claims, and only for as long as needed for that purpose.</p>
    </>,
  },
  {
    id: 'security',
    title: 'How we protect personal data',
    body: <>
      <p>We use technical and organisational measures appropriate to the risk, including encryption of data in transit (TLS), encryption at rest by our infrastructure providers, access controls based on least privilege, signed and verified requests between our web application and services, monitoring and logging, and staff confidentiality obligations. No system is perfectly secure, so we cannot guarantee absolute security.</p>
      <p>If a personal-data breach occurs that is likely to result in a risk to your rights, we will notify the relevant supervisory authority within 72 hours of becoming aware of it, as required by the NDPA, the GDPR and the UK GDPR. If the risk to you is high, we will also tell you without undue delay, with advice on steps you can take.</p>
    </>,
  },
  {
    id: 'rights',
    title: 'Your rights',
    body: <>
      <InShort>You can see, correct, export or delete your data, object to some uses, and withdraw consent. You can also complain to a regulator.</InShort>
      <p>Depending on where you live, you have some or all of these rights under the NDPA, the GDPR and the UK GDPR:</p>
      <ul>
        <li><strong>Access:</strong> to get confirmation that we process your data and a copy of it.</li>
        <li><strong>Rectification:</strong> to have inaccurate or incomplete data corrected.</li>
        <li><strong>Erasure:</strong> to have your data deleted, for example when it is no longer needed or you withdraw consent.</li>
        <li><strong>Restriction:</strong> to ask us to limit processing while a concern is resolved.</li>
        <li><strong>Portability:</strong> to receive data you gave us in a structured, commonly used, machine-readable format, and to have it sent to another provider where technically feasible.</li>
        <li><strong>Objection:</strong> to object to processing based on legitimate interests, and to object at any time to direct marketing.</li>
        <li><strong>Withdraw consent:</strong> at any time, without affecting earlier processing.</li>
        <li><strong>Automated decisions:</strong> not to be subject to decisions based solely on automated processing that significantly affect you.</li>
      </ul>
      <p>You can do many of these things yourself in the Service, by editing, exporting or deleting content and your account. For anything else, email {privacy}. We will reply within <strong>one month</strong> (within 30 days for Nigerian data subjects), and may extend this by up to two further months for complex requests, in which case we will tell you why. Requests are free unless they are manifestly unfounded or excessive. We may need to verify your identity first.</p>
      <h3>Complaints</h3>
      <p>We would like the chance to resolve your concern first. You also have the right to complain to a supervisory authority:</p>
      <ul>
        <li><strong>Nigeria:</strong> the Nigeria Data Protection Commission (NDPC), <a href="https://ndpc.gov.ng" rel="noopener noreferrer" target="_blank">ndpc.gov.ng</a></li>
        <li><strong>European Union:</strong> the data-protection authority in the member state where you live or work, or where an infringement took place; a directory is maintained by the European Data Protection Board at <a href="https://www.edpb.europa.eu/about-edpb/about-edpb/members_en" rel="noopener noreferrer" target="_blank">edpb.europa.eu</a></li>
        <li><strong>United Kingdom:</strong> the Information Commissioner’s Office (ICO), <a href="https://ico.org.uk/make-a-complaint/" rel="noopener noreferrer" target="_blank">ico.org.uk</a></li>
      </ul>
    </>,
  },
  {
    id: 'children',
    title: 'Children',
    body: <>
      <p>Incantly is not intended for children under {e.minimumAge}, and we do not knowingly collect personal data from them. Under the NDPA, anyone under 18 is a child, so Nigerian users aged {e.minimumAge} to 17 may use Incantly only with the consent of a parent or guardian. In the EU, users under their member state’s age of digital consent (13 to 16) also need a parent or guardian’s consent. We may take reasonable steps to verify that consent.</p>
      <p>If you believe a child has given us personal data without the required consent, contact {privacy} and we will delete it.</p>
    </>,
  },
  {
    id: 'cookies',
    title: 'Cookies and similar technologies',
    body: <>
      <p>We use strictly necessary cookies and browser storage to run the Service. We use preference, analytics and marketing cookies only if you allow them, and you can change your choice at any time in Cookie settings, available in the footer of every page. We honour the Global Privacy Control signal as a refusal of marketing cookies. Full details are in our <Link href="/cookies">Cookie Policy</Link>.</p>
    </>,
  },
  {
    id: 'marketing',
    title: 'Marketing communications',
    body: <>
      <p>We send marketing emails only where the law allows: with your consent, or, where permitted, about similar Incantly products and features if you are an existing user and have not opted out. Every marketing email has an unsubscribe link, and you can also opt out by contacting {privacy}. Service messages, such as sign-in codes, security alerts and important changes, are not marketing and will continue while you have an account.</p>
    </>,
  },
  {
    id: 'changes',
    title: 'Changes to this policy',
    body: <>
      <p>We will update this policy when our practices or the law change. If we make material changes, we will tell you by email or in the Service before they take effect and, where the law requires, ask for your consent. The “Last updated” date at the top shows when it last changed.</p>
    </>,
  },
  {
    id: 'contact',
    title: 'Contact us',
    body: <>
      <p>For any question about this policy or your personal data, contact our privacy team and Data Protection Officer at {privacy}, or write to {e.company}, <Detail value={e.registeredAddress} missing="registered address" />, {e.country}.</p>
    </>,
  },
]

export default function PrivacyPage() {
  return <LegalDocument current="/privacy" title="Privacy Policy" sections={sections} intro={<>
    <p>Your notes are personal. This policy explains what personal data Genesis HQ collects when you use Incantly, why, who we share it with, how long we keep it, and the rights you have, whether you are in Nigeria, the European Union, the United Kingdom or elsewhere.</p>
  </>} />
}
