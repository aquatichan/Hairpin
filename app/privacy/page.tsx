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
      <p>
        The same goes for your last 12 Decode results (the screenshot and what it was read as), the cuts you add for yourself, what Discover has learned from what you
        open, save, try and hide, and your face shape. Discover&rsquo;s recommendations are worked out in your browser and are never sent to us.
      </p>
      <p>
        <strong>Face scan.</strong> &ldquo;Scan my face&rdquo; runs on your device using an open-source model (MediaPipe) that Hairpin serves itself, so nothing is fetched from
        Google when you scan. The photo and the facial landmark points never leave your device; only the face shape you confirm (for example &ldquo;oval&rdquo;) is saved, in
        your on-device profile. Face shape is a styling convention, not a measurement of you, and you can change or clear it any time.
      </p>
      <p>
        If more than one Google account signs in to Hairpin in the same browser, each account&rsquo;s photo, results, briefs and preferences are kept separately, and one
        account cannot open another&rsquo;s. Signing out hides them and removes a saved OpenAI key from the browser; they reappear when that account signs in again on the
        same browser.
      </p>

      <h2>Saved looks and boards</h2>
      <p>
        So that they follow you between devices, the library looks you save and the boards you make (each board&rsquo;s name and which library looks are in it) are
        stored with your account. They never include your photos, results or briefs. You can delete them with &ldquo;Delete all my data&rdquo; in You, which also clears
        this browser&rsquo;s copy of your photo, results and briefs.
      </p>

      <h2>Cuts you share publicly</h2>
      <p>
        You can add a cut for yourself, and it stays private on your device. If you choose &ldquo;Share publicly (reviewed first)&rdquo;, the photo and the details you typed
        (name, description, who it&rsquo;s for, length, hair type, tags) are uploaded to our servers and held for review. Nothing is shown to other members until it is
        approved. Once approved, other signed-in members can see the photo and those details until you delete it. The photo may contain your face, so only share what you are
        comfortable showing.
      </p>
      <ul>
        <li>
          <strong>How it is stored.</strong> Before it is kept, the photo is re-encoded on our server as one small WebP copy (at most 960 px on the long side) with all
          embedded data, such as location, removed. That single copy is what everyone sees. It is stored in Vercel Blob; its details are stored in Upstash.
        </li>
        <li>
          <strong>Who sees your account.</strong> Other members never see your name, email or account ID. The app is given a short one-way code for each uploader so one
          person&rsquo;s cuts are not all shown together.
        </li>
        <li>
          <strong>Counts.</strong> To count a save or a report once per person, we keep the account IDs of people who saved or reported a shared cut, against that cut, until
          the cut is deleted. Three different people reporting a cut takes it down until we have reviewed it.
        </li>
        <li>
          <strong>Limits.</strong> To keep storage and costs in check, each person can share a limited number of cuts per day and have a limited number live.
        </li>
        <li>
          <strong>Taking it down.</strong> You can delete a shared cut from Mine at any time, which removes the photo and its details from our servers. &ldquo;Delete all my
          data&rdquo; and &ldquo;Delete my account&rdquo; remove everything you shared. If you saved or reported someone else&rsquo;s cut, your account ID stays in that
          cut&rsquo;s counts until it is removed. We may remove or decline any cut at our discretion, for example if it breaks the Terms.
        </li>
      </ul>

      <h2>How we use your information</h2>
      <ul>
        <li>To sign you in and keep your account secure.</li>
        <li>To generate try-on previews and Barber Briefs that you ask for.</li>
        <li>To review, show and, if needed, remove cuts that you choose to share publicly.</li>
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
          <strong>Upstash</strong>, which stores the link between your Google account and your AI allowance, your saved looks and boards, short-lived counters that
          limit how many try-ons can be made in a few minutes, the hashed free try-on counts described below, and the details and review status of cuts you share
          publicly.
        </li>
        <li>
          <strong>Vercel Blob</strong>, our hosting provider&rsquo;s file storage, which holds the photo of any cut you share publicly.
        </li>
        <li>
          <strong>Our hosting provider</strong>, which serves the site and runs our server code.
        </li>
      </ul>
      <p>These providers process data only to provide their service to us and handle it under their own terms and privacy policies. We may also disclose information if the law requires it.</p>

      <h2>Photos and AI processing</h2>
      <p>
        Apart from cuts you choose to share publicly (above), Hairpin does not keep the photos you submit in its own database after a request finishes; the result is returned to your device and saved there. When you try on a community cut, the app uses that cut&rsquo;s stored photo as the reference image for your request. The AI models that
        process the image may handle it under their providers&rsquo; own retention rules, so please only submit photos you are comfortable sharing and that you have the right
        to use. Photos of other people should only be used with their permission.
      </p>
      <p>
        If you choose to use your own key for OpenAI, Google Gemini, OpenRouter or Anthropic, the key and your request (including any photo) are sent through our server to that
        provider so the request can be made on your behalf, under that provider&rsquo;s terms. We do not store the key on our servers. We ask Google not to store
        Gemini image requests, and ask OpenRouter to avoid providers that train on requests.
      </p>
      <p>
        Free try-ons are made with Hairpin&rsquo;s own key at OpenAI or Google. To limit them to a few per person, we keep a count for a one-way, salted hash of your
        IP address, never the address itself, for up to a year.
      </p>

      <h2>Your choices</h2>
      <ul>
        <li>
          Delete your photo, results, briefs, preferences, saved looks, boards, recent decodes, private cuts, what Discover learned and anything you shared publicly with
          &ldquo;Delete all my data&rdquo; in You. &ldquo;Reset recommendations&rdquo; in You clears only what Discover learned.
        </li>
        <li>
          Delete your account with &ldquo;Delete my account&rdquo; in You. It removes your saved looks and boards, the cuts you shared publicly, the link to your publik
          account and your usage counters from our servers, this browser&rsquo;s copy of your data, and your sign-in account. Your publik account is separate and is managed at publik.
        </li>
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
