import { useState, useEffect } from "react";
import { useTheme } from 'next-themes';
import {
  Upload,
  Brain,
  Send,
  Video,
  CheckCircle2,
  ArrowRight,
  Clock,
  FileText,
  Users,
  BarChart3,
  Zap,
  Target,
} from "lucide-react";

interface HowItWorksPageProps {
  onNavigate: (page: string) => void;
}

export default function HowItWorksPage({ onNavigate }: HowItWorksPageProps) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  const [isMobile, setIsMobile] = useState(false);
  const [isTablet, setIsTablet] = useState(false);

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
    marginBottom: isMobile ? '40px' : isTablet ? '60px' : '80px',
  };

  const badgeStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 16px',
    borderRadius: '9999px',
    backgroundColor: isDark ? 'rgba(34, 197, 94, 0.2)' : 'var(--raw-dcfce7)',
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

  const stepsContainerStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: isMobile ? '40px' : isTablet ? '48px' : '64px',
    marginBottom: isMobile ? '40px' : isTablet ? '60px' : '80px',
  };

  const stepRowStyle = (reverse: boolean): React.CSSProperties => ({
    display: 'flex',
    flexDirection: (isMobile || isTablet) ? 'column' : (reverse ? 'row-reverse' : 'row'),
    alignItems: 'center',
    gap: isMobile ? '24px' : '48px',
  });

  const stepContentStyle: React.CSSProperties = {
    flex: 1,
  };

  const stepNumberStyle = (gradient: string): React.CSSProperties => ({
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '48px',
    height: '48px',
    borderRadius: '12px',
    background: gradient,
    color: 'var(--raw-ffffff)',
    fontSize: '20px',
    fontWeight: 700,
    marginBottom: '16px',
  });

  const stepTitleStyle: React.CSSProperties = {
    fontSize: isMobile ? '24px' : isTablet ? '28px' : '32px',
    fontWeight: 700,
    color: isDark ? 'var(--raw-ffffff)' : 'var(--raw-111827)',
    marginBottom: '16px',
  };

  const stepDescStyle: React.CSSProperties = {
    fontSize: isMobile ? '15px' : isTablet ? '16px' : '18px',
    color: isDark ? 'var(--raw-94a3b8)' : 'var(--raw-6b7280)',
    lineHeight: 1.6,
    marginBottom: '24px',
  };

  const stepFeaturesStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  };

  const stepFeatureItemStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    color: isDark ? 'var(--raw-cbd5e1)' : 'var(--raw-374151)',
  };

  const stepImageStyle: React.CSSProperties = {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  };

  const imageBoxStyle = (gradient: string): React.CSSProperties => ({
    width: '100%',
    maxWidth: '500px',
    aspectRatio: '4/3',
    borderRadius: '24px',
    background: gradient,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
  });

  const statsGridStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)',
    gap: isMobile ? '16px' : '24px',
    marginBottom: isMobile ? '40px' : isTablet ? '60px' : '80px',
    padding: isMobile ? '24px' : isTablet ? '36px' : '48px',
    borderRadius: isMobile ? '16px' : '24px',
    backgroundColor: isDark ? 'var(--raw-1e293b)' : 'var(--raw-f9fafb)',
  };

  const statStyle: React.CSSProperties = {
    textAlign: 'center',
  };

  const statNumberStyle: React.CSSProperties = {
    fontSize: isMobile ? '32px' : isTablet ? '40px' : '48px',
    fontWeight: 700,
    background: 'linear-gradient(135deg, var(--raw-667eea), var(--raw-764ba2))',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    backgroundClip: 'text',
    marginBottom: '8px',
  };

  const statLabelStyle: React.CSSProperties = {
    color: isDark ? 'var(--raw-94a3b8)' : 'var(--raw-6b7280)',
    fontSize: '16px',
  };

  const ctaSectionStyle: React.CSSProperties = {
    textAlign: 'center',
    padding: isMobile ? '40px 20px' : isTablet ? '60px 32px' : '80px 40px',
    borderRadius: isMobile ? '16px' : '24px',
    background: 'linear-gradient(135deg, var(--raw-667eea) 0%, var(--raw-764ba2) 100%)',
  };

  const ctaTitleStyle: React.CSSProperties = {
    fontSize: isMobile ? '24px' : isTablet ? '36px' : '48px',
    fontWeight: 700,
    color: 'var(--raw-ffffff)',
    marginBottom: '16px',
  };

  const ctaSubtitleStyle: React.CSSProperties = {
    fontSize: isMobile ? '16px' : isTablet ? '18px' : '20px',
    color: 'rgba(255,255,255,0.9)',
    marginBottom: '32px',
    maxWidth: '600px',
    margin: '0 auto 32px',
  };

  const ctaButtonStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    padding: isMobile ? '12px 24px' : '16px 32px',
    fontSize: isMobile ? '16px' : '18px',
    fontWeight: 500,
    borderRadius: '12px',
    backgroundColor: 'var(--raw-ffffff)',
    color: 'var(--raw-7c3aed)',
    border: 'none',
    cursor: 'pointer',
    boxShadow: '0 10px 40px rgba(0,0,0,0.2)',
  };

  const steps = [
    {
      number: "1",
      title: "Upload Resumes",
      description: "Bulk upload resumes in any format - PDF, Word, or even images. Our AI instantly parses and organizes candidate data.",
      gradient: "linear-gradient(135deg, var(--raw-3b82f6), var(--raw-8b5cf6))",
      icon: Upload,
      features: [
        "Drag & drop bulk upload",
        "Automatic data extraction",
        "Duplicate detection",
        "Smart categorization",
      ],
    },
    {
      number: "2",
      title: "AI Screening",
      description: "Our AI analyzes each resume against your job requirements, scoring and ranking candidates automatically.",
      gradient: "linear-gradient(135deg, var(--raw-8b5cf6), var(--raw-ec4899))",
      icon: Brain,
      features: [
        "Skills matching",
        "Experience validation",
        "Cultural fit analysis",
        "Red flag detection",
      ],
    },
    {
      number: "3",
      title: "Send Assessments",
      description: "Create custom assessments and send them to shortlisted candidates with one click.",
      gradient: "linear-gradient(135deg, var(--raw-f97316), var(--raw-ef4444))",
      icon: Send,
      features: [
        "Custom test builder",
        "Automated invitations",
        "Progress tracking",
        "Auto-grading",
      ],
    },
    {
      number: "4",
      title: "Video Interviews",
      description: "Conduct live or async video interviews with AI-powered insights and automatic transcription.",
      gradient: "linear-gradient(135deg, var(--raw-22c55e), var(--raw-14b8a6))",
      icon: Video,
      features: [
        "One-way video",
        "Live interviews",
        "AI sentiment analysis",
        "Interview scorecards",
      ],
    },
    {
      number: "5",
      title: "Hire the Best",
      description: "Make data-driven hiring decisions with comprehensive candidate profiles and team feedback.",
      gradient: "linear-gradient(135deg, var(--raw-ec4899), var(--raw-8b5cf6))",
      icon: Target,
      features: [
        "Complete candidate profiles",
        "Team collaboration",
        "Offer management",
        "Onboarding prep",
      ],
    },
  ];

  const stats = [
    { number: "75%", label: "Faster Screening" },
    { number: "40%", label: "Better Hires" },
    { number: "15hrs", label: "Saved Weekly" },
    { number: "98%", label: "Satisfaction" },
  ];

  return (
    <div style={pageStyle}>
      <div style={containerStyle}>
        {/* Header */}
        <div style={headerStyle}>
          <div style={badgeStyle}>
            <Clock style={{ width: 16, height: 16 }} />
            Simple Process
          </div>
          <h1 style={titleStyle}>How TalentFlow Works</h1>
          <p style={subtitleStyle}>
            From resume upload to final hire, our 5-step process streamlines your entire recruitment workflow.
          </p>
        </div>

        {/* Steps */}
        <div style={stepsContainerStyle}>
          {steps.map((step, index) => {
            const Icon = step.icon;
            return (
              <div key={index} style={stepRowStyle(index % 2 === 1)}>
                <div style={stepContentStyle}>
                  <div style={stepNumberStyle(step.gradient)}>{step.number}</div>
                  <h2 style={stepTitleStyle}>{step.title}</h2>
                  <p style={stepDescStyle}>{step.description}</p>
                  <div style={stepFeaturesStyle}>
                    {step.features.map((feature, idx) => (
                      <div key={idx} style={stepFeatureItemStyle}>
                        <CheckCircle2 style={{ width: 20, height: 20, color: 'var(--raw-22c55e)', flexShrink: 0 }} />
                        <span>{feature}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div style={stepImageStyle}>
                  <div style={imageBoxStyle(step.gradient)}>
                    <Icon style={{ width: 80, height: 80, color: 'var(--raw-ffffff)' }} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Stats */}
        <div style={statsGridStyle}>
          {stats.map((stat, index) => (
            <div key={index} style={statStyle}>
              <div style={statNumberStyle}>{stat.number}</div>
              <div style={statLabelStyle}>{stat.label}</div>
            </div>
          ))}
        </div>

        {/* CTA Section */}
        <div style={ctaSectionStyle}>
          <h2 style={ctaTitleStyle}>Ready to streamline your hiring?</h2>
          <p style={ctaSubtitleStyle}>
            Join thousands of companies using TalentFlow to build amazing teams.
          </p>
          <button onClick={() => onNavigate("signup")} style={ctaButtonStyle}>
            Start Free Trial
            <ArrowRight style={{ width: 20, height: 20 }} />
          </button>
        </div>
      </div>
    </div>
  );
}
