import { Ban, Copyright, FileCheck, KeyRound, Mail, RefreshCw, Scale, ShieldAlert, UserCog } from "lucide-react";
import { Cta } from "@/components/marketing/Cta";
import { LegalPage, type LegalGlance, type LegalSection } from "@/components/marketing/LegalPage";
import { TermsHeroStage } from "@/components/marketing/terms/TermsHeroStage";

const SECTIONS: LegalSection[] = [
  {
    title: "Acceptance of Terms",
    icon: <FileCheck />,
    body: "By accessing or using TalentFlow's services, you agree to be bound by these Terms of Service and all applicable laws and regulations.",
  },
  {
    title: "Use of Service",
    icon: <Scale />,
    body: "You may use our services only for lawful purposes and in accordance with these Terms. You agree not to use our services in any way that violates any applicable laws or regulations.",
  },
  {
    title: "User Accounts",
    icon: <UserCog />,
    body: "When you create an account with us, you must provide accurate and complete information. You are responsible for maintaining the confidentiality of your account and password.",
  },
  {
    title: "Intellectual Property",
    icon: <Copyright />,
    body: "The service and its original content, features, and functionality are owned by TalentFlow and are protected by international copyright, trademark, and other intellectual property laws.",
  },
  {
    title: "Termination",
    icon: <Ban />,
    body: "We may terminate or suspend your account immediately, without prior notice or liability, for any reason whatsoever, including without limitation if you breach the Terms.",
  },
  {
    title: "Limitation of Liability",
    icon: <ShieldAlert />,
    body: "In no event shall TalentFlow be liable for any indirect, incidental, special, consequential or punitive damages resulting from your use of the service.",
  },
  {
    title: "Changes to Terms",
    icon: <RefreshCw />,
    body: "We reserve the right to modify or replace these Terms at any time. It is your responsibility to review these Terms periodically for changes.",
  },
  {
    title: "Contact Us",
    icon: <Mail />,
    body: "If you have any questions about these Terms, please contact us at legal@talentflow.com.",
  },
];

// A plain-language summary of the terms below; it restates, never adds.
const GLANCE: LegalGlance[] = [
  {
    icon: <Scale />,
    title: "Use it lawfully",
    body: "Use TalentFlow only for lawful purposes and in line with these Terms.",
  },
  {
    icon: <KeyRound />,
    title: "Keep your account safe",
    body: "Give accurate details when you sign up, and keep your password confidential.",
  },
  {
    icon: <RefreshCw />,
    title: "Terms can change",
    body: "We may update these Terms, so check back from time to time.",
  },
];

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      updated="January 1, 2026"
      sections={SECTIONS}
      lead="The rules for using TalentFlow: what you agree to, what we own, and how things can change."
      actions={
        <>
          <Cta href="#acceptance-of-terms" size="sm">Read the terms</Cta>
          <Cta href="mailto:legal@talentflow.com" variant="secondary" size="sm" arrow="upRight">
            Email our legal team
          </Cta>
        </>
      }
      aside={<TermsHeroStage />}
      glance={GLANCE}
      compact
    />
  );
}
