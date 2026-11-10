import {
  Cookie,
  Database,
  Globe,
  Mail,
  Settings2,
  Share2,
  ShieldCheck,
  SlidersHorizontal,
  UserCheck,
} from "lucide-react";
import { Cta } from "@/components/marketing/Cta";
import { LegalPage, type LegalGlance, type LegalSection } from "@/components/marketing/LegalPage";
import { PrivacyHeroStage } from "@/components/marketing/privacy/PrivacyHeroStage";

const SECTIONS: LegalSection[] = [
  {
    title: "Information We Collect",
    icon: <Database />,
    body: "We collect information you provide directly to us, including name, email address, company information, and any other information you choose to provide.",
  },
  {
    title: "How We Use Your Information",
    icon: <Settings2 />,
    body: "We use the information we collect to provide, maintain, and improve our services, to communicate with you, and to protect our users.",
  },
  {
    title: "Information Sharing",
    icon: <Share2 />,
    body: "We do not share your personal information with third parties except as described in this policy. We may share information with service providers who perform services on our behalf.",
  },
  {
    title: "Data Security",
    icon: <ShieldCheck />,
    body: "We take reasonable measures to help protect information about you from loss, theft, misuse, and unauthorized access, disclosure, alteration, and destruction.",
  },
  {
    title: "Your Rights",
    icon: <UserCheck />,
    body: "You have the right to access, update, or delete your personal information at any time. You may also opt out of receiving promotional communications from us.",
  },
  {
    title: "Cookies",
    icon: <Cookie />,
    body: "We use cookies and similar technologies to collect information about your browsing activities and to distinguish you from other users of our services.",
  },
  {
    title: "GDPR Compliance",
    icon: <Globe />,
    body: "If you are a resident of the European Economic Area (EEA), you have certain data protection rights. We aim to take reasonable steps to allow you to correct, amend, delete, or limit the use of your personal data.",
  },
  {
    title: "Contact Us",
    icon: <Mail />,
    body: "If you have any questions about this Privacy Policy, please contact us at privacy@talentflow.com.",
  },
];

// A plain-language summary of the policy below; it restates, never adds.
const GLANCE: LegalGlance[] = [
  {
    icon: <Database />,
    title: "What we collect",
    body: "Your name, email, company details, and anything else you choose to share with us.",
  },
  {
    icon: <Share2 />,
    title: "How it's used",
    body: "To run and improve TalentFlow and keep in touch. Shared only as this policy describes.",
  },
  {
    icon: <SlidersHorizontal />,
    title: "Your choices",
    body: "Access, update or delete your information at any time, and opt out of promotional emails.",
  },
];

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      updated="January 1, 2026"
      sections={SECTIONS}
      lead="What we collect, how we use it, and the choices you have over your information."
      actions={
        <>
          <Cta href="#information-we-collect" size="sm">Read the policy</Cta>
          <Cta href="mailto:privacy@talentflow.com" variant="secondary" size="sm" arrow="upRight">
            Email our privacy team
          </Cta>
        </>
      }
      aside={<PrivacyHeroStage />}
      glance={GLANCE}
      compact
    />
  );
}
