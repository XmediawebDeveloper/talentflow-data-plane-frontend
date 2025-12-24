import { Badge } from "@/components/ui/badge";

export default function PrivacyPage() {
  return (
    <div className="py-20">
      <div className="container mx-auto max-w-[1400px] px-6">
        <div className="text-center mb-16">
          <Badge className="mb-4 px-4 py-2 rounded-full bg-gray-100 dark:bg-purple-900/30 text-gray-900 dark:text-gray-300 border-0">
            Legal
          </Badge>
          <h1 className="text-4xl md:text-5xl font-bold text-gray-900 dark:text-white mb-4">
            Privacy Policy
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Last updated: January 1, 2025
          </p>
        </div>

        <div className="max-w-4xl mx-auto prose prose-lg dark:prose-invert">
          <h2>1. Information We Collect</h2>
          <p>
            We collect information you provide directly to us, including name, email address, company information, and any other information you choose to provide.
          </p>

          <h2>2. How We Use Your Information</h2>
          <p>
            We use the information we collect to provide, maintain, and improve our services, to communicate with you, and to protect our users.
          </p>

          <h2>3. Information Sharing</h2>
          <p>
            We do not share your personal information with third parties except as described in this policy. We may share information with service providers who perform services on our behalf.
          </p>

          <h2>4. Data Security</h2>
          <p>
            We take reasonable measures to help protect information about you from loss, theft, misuse, and unauthorized access, disclosure, alteration, and destruction.
          </p>

          <h2>5. Your Rights</h2>
          <p>
            You have the right to access, update, or delete your personal information at any time. You may also opt out of receiving promotional communications from us.
          </p>

          <h2>6. Cookies</h2>
          <p>
            We use cookies and similar technologies to collect information about your browsing activities and to distinguish you from other users of our services.
          </p>

          <h2>7. GDPR Compliance</h2>
          <p>
            If you are a resident of the European Economic Area (EEA), you have certain data protection rights. We aim to take reasonable steps to allow you to correct, amend, delete, or limit the use of your personal data.
          </p>

          <h2>8. Contact Us</h2>
          <p>
            If you have any questions about this Privacy Policy, please contact us at privacy@talentflow.com.
          </p>
        </div>
      </div>
    </div>
  );
}
