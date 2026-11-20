import { useState, useEffect } from "react";
import { useTheme } from 'next-themes';
import {
  Mail,
  Phone,
  MapPin,
  Send,
  MessageSquare,
  Clock,
  CheckCircle2,
  ArrowRight,
  Building,
  Users,
  Headphones,
} from "lucide-react";
import FilterSelect from '@/components/ui/filter-select';

interface ContactPageProps {
  onNavigate: (page: string) => void;
}

export default function ContactPage({ onNavigate }: ContactPageProps) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  const [isMobile, setIsMobile] = useState(false);
  const [isTablet, setIsTablet] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    company: '',
    subject: 'General Inquiry',
    message: '',
  });
  const [isSubmitted, setIsSubmitted] = useState(false);

  useEffect(() => {
    const checkScreen = () => {
      const w = window.innerWidth;
      setIsMobile(w < 640);
      setIsTablet(w >= 640 && w < 1024);
    };
    checkScreen();
    window.addEventListener('resize', checkScreen);
    return () => window.removeEventListener('resize', checkScreen);
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitted(true);
  };

  const pageStyle: React.CSSProperties = {
    minHeight: '100vh',
    backgroundColor: isDark ? 'var(--raw-0f172a)' : 'var(--raw-ffffff)',
    color: isDark ? 'var(--raw-ffffff)' : 'var(--raw-111827)',
  };

  const containerStyle: React.CSSProperties = {
    maxWidth: '1400px',
    margin: '0 auto',
    padding: isMobile ? '40px 16px' : isTablet ? '60px 20px' : '80px 24px',
  };

  const headerStyle: React.CSSProperties = {
    textAlign: 'center',
    marginBottom: isMobile ? '32px' : isTablet ? '48px' : '64px',
  };

  const badgeStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 16px',
    borderRadius: '9999px',
    backgroundColor: isDark ? 'var(--raw-rgba-34-197-94-0p2)' : 'var(--raw-dcfce7)',
    color: isDark ? 'var(--raw-86efac)' : 'var(--raw-16a34a)',
    fontSize: '14px',
    fontWeight: 600,
    marginBottom: '16px',
  };

  const titleStyle: React.CSSProperties = {
    fontSize: isMobile ? '28px' : isTablet ? '40px' : '56px',
    fontWeight: 700,
    color: isDark ? 'var(--raw-ffffff)' : 'var(--raw-111827)',
    marginBottom: '16px',
    lineHeight: 1.1,
  };

  const subtitleStyle: React.CSSProperties = {
    fontSize: isMobile ? '16px' : isTablet ? '18px' : '20px',
    color: isDark ? 'var(--raw-94a3b8)' : 'var(--raw-6b7280)',
    maxWidth: '672px',
    margin: '0 auto',
    lineHeight: 1.6,
  };

  const gridStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
    gap: isMobile ? '32px' : isTablet ? '40px' : '64px',
    marginBottom: isMobile ? '40px' : isTablet ? '60px' : '80px',
  };

  const contactInfoStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: '32px',
  };

  const contactCardStyle: React.CSSProperties = {
    display: 'flex',
    gap: '16px',
    padding: '24px',
    borderRadius: '16px',
    border: `1px solid ${isDark ? 'var(--raw-1e293b)' : 'var(--raw-e5e7eb)'}`,
    backgroundColor: isDark ? 'var(--raw-1e293b)' : 'var(--raw-ffffff)',
  };

  const contactIconStyle = (gradient: string): React.CSSProperties => ({
    width: '48px',
    height: '48px',
    borderRadius: '12px',
    background: gradient,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  });

  const contactTitleStyle: React.CSSProperties = {
    fontSize: '18px',
    fontWeight: 600,
    color: isDark ? 'var(--raw-ffffff)' : 'var(--raw-111827)',
    marginBottom: '4px',
  };

  const contactDescStyle: React.CSSProperties = {
    color: isDark ? 'var(--raw-94a3b8)' : 'var(--raw-6b7280)',
    fontSize: '14px',
    marginBottom: '8px',
  };

  const contactLinkStyle: React.CSSProperties = {
    color: isDark ? 'var(--raw-a78bfa)' : 'var(--raw-7c3aed)',
    fontWeight: 500,
    textDecoration: 'none',
  };

  const formStyle: React.CSSProperties = {
    padding: isMobile ? '20px' : '32px',
    borderRadius: isMobile ? '16px' : '24px',
    border: `1px solid ${isDark ? 'var(--raw-1e293b)' : 'var(--raw-e5e7eb)'}`,
    backgroundColor: isDark ? 'var(--raw-1e293b)' : 'var(--raw-ffffff)',
  };

  const formTitleStyle: React.CSSProperties = {
    fontSize: '24px',
    fontWeight: 700,
    color: isDark ? 'var(--raw-ffffff)' : 'var(--raw-111827)',
    marginBottom: '24px',
  };

  const formGroupStyle: React.CSSProperties = {
    marginBottom: '20px',
  };

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: '14px',
    fontWeight: 500,
    color: isDark ? 'var(--raw-d1d5db)' : 'var(--raw-374151)',
    marginBottom: '8px',
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '12px 16px',
    borderRadius: '10px',
    border: `1px solid ${isDark ? 'var(--raw-4b5563)' : 'var(--raw-d1d5db)'}`,
    backgroundColor: isDark ? 'var(--raw-374151)' : 'var(--raw-ffffff)',
    color: isDark ? 'var(--raw-f9fafb)' : 'var(--raw-111827)',
    fontSize: '16px',
    outline: 'none',
    boxSizing: 'border-box',
  };

  const selectStyle: React.CSSProperties = {
    ...inputStyle,
    cursor: 'pointer',
  };

  const textareaStyle: React.CSSProperties = {
    ...inputStyle,
    minHeight: '120px',
    resize: 'vertical',
  };

  const submitButtonStyle: React.CSSProperties = {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    padding: '16px 32px',
    fontSize: '16px',
    fontWeight: 500,
    borderRadius: '12px',
    background: 'linear-gradient(135deg, var(--raw-667eea), var(--raw-764ba2))',
    color: 'var(--raw-ffffff)',
    border: 'none',
    cursor: 'pointer',
  };

  const successStyle: React.CSSProperties = {
    textAlign: 'center',
    padding: '48px',
  };

  const successIconStyle: React.CSSProperties = {
    width: '80px',
    height: '80px',
    borderRadius: '50%',
    background: 'linear-gradient(135deg, var(--raw-22c55e), var(--raw-14b8a6))',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    margin: '0 auto 24px',
  };

  const officesGridStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: isMobile ? '1fr' : isTablet ? 'repeat(2, 1fr)' : 'repeat(3, 1fr)',
    gap: isMobile ? '16px' : '24px',
    marginBottom: isMobile ? '40px' : isTablet ? '60px' : '80px',
  };

  const officeCardStyle: React.CSSProperties = {
    padding: isMobile ? '20px' : '32px',
    borderRadius: '16px',
    border: `1px solid ${isDark ? 'var(--raw-1e293b)' : 'var(--raw-e5e7eb)'}`,
    backgroundColor: isDark ? 'var(--raw-1e293b)' : 'var(--raw-ffffff)',
    textAlign: 'center',
  };

  const officeIconStyle: React.CSSProperties = {
    width: '64px',
    height: '64px',
    borderRadius: '16px',
    background: 'linear-gradient(135deg, var(--raw-667eea), var(--raw-764ba2))',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    margin: '0 auto 16px',
  };

  const officeTitleStyle: React.CSSProperties = {
    fontSize: '20px',
    fontWeight: 700,
    color: isDark ? 'var(--raw-ffffff)' : 'var(--raw-111827)',
    marginBottom: '8px',
  };

  const officeAddressStyle: React.CSSProperties = {
    color: isDark ? 'var(--raw-94a3b8)' : 'var(--raw-6b7280)',
    lineHeight: 1.6,
  };

  const faqSectionStyle: React.CSSProperties = {
    padding: isMobile ? '32px 20px' : isTablet ? '48px 32px' : '60px 40px',
    borderRadius: isMobile ? '16px' : '24px',
    backgroundColor: isDark ? 'var(--raw-1e293b)' : 'var(--raw-f9fafb)',
    textAlign: 'center',
  };

  const contacts = [
    {
      icon: Mail,
      title: "Email Us",
      description: "Send us an email anytime",
      link: "hello@talentflow.com",
      gradient: "linear-gradient(135deg, var(--raw-3b82f6), var(--raw-8b5cf6))",
    },
    {
      icon: Phone,
      title: "Call Us",
      description: "Mon-Fri from 9am to 6pm EST",
      link: "+1 (555) 123-4567",
      gradient: "linear-gradient(135deg, var(--raw-22c55e), var(--raw-14b8a6))",
    },
    {
      icon: MessageSquare,
      title: "Live Chat",
      description: "We're here to help",
      link: "Start a conversation",
      gradient: "linear-gradient(135deg, var(--raw-ec4899), var(--raw-f43f5e))",
    },
  ];

  const offices = [
    { city: "San Francisco", address: "100 Market Street\nSuite 300\nSan Francisco, CA 94105" },
    { city: "New York", address: "350 Fifth Avenue\n21st Floor\nNew York, NY 10118" },
    { city: "London", address: "1 Canada Square\nCanary Wharf\nLondon E14 5AB" },
  ];

  return (
    <div style={pageStyle}>
      <div style={containerStyle}>
        {/* Header */}
        <div style={headerStyle}>
          <div style={badgeStyle}>
            <MessageSquare style={{ width: 16, height: 16 }} />
            Contact Us
          </div>
          <h1 className="tf-page-title" style={titleStyle}>Get in touch</h1>
          <p style={subtitleStyle}>
            Have questions? We'd love to hear from you. Send us a message and we'll respond as soon as possible.
          </p>
        </div>

        {/* Contact Grid */}
        <div style={gridStyle}>
          {/* Contact Info */}
          <div style={contactInfoStyle}>
            {contacts.map((contact, index) => {
              const Icon = contact.icon;
              return (
                <div key={index} style={contactCardStyle}>
                  <div style={contactIconStyle(contact.gradient)}>
                    <Icon style={{ width: 24, height: 24, color: 'var(--raw-ffffff)' }} />
                  </div>
                  <div>
                    <h3 style={contactTitleStyle}>{contact.title}</h3>
                    <p style={contactDescStyle}>{contact.description}</p>
                    <a href="#" style={contactLinkStyle}>{contact.link}</a>
                  </div>
                </div>
              );
            })}

            {/* Response Time */}
            <div style={{
              padding: '24px',
              borderRadius: '16px',
              background: 'linear-gradient(135deg, var(--raw-rgba-102-126-234-0p1), var(--raw-rgba-118-75-162-0p1))',
              border: `1px solid ${isDark ? 'var(--raw-334155)' : 'var(--raw-e5e7eb)'}`,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                <Clock style={{ width: 24, height: 24, color: 'var(--raw-667eea)' }} />
                <span style={{ fontWeight: 600, color: isDark ? 'var(--raw-ffffff)' : 'var(--raw-111827)' }}>Average Response Time</span>
              </div>
              <p style={{ color: isDark ? 'var(--raw-94a3b8)' : 'var(--raw-6b7280)', margin: 0 }}>
                We typically respond within <strong style={{ color: isDark ? 'var(--raw-a78bfa)' : 'var(--raw-7c3aed)' }}>2 hours</strong> during business hours.
              </p>
            </div>
          </div>

          {/* Contact Form */}
          <div style={formStyle}>
            {isSubmitted ? (
              <div style={successStyle}>
                <div style={successIconStyle}>
                  <CheckCircle2 style={{ width: 40, height: 40, color: 'var(--raw-ffffff)' }} />
                </div>
                <h3 style={{ fontSize: '24px', fontWeight: 700, color: isDark ? 'var(--raw-ffffff)' : 'var(--raw-111827)', marginBottom: '12px' }}>
                  Message Sent!
                </h3>
                <p style={{ color: isDark ? 'var(--raw-94a3b8)' : 'var(--raw-6b7280)', marginBottom: '24px' }}>
                  Thank you for reaching out. We'll get back to you within 24 hours.
                </p>
                <button
                  onClick={() => setIsSubmitted(false)}
                  style={{ ...submitButtonStyle, width: 'auto', display: 'inline-flex' }}
                >
                  Send Another Message
                </button>
              </div>
            ) : (
              <>
                <h2 style={formTitleStyle}>Send us a message</h2>
                <form onSubmit={handleSubmit}>
                  <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '20px' }}>
                    <div style={formGroupStyle}>
                      <label style={labelStyle}>Full Name *</label>
                      <input
                        type="text"
                        required
                        style={inputStyle}
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        placeholder="John Smith"
                      />
                    </div>
                    <div style={formGroupStyle}>
                      <label style={labelStyle}>Email Address *</label>
                      <input
                        type="email"
                        required
                        style={inputStyle}
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        placeholder="john@company.com"
                      />
                    </div>
                  </div>
                  <div style={formGroupStyle}>
                    <label style={labelStyle}>Company</label>
                    <input
                      type="text"
                      style={inputStyle}
                      value={formData.company}
                      onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                      placeholder="Your company name"
                    />
                  </div>
                  <div style={formGroupStyle}>
                    <label style={labelStyle}>Subject *</label>
                    <FilterSelect
                      value={formData.subject}
                      onChange={(v) => setFormData({ ...formData, subject: v })}
                      options={['General Inquiry', 'Sales Question', 'Technical Support', 'Partnership', 'Press/Media'].map(s => ({ value: s, label: s }))}
                      className="w-full sm:w-full px-4 sm:px-4 py-3 sm:py-3 rounded-[10px] sm:rounded-[10px] text-base border-[var(--raw-d1d5db)] dark:border-[var(--raw-4b5563)] bg-[var(--raw-ffffff)] dark:bg-[var(--raw-374151)] text-[var(--raw-111827)] dark:text-[var(--raw-f9fafb)]"
                    />
                  </div>
                  <div style={formGroupStyle}>
                    <label style={labelStyle}>Message *</label>
                    <textarea
                      required
                      style={textareaStyle}
                      value={formData.message}
                      onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                      placeholder="Tell us how we can help..."
                    />
                  </div>
                  <button type="submit" style={submitButtonStyle}>
                    Send Message
                    <Send style={{ width: 20, height: 20 }} />
                  </button>
                </form>
              </>
            )}
          </div>
        </div>

        {/* Offices */}
        <h2 style={{ fontSize: '32px', fontWeight: 700, color: isDark ? 'var(--raw-ffffff)' : 'var(--raw-111827)', textAlign: 'center', marginBottom: '32px' }}>
          Our Offices
        </h2>
        <div style={officesGridStyle}>
          {offices.map((office, index) => (
            <div key={index} style={officeCardStyle}>
              <div style={officeIconStyle}>
                <Building style={{ width: 32, height: 32, color: 'var(--raw-ffffff)' }} />
              </div>
              <h3 style={officeTitleStyle}>{office.city}</h3>
              <p style={officeAddressStyle}>{office.address.split('\n').map((line, i) => (
                <span key={i}>{line}<br /></span>
              ))}</p>
            </div>
          ))}
        </div>

        {/* FAQ */}
        <div style={faqSectionStyle}>
          <h2 style={{ fontSize: '28px', fontWeight: 700, color: isDark ? 'var(--raw-ffffff)' : 'var(--raw-111827)', marginBottom: '16px' }}>
            Need quick answers?
          </h2>
          <p style={{ ...subtitleStyle, marginBottom: '24px' }}>
            Check out our FAQ section for common questions.
          </p>
          <button onClick={() => onNavigate("faq")} style={{ ...submitButtonStyle, width: 'auto', display: 'inline-flex' }}>
            View FAQ
            <ArrowRight style={{ width: 20, height: 20 }} />
          </button>
        </div>
      </div>
    </div>
  );
}
