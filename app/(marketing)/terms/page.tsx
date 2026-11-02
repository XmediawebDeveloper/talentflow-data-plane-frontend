import { LegalPage, type LegalSection } from "@/components/marketing/LegalPage";

const SECTIONS: LegalSection[] = [
  {
    title: "Acceptance of Terms",
    body: "By accessing or using TalentFlow's services, you agree to be bound by these Terms of Service and all applicable laws and regulations.",
  },
  {
    title: "Use of Service",
    body: "You may use our services only for lawful purposes and in accordance with these Terms. You agree not to use our services in any way that violates any applicable laws or regulations.",
  },
  {
    title: "User Accounts",
    body: "When you create an account with us, you must provide accurate and complete information. You are responsible for maintaining the confidentiality of your account and password.",
  },
  {
    title: "Intellectual Property",
    body: "The service and its original content, features, and functionality are owned by TalentFlow and are protected by international copyright, trademark, and other intellectual property laws.",
  },
  {
    title: "Termination",
    body: "We may terminate or suspend your account immediately, without prior notice or liability, for any reason whatsoever, including without limitation if you breach the Terms.",
  },
  {
    title: "Limitation of Liability",
    body: "In no event shall TalentFlow be liable for any indirect, incidental, special, consequential or punitive damages resulting from your use of the service.",
  },
  {
    title: "Changes to Terms",
    body: "We reserve the right to modify or replace these Terms at any time. It is your responsibility to review these Terms periodically for changes.",
  },
  {
    title: "Contact Us",
    body: "If you have any questions about these Terms, please contact us at legal@talentflow.com.",
  },
];

export default function TermsPage() {
  return <LegalPage title="Terms of Service" updated="January 1, 2026" sections={SECTIONS} />;
}
