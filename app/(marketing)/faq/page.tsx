"use client";

import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

const faqs = [
  {
    question: "What is TalentFlow?",
    answer: "TalentFlow is an AI-powered recruitment platform that helps companies streamline their hiring process. From resume parsing to candidate scoring, assessments, and video interviews - we provide all the tools you need to find and hire the best talent faster."
  },
  {
    question: "How does the AI resume scoring work?",
    answer: "Our AI analyzes resumes against your job requirements, considering skills, experience, education, and other factors. It provides a match score for each candidate, helping you quickly identify the most qualified applicants."
  },
  {
    question: "Is there a free trial?",
    answer: "Yes! We offer a 14-day free trial with full access to all features. No credit card required to start."
  },
  {
    question: "Can I integrate TalentFlow with my existing ATS?",
    answer: "Absolutely. TalentFlow integrates with popular ATS systems including Greenhouse, Lever, Workday, and many others. We also provide a robust API for custom integrations."
  },
  {
    question: "How secure is my data?",
    answer: "Security is our top priority. We're SOC 2 Type II certified and GDPR compliant. All data is encrypted at rest and in transit using bank-level encryption."
  },
  {
    question: "What support options are available?",
    answer: "All plans include email support. Business and Enterprise plans include priority support with faster response times. Enterprise customers also get a dedicated success manager."
  },
  {
    question: "Can I cancel anytime?",
    answer: "Yes, you can cancel your subscription at any time. There are no long-term contracts or cancellation fees."
  },
  {
    question: "Do you offer team collaboration features?",
    answer: "Yes! TalentFlow includes robust collaboration tools that allow your team to share feedback, coordinate interviews, and make hiring decisions together."
  }
];

export default function FAQPage() {
  return (
    <div className="py-10 sm:py-14 md:py-20">
      <div className="container mx-auto max-w-[1400px] px-4 md:px-8">
        {/* Hero */}
        <div className="text-center mb-10 sm:mb-12 md:mb-16">
          <Badge className="mb-3 sm:mb-4 px-3 sm:px-4 py-1.5 sm:py-2 rounded-full bg-gray-100 dark:bg-purple-900/30 text-gray-900 dark:text-gray-300 border-0 text-sm">
            FAQ
          </Badge>
          <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-6xl font-bold text-gray-900 dark:text-white mb-3 sm:mb-4 px-2 sm:px-0 tracking-tight">
            Frequently Asked Questions
          </h1>
          <p className="text-base sm:text-lg md:text-xl text-gray-600 dark:text-gray-400 max-w-2xl mx-auto px-2 sm:px-0">
            Everything you need to know about TalentFlow
          </p>
        </div>

        {/* FAQ Accordion */}
        <div className="max-w-3xl mx-auto">
          <Accordion type="single" collapsible className="space-y-3 sm:space-y-4">
            {faqs.map((faq, index) => (
              <AccordionItem key={index} value={`item-${index}`} className="border border-border rounded-xl px-4 sm:px-6 bg-card shadow-sm">
                <AccordionTrigger className="text-left text-sm sm:text-base md:text-lg font-semibold text-gray-900 dark:text-white hover:no-underline py-4 sm:py-5">
                  {faq.question}
                </AccordionTrigger>
                <AccordionContent className="text-sm sm:text-base text-gray-600 dark:text-gray-400 leading-relaxed">
                  {faq.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>

        {/* Still have questions */}
        <div className="text-center mt-10 sm:mt-12 md:mt-16">
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white mb-3 sm:mb-4">
            Still have questions?
          </h2>
          <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400 mb-5 sm:mb-6 max-w-md mx-auto px-4 sm:px-0">
            Our team is here to help. Get in touch and we&apos;ll get back to you within 24 hours.
          </p>
        </div>
      </div>
    </div>
  );
}
