import type { Metadata } from "next";
import Link from "next/link";
import { LEGAL_CONTACT, LegalPage } from "@/components/landing/legal";

export const metadata: Metadata = {
  title: "Terms of Service | Hairpin",
  description: "The terms for using Hairpin hairstyle discovery and AI try-on.",
};

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service">
      <p>
        These terms govern your use of Hairpin, a hairstyle discovery and AI try-on service. By using Hairpin you agree to them. If you do not agree, please do not use the
        service.
      </p>

      <h2>The service</h2>
      <p>
        Hairpin lets you browse hairstyle references, preview styles on your own photo using AI, and assemble notes to share with a barber or stylist. We may change, add or
        remove features at any time.
      </p>

      <h2>Your account</h2>
      <p>
        You sign in with Google. You are responsible for activity on your account and for keeping your sign-in secure. You must be at least 13 years old, or the minimum age
        required in your country, to use Hairpin.
      </p>

      <h2>Your photos and content</h2>
      <p>
        You keep ownership of the photos and images you submit. You give us permission to process them only as needed to provide the features you ask for, including sending
        them to the AI services that generate your results. You confirm that you have the right to use each image, and that anyone shown in it has agreed to its use. Do not
        submit images that are unlawful, that depict minors in a sexual way, or that you do not have permission to use.
      </p>

      <h2>Cuts you share publicly</h2>
      <p>
        You can keep a cut private on your device, or choose &ldquo;Share publicly (reviewed first)&rdquo;. If you share, you keep ownership of the photo, and you give Hairpin a
        non-exclusive, free licence to store a resized copy and to show that photo and the details you entered to other Hairpin members until you delete it. The licence
        applies only to cuts you choose to share, ends when you delete the cut (or your account), and does not allow us to sell the photo or use it in advertising.
      </p>
      <ul>
        <li>Only share photos you took or have permission to use, and only of people who have agreed to be shown. Do not share photos of children.</li>
        <li>The photo should be about the hair. No nudity, no hateful, harassing or misleading content, no personal information, and no one else&rsquo;s photo without their consent.</li>
        <li>We review shared cuts before they are shown, and may decline or remove any cut at our discretion. Members can report a cut; enough reports take it down until we have checked it.</li>
        <li>If a photo of you or your work was shared without your permission, or you want something removed, contact us below and we will act promptly.</li>
        <li>We may limit how many cuts you can share, and may remove sharing from accounts that abuse it.</li>
      </ul>

      <h2>AI results are illustrative</h2>
      <p>
        Try-on previews and the example images on this site are AI-generated and illustrative. They are not a promise or guarantee of how a haircut will look on you, and a
        barber or stylist may not be able to reproduce them exactly. Results vary with photo quality, hair type and other factors. Always talk through any cut with your
        professional before you commit.
      </p>

      <h2>Acceptable use</h2>
      <ul>
        <li>Do not misuse the service, interfere with it, or try to access it in ways we have not provided.</li>
        <li>Do not use it to harass, impersonate or harm other people, or to create misleading content about them.</li>
        <li>Do not attempt to bypass sign-in, usage limits or other protections.</li>
        <li>Do not scrape, resell or reverse engineer the service.</li>
      </ul>

      <h2>Usage allowance</h2>
      <p>
        AI features draw on a usage allowance. If you run out, you may need to add more through the link we show you before you can continue. We may change allowances and
        limits as the service evolves.
      </p>

      <h2>Third-party services</h2>
      <p>
        Hairpin relies on third-party services such as Google sign-in and AI model providers. Their availability and terms are outside our control. See our{" "}
        <Link href="/privacy">Privacy Policy</Link> for how your information moves through them.
      </p>

      <h2>Our content</h2>
      <p>
        The Hairpin name, design, software and site content belong to us or our licensors and are protected by law. We grant you a limited, personal, non-transferable licence
        to use the service for your own use.
      </p>

      <h2>Disclaimers</h2>
      <p>
        Hairpin is provided &ldquo;as is&rdquo; and &ldquo;as available&rdquo;, without warranties of any kind, to the fullest extent the law allows. We do not warrant that
        the service will be uninterrupted or error-free, or that AI results will be accurate or suitable for any purpose.
      </p>

      <h2>Limitation of liability</h2>
      <p>
        To the fullest extent the law allows, Hairpin and its team are not liable for indirect, incidental or consequential damages, or for any loss arising from a haircut or
        styling decision you make using the service. Nothing in these terms limits liability that cannot be limited by law.
      </p>

      <h2>Ending your use</h2>
      <p>
        You can stop using Hairpin at any time. We may suspend or end access if you breach these terms or if we need to protect the service or other people.
      </p>

      <h2>Changes to these terms</h2>
      <p>We may update these terms from time to time. If you keep using Hairpin after a change takes effect, you accept the updated terms. We will update the date at the top of this page.</p>

      <h2>Contact</h2>
      <p>Questions about these terms: {LEGAL_CONTACT}.</p>
    </LegalPage>
  );
}
