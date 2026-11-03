import { LegalPage, type LegalSection } from "@/components/marketing/LegalPage";

const SECTIONS: LegalSection[] = [
  {
    title: "Information We Collect",
    body: "We collect information you provide directly to us, including name, email address, company information, and any other information you choose to provide.",
  },
  {
    title: "How We Use Your Information",
    body: "We use the information we collect to provide, maintain, and improve our services, to communicate with you, and to protect our users.",
  },
  {
    title: "Information Sharing",
    body: "We do not share your personal information with third parties except as described in this policy. We may share information with service providers who perform services on our behalf.",
  },
  {
    title: "Data Security",
    body: "We take reasonable measures to help protect information about you from loss, theft, misuse, and unauthorized access, disclosure, alteration, and destruction.",
  },
  {
    title: "Your Rights",
    body: "You have the right to access, update, or delete your personal information at any time. You may also opt out of receiving promotional communications from us.",
  },
  {
    title: "Cookies",
    body: "We use cookies and similar technologies to collect information about your browsing activities and to distinguish you from other users of our services.",
  },
  {
    title: "GDPR Compliance",
    body: "If you are a resident of the European Economic Area (EEA), you have certain data protection rights. We aim to take reasonable steps to allow you to correct, amend, delete, or limit the use of your personal data.",
  },
  {
    title: "Contact Us",
    body: "If you have any questions about this Privacy Policy, please contact us at privacy@talentflow.com.",
  },
];

export default function PrivacyPage() {
  return <LegalPage title="Privacy Policy" updated="January 1, 2026" sections={SECTIONS} />;
}
