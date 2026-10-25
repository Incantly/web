import type { Metadata } from 'next'
import Link from 'next/link'
import { pageMetadata } from '../../lib/brand/siteMetadata'
import { Detail, Email, InShort, LegalDocument, type LegalSection } from '../../components/legal/LegalDocument'
import { legalEntity as e } from '../../lib/legal/company'

export const metadata: Metadata = pageMetadata({ title: 'Terms of Service · Incantly', description: 'The agreement between you and Genesis HQ for using Incantly.', path: '/terms' })

const sections: LegalSection[] = [
  {
    id: 'about',
    title: 'About these terms',
    body: <>
      <InShort>These terms are a contract between you and Genesis HQ, the company that makes Incantly. By using Incantly you agree to them.</InShort>
      <p>These Terms of Service (“Terms”) govern your access to and use of Incantly, including our websites, web application, mobile and desktop applications, application programming interfaces, and any related features, content and services (together, the “Service”).</p>
      <p>Incantly is a product of <strong>{e.company}</strong>, a company organised under the laws of {e.country} (registration number <Detail value={e.registrationNumber} missing="CAC registration number" />), with its registered address at <Detail value={e.registeredAddress} missing="registered address" /> (“Genesis HQ”, “we”, “us” or “our”).</p>
      <p>By creating an account, signing in, or otherwise using the Service, you confirm that you have read and agree to these Terms and to our <Link href="/privacy">Privacy Policy</Link> and <Link href="/cookies">Cookie Policy</Link>, which explain how we handle personal data and cookies. If you do not agree, do not use the Service.</p>
      <p>If you use the Service on behalf of a school, company or other organisation, you confirm that you have authority to accept these Terms for it, and “you” includes that organisation.</p>
      <p>Some features may come with additional terms, which we will show you before you use them. If additional terms conflict with these Terms, the additional terms apply to that feature.</p>
    </>,
  },
  {
    id: 'eligibility',
    title: 'Who can use Incantly',
    body: <>
      <InShort>You must be at least {e.minimumAge}. Younger users in some countries, including anyone under 18 in Nigeria, need a parent or guardian’s consent.</InShort>
      <p>You must be at least <strong>{e.minimumAge} years old</strong> to use the Service. The Service is not directed at children under {e.minimumAge}, and they may not create an account.</p>
      <p>If you are under the age at which you can consent to the processing of your personal data in your country, you may use the Service only with the consent and supervision of a parent or legal guardian, who must also agree to these Terms. This includes:</p>
      <ul>
        <li><strong>Nigeria:</strong> users under 18, as required by the Nigeria Data Protection Act 2023;</li>
        <li><strong>European Union:</strong> users under the age of digital consent set by their member state, which ranges from 13 to 16;</li>
        <li><strong>United Kingdom:</strong> users under 13 may not use the Service.</li>
      </ul>
      <p>If we learn that someone has used the Service in breach of these age requirements, we may suspend the account and delete the related personal data. Parents or guardians who believe this has happened can contact us at <Email value={e.privacyEmail} missing="privacy email" />.</p>
      <p>You may not use the Service if you are barred from doing so under the laws that apply to you, or if we have previously terminated your account for breaching these Terms.</p>
    </>,
  },
  {
    id: 'account',
    title: 'Your account',
    body: <>
      <InShort>Keep your sign-in secure and your details accurate. You are responsible for what happens in your account.</InShort>
      <p>To use most of the Service you need an account. You can sign in with a one-time code sent to your email address or, where offered, with a third-party sign-in provider such as Google. When you create an account you agree to:</p>
      <ul>
        <li>give accurate, current and complete information, and keep it up to date;</li>
        <li>keep access to your email account and any sign-in provider secure, because anyone who controls them can sign in to Incantly as you;</li>
        <li>not share your account, transfer it, or let anyone else use it; an account is for one person;</li>
        <li>tell us promptly at <Email value={e.supportEmail} missing="support email" /> if you believe your account has been accessed without your permission.</li>
      </ul>
      <p>You are responsible for all activity that happens under your account, except where it results from our failure to take reasonable security measures. We may ask you to verify your identity before acting on requests about your account.</p>
    </>,
  },
  {
    id: 'service',
    title: 'The Service',
    body: <>
      <InShort>Incantly helps you write notes, collect sources, and turn ideas into visuals and simulations. We keep improving it, so features may change.</InShort>
      <p>Incantly lets you write and organise notes, group them into Spaces, keep source material in your Library (such as files, web pages, transcripts and pasted text), search across your material, and use artificial-intelligence (“AI”) features to explain, visualise and explore ideas, including interactive visuals and simulations.</p>
      <p>Parts of the Service store copies of your notes in your browser or device so they keep working offline and sync when you reconnect. Clearing your browser storage may remove changes that have not yet synced.</p>
      <p>We are constantly developing the Service. We may add, change or remove features, and may offer some features as early access, preview or beta features. Beta features may be incomplete, may change or be withdrawn without notice, and are provided for evaluation. If we make a change that materially reduces the core functionality you rely on, we will give you reasonable notice where practicable, and if you have paid in advance for a plan that is materially affected, you may cancel and receive a pro-rata refund of the unused period.</p>
      <p>We aim to keep the Service available and secure, but we do not promise that it will be uninterrupted or free of errors. We may need to suspend it temporarily for maintenance, updates, security or reasons beyond our control.</p>
    </>,
  },
  {
    id: 'content',
    title: 'Your content',
    body: <>
      <InShort>What you put into Incantly stays yours. You give us only the permission we need to run the Service for you.</InShort>
      <h3>What counts as your content</h3>
      <p>“Your Content” means everything you or people you authorise put into the Service, including notes, documents, Spaces, Library sources, uploaded files, imported web pages and transcripts, questions you ask, and any output the Service generates for you from them.</p>
      <h3>Ownership</h3>
      <p>As between you and us, you keep all rights you have in Your Content. We do not claim ownership of it.</p>
      <h3>The permission you give us</h3>
      <p>You grant Genesis HQ a worldwide, non-exclusive, royalty-free licence to host, store, copy, process, transmit, display, adapt (for example by reformatting or indexing) and create derived data from Your Content, <strong>solely</strong> to provide, secure, maintain and support the Service for you, to comply with law, and to enforce these Terms. This includes sending Your Content to our service providers, such as hosting and AI providers, under contracts that limit their use of it to providing services to us. The licence lasts while Your Content is in the Service and ends when it is deleted, except for copies kept for the limited periods described in our <Link href="/privacy#retention">Privacy Policy</Link>.</p>
      <p>We do not use Your Content to train general-purpose AI models, and we do not sell it.</p>
      <h3>Your responsibilities</h3>
      <p>You are responsible for Your Content. You confirm that you have all rights, licences and permissions needed to put it into the Service and to let us process it as described in these Terms, including content created by other people that you add to your Library. You must not add content that breaches these Terms or the law.</p>
      <p>You can label Library sources by sensitivity. A source labelled <strong>Restricted</strong> is never sent to an external AI provider, so AI features that need it will not work. Choose labels that fit your material.</p>
      <h3>Keeping copies</h3>
      <p>We work hard to protect Your Content, but no service is immune to loss. Keep your own copies of anything important; you can export notes from the Service.</p>
    </>,
  },
  {
    id: 'ai',
    title: 'AI features',
    body: <>
      <InShort>AI can be wrong. Check what it produces before relying on it, especially for anything important.</InShort>
      <p>Some features use AI to generate text, explanations, visuals, simulations, search results and other output (“Output”) from Your Content and your instructions. You should know that:</p>
      <ul>
        <li><strong>Output may be inaccurate, incomplete or out of date.</strong> AI can produce statements that sound confident but are wrong, and simulations simplify the real world. Evaluate Output yourself and check it against reliable sources.</li>
        <li><strong>Output is not professional advice.</strong> It is not medical, legal, financial, engineering, safety or other professional advice, and must not be the only basis for decisions that affect you or anyone else.</li>
        <li><strong>Output may not be unique.</strong> Other users may receive similar Output for similar requests.</li>
        <li><strong>You are responsible for how you use Output,</strong> including making sure your use complies with the law, your school’s or employer’s rules, and other people’s rights, such as academic-integrity policies.</li>
      </ul>
      <p>Subject to these Terms and to any rights of third parties, we assign to you whatever rights we have in Output generated for you. You must not represent Output as human-generated where that would be misleading.</p>
      <p>You must not use AI features to create content that breaches the acceptable-use rules below, to develop competing AI models, or to extract or reproduce the underlying models, prompts or systems.</p>
    </>,
  },
  {
    id: 'acceptable-use',
    title: 'Acceptable use',
    body: <>
      <InShort>Use Incantly lawfully and respectfully, and don’t attack, overload or misuse it.</InShort>
      <p>You agree not to, and not to help anyone else to:</p>
      <ul>
        <li>break any law or regulation, or infringe anyone’s intellectual-property, privacy, publicity or other rights;</li>
        <li>upload, generate or share content that sexually exploits or endangers children; this is always reported to the relevant authorities;</li>
        <li>upload, generate or share content that is unlawful, defamatory, harassing, hateful, threatening, that incites violence, or that promotes self-harm or terrorism;</li>
        <li>use the Service to create malware, phishing, spam, fraud, or deceptive content such as impersonation or disinformation intended to cause harm;</li>
        <li>collect or process other people’s personal data without a lawful basis, or put special categories of personal data about others into the Service without the right to do so;</li>
        <li>access or try to access accounts, data or systems you are not authorised to access, or probe, scan or test the vulnerability of the Service except through a disclosure programme we have approved;</li>
        <li>interfere with or disrupt the Service, including by overloading it, bypassing rate limits or security controls, or introducing harmful code;</li>
        <li>scrape, crawl or extract data from the Service by automated means, except through interfaces we provide for that purpose;</li>
        <li>copy, modify, reverse engineer, decompile or create derivative works of the Service, except where the law expressly permits it despite this restriction;</li>
        <li>resell, sublicense or provide the Service to others as a service bureau, or use it to build a competing product;</li>
        <li>use the Service for high-risk activities where failure could lead to death, injury or serious environmental or property damage.</li>
      </ul>
      <p>We may review content and activity where we reasonably believe it is necessary to investigate a breach of these Terms, respond to a report, keep the Service secure, or comply with law. We may remove or restrict access to content that breaches these Terms.</p>
    </>,
  },
  {
    id: 'our-rights',
    title: 'Our intellectual property',
    body: <>
      <p>The Service, including its software, design, text, graphics, logos and the “Incantly” name, is owned by Genesis HQ or its licensors and protected by intellectual-property laws. Subject to these Terms, we grant you a limited, personal, non-exclusive, non-transferable, revocable licence to use the Service for its intended purpose. We reserve all rights not expressly granted.</p>
      <p>Open-source components included in the Service are licensed under their own licences, which take precedence for those components.</p>
      <p>If you send us ideas, suggestions or feedback, you allow us to use them without restriction or payment to you. This does not give us any rights in Your Content.</p>
    </>,
  },
  {
    id: 'third-parties',
    title: 'Third-party services and content',
    body: <>
      <p>The Service may let you sign in with, import from, link to, or connect with services run by third parties, such as Google sign-in, web pages and video transcripts. Those services are governed by their own terms and privacy policies, and we are not responsible for them. Importing or linking to third-party content does not give you any right to use it beyond what its owner or the law allows.</p>
    </>,
  },
  {
    id: 'plans',
    title: 'Paid plans and payment',
    body: <>
      <InShort>Incantly may offer paid plans. Before you pay, you’ll see the price, what it includes, and how renewal and cancellation work.</InShort>
      <p>Some features may require a paid subscription (“Paid Plan”). This section applies if and when you buy one.</p>
      <ul>
        <li><strong>Price and taxes.</strong> Prices are shown before you buy and include or add applicable taxes as stated at checkout.</li>
        <li><strong>Billing and renewal.</strong> Subscriptions renew automatically at the end of each billing period at the then-current price unless you cancel before renewal. We will remind you before an annual plan renews.</li>
        <li><strong>Payment processing.</strong> Payments are handled by third-party payment processors. We do not receive or store your full card details.</li>
        <li><strong>Cancellation.</strong> You can cancel at any time in your account settings. Cancellation takes effect at the end of the current billing period, and you keep access until then.</li>
        <li><strong>Price changes.</strong> We will give you at least 30 days’ notice of a price increase. It applies from your next billing period, and you may cancel before then.</li>
        <li><strong>Refunds.</strong> Except where these Terms or the law say otherwise, payments are non-refundable for partial periods.</li>
        <li><strong>Right of withdrawal (EU and UK consumers).</strong> If you are a consumer in the EU or UK, you have a 14-day right to withdraw from a purchase. When you ask us to start a Paid Plan immediately, you acknowledge that if you withdraw within 14 days you may be charged for the service supplied until you withdraw, and that you lose the right to withdraw once the service has been fully provided.</li>
        <li><strong>Failed payments.</strong> If a payment fails, we may suspend paid features until it is resolved. Your free features and Your Content remain accessible.</li>
      </ul>
    </>,
  },
  {
    id: 'copyright',
    title: 'Copyright and content complaints',
    body: <>
      <p>We respect intellectual-property rights. If you believe content in the Service infringes your copyright or other rights, or is otherwise unlawful, send a notice to <Email value={e.legalEmail} missing="legal email" /> including:</p>
      <ul>
        <li>your name and contact details;</li>
        <li>a description of the work or right you say is infringed;</li>
        <li>enough information for us to locate the content;</li>
        <li>a statement that you believe in good faith that the use is not authorised by the rights holder or the law; and</li>
        <li>a statement that the information in your notice is accurate and that you are the rights holder or authorised to act for them.</li>
      </ul>
      <p>We will review notices promptly, may remove or disable access to the content, and will tell the affected user where appropriate so they can respond. We will terminate the accounts of repeat infringers in appropriate circumstances.</p>
    </>,
  },
  {
    id: 'termination',
    title: 'Suspension and termination',
    body: <>
      <InShort>You can leave at any time. We may suspend or close accounts that break these Terms, and we’ll give you a chance to export your content where we can.</InShort>
      <p><strong>By you.</strong> You may stop using the Service and delete your account at any time. Deleting your account deletes Your Content as described in the <Link href="/privacy#retention">Privacy Policy</Link>.</p>
      <p><strong>By us.</strong> We may suspend or terminate your access to all or part of the Service if you materially or repeatedly breach these Terms, if required by law or a competent authority, if your use creates a security or legal risk for us or others, or if your account has been inactive for more than 24 months (we will email you at least 30 days before closing an inactive account). Where reasonable, we will tell you the reason and give you an opportunity to fix the problem first.</p>
      <p><strong>Discontinuing the Service.</strong> If we decide to discontinue the Service entirely, we will give you at least 60 days’ notice and refund any prepaid fees for the period after it ends.</p>
      <p><strong>Exporting your content.</strong> Unless we terminate for serious misuse or are legally prohibited from doing so, you will have at least 30 days after termination to export Your Content.</p>
      <p>Sections that by their nature should survive termination will survive, including those on Your Content licence (for retained copies), intellectual property, disclaimers, limitation of liability, governing law and disputes.</p>
    </>,
  },
  {
    id: 'disclaimers',
    title: 'Disclaimers',
    body: <>
      <p>To the fullest extent permitted by law, the Service and all Output are provided <strong>“as is” and “as available”</strong>. We do not make warranties or representations of any kind, express or implied, including warranties of merchantability, fitness for a particular purpose, accuracy, non-infringement, or that the Service will be uninterrupted, secure or error-free.</p>
      <p><strong>Nothing in these Terms affects your statutory rights as a consumer</strong>, including under the Federal Competition and Consumer Protection Act 2018 (Nigeria), the consumer laws of the EU member state where you live, or the Consumer Rights Act 2015 (UK), which require digital content and services to be of satisfactory quality, fit for purpose, as described, and supplied with reasonable care and skill.</p>
    </>,
  },
  {
    id: 'liability',
    title: 'Limitation of liability',
    body: <>
      <p><strong>Nothing in these Terms limits or excludes liability</strong> for death or personal injury caused by negligence, for fraud or fraudulent misrepresentation, for gross negligence or wilful misconduct, or for any other liability that cannot be limited or excluded by law.</p>
      <p><strong>If you are a consumer in the EU or UK,</strong> we are responsible for loss or damage you suffer that is a foreseeable result of our breach of these Terms or our failure to use reasonable care and skill. Loss is foreseeable if it is obvious that it will happen or if, when you agreed to these Terms, both of us knew it might happen. We are not responsible for loss that is not foreseeable, or for business losses, since the Service is provided for domestic and private use.</p>
      <p><strong>For everyone else, and to the extent permitted by law:</strong></p>
      <ul>
        <li>we are not liable for any indirect, incidental, special, consequential or punitive damages, or for loss of profits, revenue, business, goodwill or anticipated savings, however caused; and</li>
        <li>our total liability arising out of or relating to these Terms or the Service is limited to the greater of (a) the amounts you paid us for the Service in the 12 months before the event giving rise to the claim, and (b) one hundred United States dollars (US$100) or its equivalent in your local currency.</li>
      </ul>
    </>,
  },
  {
    id: 'indemnity',
    title: 'Indemnity',
    body: <>
      <p>If you use the Service for business, professional or organisational purposes, you will defend and indemnify Genesis HQ, its officers, employees and agents against claims, losses and expenses (including reasonable legal fees) arising from Your Content, your breach of these Terms, or your violation of law or of anyone’s rights. This section does not apply to consumers to the extent the law does not allow it.</p>
    </>,
  },
  {
    id: 'changes',
    title: 'Changes to these Terms',
    body: <>
      <p>We may update these Terms to reflect changes to the Service, the law, or how we operate. If a change materially affects your rights or obligations, we will notify you by email or in the Service at least <strong>30 days</strong> before it takes effect, unless the change is required sooner by law or to address a security risk. The “Last updated” date at the top shows when these Terms last changed.</p>
      <p>If you do not agree to the updated Terms, you may stop using the Service and delete your account before they take effect. If you continue to use the Service after that, the updated Terms apply.</p>
    </>,
  },
  {
    id: 'disputes',
    title: 'Governing law and disputes',
    body: <>
      <InShort>Nigerian law governs these Terms. If you live in the EU or UK, you keep the protection of your local consumer law and can bring claims in your local courts.</InShort>
      <p><strong>Talk to us first.</strong> Most concerns can be resolved quickly. Before starting formal proceedings, please contact us at <Email value={e.legalEmail} missing="legal email" /> with a description of the problem, and give us 30 days to try to resolve it informally.</p>
      <p><strong>Governing law.</strong> These Terms and any dispute arising out of or in connection with them or the Service are governed by the laws of the Federal Republic of Nigeria.</p>
      <p><strong>Courts.</strong> Subject to the next paragraph, the parties submit to the exclusive jurisdiction of {e.courts}.</p>
      <p><strong>Consumers in the EU and UK.</strong> If you are a consumer habitually resident in an EU member state or the United Kingdom, the choice of Nigerian law does not deprive you of the protection of the mandatory provisions of the law of the country where you live, and you may bring proceedings about these Terms in the courts of that country. In the UK you may choose the courts of England and Wales, Scotland or Northern Ireland, depending on where you live.</p>
    </>,
  },
  {
    id: 'general',
    title: 'General',
    body: <>
      <ul>
        <li><strong>Entire agreement.</strong> These Terms, together with the policies they refer to and any additional terms for specific features, are the entire agreement between you and us about the Service.</li>
        <li><strong>Severability.</strong> If any provision is found unenforceable, the rest remain in effect, and the unenforceable provision is applied to the greatest extent permitted.</li>
        <li><strong>No waiver.</strong> If we do not enforce a provision immediately, we can still enforce it later.</li>
        <li><strong>Assignment.</strong> You may not transfer your rights under these Terms without our consent. We may transfer ours to an affiliate or as part of a merger, acquisition or sale of assets, provided your rights are not reduced; we will tell you if this happens.</li>
        <li><strong>Events beyond our control.</strong> We are not responsible for delays or failures caused by events outside our reasonable control, such as natural disasters, power or network outages, war, terrorism, strikes or government action.</li>
        <li><strong>Notices.</strong> We may send notices to the email address on your account or show them in the Service. You can send notices to <Email value={e.legalEmail} missing="legal email" />.</li>
        <li><strong>Language.</strong> These Terms are written in English. If we provide a translation, the English version prevails to the extent permitted by law.</li>
        <li><strong>No third-party rights.</strong> Nobody other than you and Genesis HQ has any right to enforce these Terms.</li>
      </ul>
    </>,
  },
  {
    id: 'contact',
    title: 'Contact us',
    body: <>
      <p>{e.company}<br /><Detail value={e.registeredAddress} missing="registered address" /><br />{e.country}</p>
      <p>General support: <Email value={e.supportEmail} missing="support email" /><br />Legal notices: <Email value={e.legalEmail} missing="legal email" /><br />Privacy: <Email value={e.privacyEmail} missing="privacy email" /></p>
    </>,
  },
]

export default function TermsPage() {
  return <LegalDocument current="/terms" title="Terms of Service" sections={sections} intro={<>
    <p>Welcome to Incantly. These Terms explain the rules for using Incantly, what you can expect from us, and what we expect from you. Each section opens with a short summary in plain language; the full text below each summary is what applies.</p>
  </>} />
}
