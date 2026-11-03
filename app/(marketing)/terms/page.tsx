import { Badge } from "@/components/ui/badge";

export default function TermsPage() {
  return (
    <div className="py-10 sm:py-14 md:py-20">
      <div className="container mx-auto max-w-[1400px] px-4 md:px-8">
        <div className="text-center mb-10 sm:mb-12 md:mb-16">
          <Badge className="mb-3 sm:mb-4 px-3 sm:px-4 py-1.5 sm:py-2 rounded-full bg-gray-100 dark:bg-purple-900/30 tf-body border-0">
            Legal
          </Badge>
          <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-6xl font-bold text-gray-900 dark:text-white mb-3 sm:mb-4 tracking-tight">
            Terms of Service
          </h1>
          <p className="tf-body-secondary sm:text-base">
            Last updated: January 1, 2026
          </p>
        </div>

        <div className="max-w-4xl mx-auto prose prose-sm sm:prose-base lg:prose-lg dark:prose-invert">
          <h2>1. Acceptance of Terms</h2>
          <p>
            By accessing or using TalentFlow&apos;s services, you agree to be bound by these Terms of Service and all applicable laws and regulations.
          </p>

          <h2>2. Use of Service</h2>
          <p>
            You may use our services only for lawful purposes and in accordance with these Terms. You agree not to use our services in any way that violates any applicable laws or regulations.
          </p>

          <h2>3. User Accounts</h2>
          <p>
            When you create an account with us, you must provide accurate and complete information. You are responsible for maintaining the confidentiality of your account and password.
          </p>

          <h2>4. Intellectual Property</h2>
          <p>
            The service and its original content, features, and functionality are owned by TalentFlow and are protected by international copyright, trademark, and other intellectual property laws.
          </p>

          <h2>5. Termination</h2>
          <p>
            We may terminate or suspend your account immediately, without prior notice or liability, for any reason whatsoever, including without limitation if you breach the Terms.
          </p>

          <h2>6. Limitation of Liability</h2>
          <p>
            In no event shall TalentFlow be liable for any indirect, incidental, special, consequential or punitive damages resulting from your use of the service.
          </p>

          <h2>7. Changes to Terms</h2>
          <p>
            We reserve the right to modify or replace these Terms at any time. It is your responsibility to review these Terms periodically for changes.
          </p>

          <h2>8. Contact Us</h2>
          <p>
            If you have any questions about these Terms, please contact us at legal@talentflow.com.
          </p>
        </div>
      </div>
    </div>
  );
}
