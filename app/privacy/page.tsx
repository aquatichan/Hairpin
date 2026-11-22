import type { Metadata } from "next";
import { LEGAL_CONTACT, LegalPage } from "@/components/landing/legal";

export const metadata: Metadata = {
  title: "Privacy Policy | Hairpin",
  description: "How Hairpin handles your account, photos and usage data.",
};

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy">
      <p>
        Hairpin helps you discover hairstyles and preview them on your own photo with AI. This policy explains what we collect, where it goes and the choices you have. We
        have tried to keep it plain and specific to how Hairpin actually works.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li>
          <strong>Account details.</strong> When you sign in with Google, we receive your name, email address and a unique account ID through Firebase Authentication.
        </li>
        <li>
          <strong>Photos you submit for try-on.</strong> If you ask for a try-on or a Barber Brief, the photo (and any reference image you choose) is sent from your device
          to our server so it can be processed by an AI model.
        </li>
        <li>
          <strong>Usage and account status.</strong> We keep a record that links your Google account to your Hairpin AI allowance, and we measure how much of that allowance
          you have used. Our AI service provider also collects usage telemetry for the same purpose.
        </li>
        <li>
          <strong>Technical data.</strong> Standard server logs such as IP address, browser type and request timing, used to keep the service running and secure.
        </li>
      </ul>

      <h2>What stays on your device</h2>
      <p>
        Your active photo, the results you generate, your saved Barber Briefs and your hair profile (length, texture, cut schedule) are stored in your browser, using
        IndexedDB and local storage. They are not uploaded unless you submit a photo for a try-on or brief. Clearing site data for Hairpin in your browser removes them.
      </p>

      <h2>How we use your information</h2>
      <ul>
        <li>To sign you in and keep your account secure.</li>
        <li>To generate try-on previews and Barber Briefs that you ask for.</li>
        <li>To apply and display your usage allowance.</li>
        <li>To maintain, debug and improve the service, and to prevent abuse.</li>
      </ul>
      <p>We do not sell your personal information, and we do not use your photos to advertise to you.</p>

      <h2>Who we share it with</h2>
      <p>We rely on a small number of service providers to run Hairpin:</p>
      <ul>
        <li>
          <strong>Google / Firebase</strong> for sign-in.
        </li>
        <li>
          <strong>publik</strong>, the AI service that handles accounts, usage allowances and routes image requests to AI models. Photos you submit for a try-on pass
          through it to the model that edits them.
        </li>
        <li>
          <strong>Upstash</strong>, which stores the link between your Google account and your AI allowance.
        </li>
        <li>
          <strong>Our hosting provider</strong>, which serves the site and runs our server code.
        </li>
      </ul>
      <p>These providers process data only to provide their service to us and handle it under their own terms and privacy policies. We may also disclose information if the law requires it.</p>

      <h2>Photos and AI processing</h2>
      <p>
        Hairpin does not keep the photos you submit in its own database after a request finishes; the result is returned to your device and saved there. The AI models that
        process the image may handle it under their providers&rsquo; own retention rules, so please only submit photos you are comfortable sharing and that you have the right
        to use. Photos of other people should only be used with their permission.
      </p>
      <p>
        If you choose to use your own OpenAI key, the key is sent with each request so that the request can be made on your behalf. We do not store it on our servers.
      </p>

      <h2>Your choices</h2>
      <ul>
        <li>Remove on-device photos, results and briefs by clearing site data for Hairpin in your browser.</li>
        <li>Sign out at any time. You can stop using the service whenever you like.</li>
        <li>Ask us to access, correct or delete the account information we hold about you by contacting us below.</li>
      </ul>

      <h2>Children</h2>
      <p>Hairpin is not intended for children under 13, and we do not knowingly collect their information. If you believe a child has given us information, contact us and we will delete it.</p>

      <h2>Security</h2>
      <p>
        We use industry-standard safeguards, including encrypted connections and server-side verification of sign-in tokens. No method of storage or transmission is perfectly
        secure, so we cannot guarantee absolute security.
      </p>

      <h2>Changes to this policy</h2>
      <p>We may update this policy as the product changes. When we do, we will change the date at the top of this page.</p>

      <h2>Contact</h2>
      <p>Questions or requests about your data: {LEGAL_CONTACT}.</p>
    </LegalPage>
  );
}
