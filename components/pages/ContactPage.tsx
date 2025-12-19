import { useState, useEffect } from "react";
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

interface ContactPageProps {
  onNavigate: (page: string) => void;
}

export default function ContactPage({ onNavigate }: ContactPageProps) {
  const [isMobile, setIsMobile] = useState(false);
  const [isDark, setIsDark] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    company: '',
    subject: 'General Inquiry',
    message: '',
  });
  const [isSubmitted, setIsSubmitted] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    setIsDark(document.documentElement.classList.contains('dark'));
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitted(true);
  };

  const pageStyle: React.CSSProperties = {
    minHeight: '100vh',
    backgroundColor: isDark ? '#0F172A' : '#ffffff',
    color: isDark ? '#ffffff' : '#111827',
  };

  const containerStyle: React.CSSProperties = {
    maxWidth: '1400px',
    margin: '0 auto',
    padding: '80px 24px',
  };

  const headerStyle: React.CSSProperties = {
    textAlign: 'center',
    marginBottom: '64px',
  };

  const badgeStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 16px',
    borderRadius: '9999px',
    backgroundColor: isDark ? 'rgba(34, 197, 94, 0.2)' : '#DCFCE7',
    color: isDark ? '#86EFAC' : '#16A34A',
    fontSize: '14px',
    fontWeight: 600,
    marginBottom: '16px',
  };

  const titleStyle: React.CSSProperties = {
    fontSize: isMobile ? '36px' : '56px',
    fontWeight: 700,
    color: isDark ? '#ffffff' : '#111827',
    marginBottom: '16px',
    lineHeight: 1.1,
  };

  const subtitleStyle: React.CSSProperties = {
    fontSize: '20px',
    color: isDark ? '#94A3B8' : '#6B7280',
    maxWidth: '672px',
    margin: '0 auto',
    lineHeight: 1.6,
  };

  const gridStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
    gap: '64px',
    marginBottom: '80px',
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
    border: `1px solid ${isDark ? '#1E293B' : '#E5E7EB'}`,
    backgroundColor: isDark ? '#1E293B' : '#ffffff',
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
    color: isDark ? '#ffffff' : '#111827',
    marginBottom: '4px',
  };

  const contactDescStyle: React.CSSProperties = {
    color: isDark ? '#94A3B8' : '#6B7280',
    fontSize: '14px',
    marginBottom: '8px',
  };

  const contactLinkStyle: React.CSSProperties = {
    color: isDark ? '#A78BFA' : '#7C3AED',
    fontWeight: 500,
    textDecoration: 'none',
  };

  const formStyle: React.CSSProperties = {
    padding: '32px',
    borderRadius: '24px',
    border: `1px solid ${isDark ? '#1E293B' : '#E5E7EB'}`,
    backgroundColor: isDark ? '#1E293B' : '#ffffff',
  };

  const formTitleStyle: React.CSSProperties = {
    fontSize: '24px',
    fontWeight: 700,
    color: isDark ? '#ffffff' : '#111827',
    marginBottom: '24px',
  };

  const formGroupStyle: React.CSSProperties = {
    marginBottom: '20px',
  };

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: '14px',
    fontWeight: 500,
    color: isDark ? '#CBD5E1' : '#374151',
    marginBottom: '8px',
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '12px 16px',
    borderRadius: '10px',
    border: `1px solid ${isDark ? '#334155' : '#E5E7EB'}`,
    backgroundColor: isDark ? '#0F172A' : '#ffffff',
    color: isDark ? '#ffffff' : '#111827',
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
    background: 'linear-gradient(135deg, #667EEA, #764BA2)',
    color: '#ffffff',
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
    background: 'linear-gradient(135deg, #22C55E, #14B8A6)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    margin: '0 auto 24px',
  };

  const officesGridStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)',
    gap: '24px',
    marginBottom: '80px',
  };

  const officeCardStyle: React.CSSProperties = {
    padding: '32px',
    borderRadius: '16px',
    border: `1px solid ${isDark ? '#1E293B' : '#E5E7EB'}`,
    backgroundColor: isDark ? '#1E293B' : '#ffffff',
    textAlign: 'center',
  };

  const officeIconStyle: React.CSSProperties = {
    width: '64px',
    height: '64px',
    borderRadius: '16px',
    background: 'linear-gradient(135deg, #667EEA, #764BA2)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    margin: '0 auto 16px',
  };

  const officeTitleStyle: React.CSSProperties = {
    fontSize: '20px',
    fontWeight: 700,
    color: isDark ? '#ffffff' : '#111827',
    marginBottom: '8px',
  };

  const officeAddressStyle: React.CSSProperties = {
    color: isDark ? '#94A3B8' : '#6B7280',
    lineHeight: 1.6,
  };

  const faqSectionStyle: React.CSSProperties = {
    padding: '60px 40px',
    borderRadius: '24px',
    backgroundColor: isDark ? '#1E293B' : '#F9FAFB',
    textAlign: 'center',
  };

  const contacts = [
    {
      icon: Mail,
      title: "Email Us",
      description: "Send us an email anytime",
      link: "hello@talentflow.com",
      gradient: "linear-gradient(135deg, #3B82F6, #8B5CF6)",
    },
    {
      icon: Phone,
      title: "Call Us",
      description: "Mon-Fri from 9am to 6pm EST",
      link: "+1 (555) 123-4567",
      gradient: "linear-gradient(135deg, #22C55E, #14B8A6)",
    },
    {
      icon: MessageSquare,
      title: "Live Chat",
      description: "We're here to help",
      link: "Start a conversation",
      gradient: "linear-gradient(135deg, #EC4899, #F43F5E)",
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
          <h1 style={titleStyle}>Get in touch</h1>
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
                    <Icon style={{ width: 24, height: 24, color: '#ffffff' }} />
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
              background: 'linear-gradient(135deg, rgba(102, 126, 234, 0.1), rgba(118, 75, 162, 0.1))',
              border: `1px solid ${isDark ? '#334155' : '#E5E7EB'}`,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                <Clock style={{ width: 24, height: 24, color: '#667EEA' }} />
                <span style={{ fontWeight: 600, color: isDark ? '#ffffff' : '#111827' }}>Average Response Time</span>
              </div>
              <p style={{ color: isDark ? '#94A3B8' : '#6B7280', margin: 0 }}>
                We typically respond within <strong style={{ color: isDark ? '#A78BFA' : '#7C3AED' }}>2 hours</strong> during business hours.
              </p>
            </div>
          </div>

          {/* Contact Form */}
          <div style={formStyle}>
            {isSubmitted ? (
              <div style={successStyle}>
                <div style={successIconStyle}>
                  <CheckCircle2 style={{ width: 40, height: 40, color: '#ffffff' }} />
                </div>
                <h3 style={{ fontSize: '24px', fontWeight: 700, color: isDark ? '#ffffff' : '#111827', marginBottom: '12px' }}>
                  Message Sent!
                </h3>
                <p style={{ color: isDark ? '#94A3B8' : '#6B7280', marginBottom: '24px' }}>
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
                    <select
                      style={selectStyle}
                      value={formData.subject}
                      onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                    >
                      <option>General Inquiry</option>
                      <option>Sales Question</option>
                      <option>Technical Support</option>
                      <option>Partnership</option>
                      <option>Press/Media</option>
                    </select>
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
        <h2 style={{ fontSize: '32px', fontWeight: 700, color: isDark ? '#ffffff' : '#111827', textAlign: 'center', marginBottom: '32px' }}>
          Our Offices
        </h2>
        <div style={officesGridStyle}>
          {offices.map((office, index) => (
            <div key={index} style={officeCardStyle}>
              <div style={officeIconStyle}>
                <Building style={{ width: 32, height: 32, color: '#ffffff' }} />
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
          <h2 style={{ fontSize: '28px', fontWeight: 700, color: isDark ? '#ffffff' : '#111827', marginBottom: '16px' }}>
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
