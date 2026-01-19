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
    <div className="py-20">
      <div className="container mx-auto max-w-[1400px] px-6">
        {/* Hero */}
        <div className="text-center mb-16">
          <Badge className="mb-4 px-4 py-2 rounded-full bg-gray-100 dark:bg-purple-900/30 text-gray-900 dark:text-gray-300 border-0">
            FAQ
          </Badge>
          <h1 className="text-4xl md:text-6xl font-bold text-gray-900 dark:text-white mb-4">
            Frequently Asked Questions
          </h1>
          <p className="text-xl text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
            Everything you need to know about TalentFlow
          </p>
        </div>

        {/* FAQ Accordion */}
        <div className="max-w-3xl mx-auto">
          <Accordion type="single" collapsible className="space-y-4">
            {faqs.map((faq, index) => (
              <AccordionItem key={index} value={`item-${index}`} className="border rounded-lg px-6">
                <AccordionTrigger className="text-left text-lg font-semibold text-gray-900 dark:text-white hover:no-underline">
                  {faq.question}
                </AccordionTrigger>
                <AccordionContent className="text-gray-600 dark:text-gray-400">
                  {faq.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>

        {/* Still have questions */}
        <div className="text-center mt-16">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
            Still have questions?
          </h2>
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            Our team is here to help. Get in touch and we&apos;ll get back to you within 24 hours.
          </p>
        </div>
      </div>
    </div>
  );
}
