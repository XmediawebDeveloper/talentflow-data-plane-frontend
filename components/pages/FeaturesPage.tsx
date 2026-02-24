import { useState, useEffect } from "react";
import {
  Sparkles,
  FileText,
  Video,
  BarChart3,
  Users,
  Shield,
  Zap,
  Brain,
  Target,
  Clock,
  CheckCircle2,
  ArrowRight,
  Globe,
  Lock,
  Cpu,
  MessageSquare,
} from "lucide-react";

interface FeaturesPageProps {
  onNavigate: (page: string) => void;
}

export default function FeaturesPage({ onNavigate }: FeaturesPageProps) {
  const [isMobile, setIsMobile] = useState(false);
  const [isTablet, setIsTablet] = useState(false);
  const [isDark, setIsDark] = useState(false);
  const [trialDays, setTrialDays] = useState<number>(14);

  useEffect(() => {
    const checkScreen = () => {
      const w = window.innerWidth;
      setIsMobile(w < 640);
      setIsTablet(w >= 640 && w < 1024);
    };
    checkScreen();
    window.addEventListener('resize', checkScreen);
    setIsDark(document.documentElement.classList.contains('dark'));
    return () => window.removeEventListener('resize', checkScreen);
  }, []);

  // Fetch trial days from API
  useEffect(() => {
    const fetchTrialDays = async () => {
      try {
        const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';
        const response = await fetch(`${API_URL}/addons/free-trial`);
        if (response.ok) {
          const result = await response.json();
          const days = result?.data?.trial_days || 14;
          setTrialDays(days);
        }
      } catch (err) {
        console.error('Error fetching trial days:', err);
      }
    };
    fetchTrialDays();
  }, []);

  const pageStyle: React.CSSProperties = {
    minHeight: '100vh',
    backgroundColor: isDark ? '#0F172A' : '#ffffff',
    color: isDark ? '#ffffff' : '#111827',
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
    backgroundColor: isDark ? 'rgba(139, 92, 246, 0.2)' : '#EDE9FE',
    color: isDark ? '#C4B5FD' : '#7C3AED',
    fontSize: '14px',
    fontWeight: 600,
    marginBottom: '16px',
  };

  const titleStyle: React.CSSProperties = {
    fontSize: isMobile ? '28px' : isTablet ? '40px' : '56px',
    fontWeight: 700,
    color: isDark ? '#ffffff' : '#111827',
    marginBottom: '16px',
    lineHeight: 1.1,
  };

  const subtitleStyle: React.CSSProperties = {
    fontSize: isMobile ? '16px' : isTablet ? '18px' : '20px',
    color: isDark ? '#94A3B8' : '#6B7280',
    maxWidth: '672px',
    margin: '0 auto',
    lineHeight: 1.6,
  };

  const gridStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: isMobile ? '1fr' : isTablet ? 'repeat(2, 1fr)' : 'repeat(3, 1fr)',
    gap: isMobile ? '16px' : '32px',
    marginBottom: isMobile ? '40px' : isTablet ? '60px' : '80px',
  };

  const cardStyle: React.CSSProperties = {
    padding: isMobile ? '20px' : '32px',
    borderRadius: '16px',
    border: `1px solid ${isDark ? '#1E293B' : '#E5E7EB'}`,
    backgroundColor: isDark ? '#1E293B' : '#ffffff',
    transition: 'all 0.2s',
  };

  const iconBoxStyle = (gradient: string): React.CSSProperties => ({
    width: '64px',
    height: '64px',
    borderRadius: '16px',
    background: gradient,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: '24px',
    boxShadow: '0 10px 30px rgba(0,0,0,0.1)',
  });

  const cardTitleStyle: React.CSSProperties = {
    fontSize: isMobile ? '20px' : '24px',
    fontWeight: 700,
    color: isDark ? '#ffffff' : '#111827',
    marginBottom: '12px',
  };

  const cardDescStyle: React.CSSProperties = {
    color: isDark ? '#94A3B8' : '#6B7280',
    lineHeight: 1.6,
    marginBottom: '16px',
  };

  const featureListStyle: React.CSSProperties = {
    listStyle: 'none',
    padding: 0,
    margin: 0,
  };

  const featureItemStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '8px',
    color: isDark ? '#CBD5E1' : '#374151',
    fontSize: '14px',
  };

  const ctaSectionStyle: React.CSSProperties = {
    textAlign: 'center',
    padding: isMobile ? '40px 20px' : isTablet ? '60px 20px' : '80px 0',
    borderRadius: isMobile ? '16px' : '24px',
    background: 'linear-gradient(135deg, #667EEA 0%, #764BA2 100%)',
  };

  const ctaTitleStyle: React.CSSProperties = {
    fontSize: isMobile ? '24px' : isTablet ? '36px' : '48px',
    fontWeight: 700,
    color: '#ffffff',
    marginBottom: '16px',
  };

  const ctaSubtitleStyle: React.CSSProperties = {
    fontSize: isMobile ? '16px' : isTablet ? '18px' : '20px',
    color: 'rgba(255,255,255,0.9)',
    marginBottom: '32px',
  };

  const ctaButtonStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    padding: isMobile ? '12px 24px' : '16px 32px',
    fontSize: isMobile ? '16px' : '18px',
    fontWeight: 500,
    borderRadius: '12px',
    backgroundColor: '#ffffff',
    color: '#7C3AED',
    border: 'none',
    cursor: 'pointer',
    boxShadow: '0 10px 40px rgba(0,0,0,0.2)',
  };

  const features = [
    {
      icon: Brain,
      title: "AI Resume Scoring",
      description: "Our AI analyzes resumes against job requirements with 95% accuracy, saving hours of manual screening.",
      gradient: "linear-gradient(135deg, #3B82F6, #8B5CF6)",
      points: ["Smart keyword matching", "Skills gap analysis", "Experience validation", "Cultural fit scoring"],
    },
    {
      icon: Video,
      title: "Video Interviews",
      description: "Conduct live or async video interviews with AI-powered analysis of verbal and non-verbal cues.",
      gradient: "linear-gradient(135deg, #8B5CF6, #EC4899)",
      points: ["One-way video responses", "Live interview rooms", "AI sentiment analysis", "Automatic transcription"],
    },
    {
      icon: FileText,
      title: "Smart Assessments",
      description: "Create custom skill assessments with automatic grading and detailed candidate insights.",
      gradient: "linear-gradient(135deg, #F97316, #EF4444)",
      points: ["Custom test builder", "Code challenges", "Personality tests", "Auto-grading"],
    },
    {
      icon: BarChart3,
      title: "Advanced Analytics",
      description: "Get real-time insights into your hiring pipeline with comprehensive dashboards and reports.",
      gradient: "linear-gradient(135deg, #22C55E, #14B8A6)",
      points: ["Pipeline metrics", "Time-to-hire tracking", "Source analytics", "Team performance"],
    },
    {
      icon: Users,
      title: "Team Collaboration",
      description: "Work seamlessly with hiring managers and team members with shared feedback and scorecards.",
      gradient: "linear-gradient(135deg, #EC4899, #8B5CF6)",
      points: ["Shared scorecards", "Interview scheduling", "Feedback collection", "Role-based access"],
    },
    {
      icon: Shield,
      title: "Enterprise Security",
      description: "Bank-level security with SOC 2 Type II certification and GDPR compliance built-in.",
      gradient: "linear-gradient(135deg, #14B8A6, #3B82F6)",
      points: ["SOC 2 certified", "GDPR compliant", "SSO integration", "Data encryption"],
    },
    {
      icon: Globe,
      title: "Global Hiring",
      description: "Hire from anywhere with multi-language support and localized compliance features.",
      gradient: "linear-gradient(135deg, #6366F1, #8B5CF6)",
      points: ["Multi-language UI", "Local compliance", "Time zone support", "Currency conversion"],
    },
    {
      icon: Cpu,
      title: "ATS Integration",
      description: "Seamlessly connect with your existing tools and workflows through our robust API.",
      gradient: "linear-gradient(135deg, #F59E0B, #F97316)",
      points: ["REST API access", "Webhook support", "Popular ATS integrations", "Custom workflows"],
    },
    {
      icon: MessageSquare,
      title: "Candidate Communication",
      description: "Engage candidates with automated emails, SMS, and in-app messaging throughout the process.",
      gradient: "linear-gradient(135deg, #10B981, #22C55E)",
      points: ["Email templates", "SMS notifications", "Bulk messaging", "Response tracking"],
    },
  ];

  return (
    <div style={pageStyle}>
      <div style={containerStyle}>
        {/* Header */}
        <div style={headerStyle}>
          <div style={badgeStyle}>
            <Zap style={{ width: 16, height: 16 }} />
            Powerful Features
          </div>
          <h1 style={titleStyle}>Everything you need to hire smarter</h1>
          <p style={subtitleStyle}>
            Our comprehensive suite of AI-powered tools helps you find, evaluate, and hire the best talent faster than ever.
          </p>
        </div>

        {/* Features Grid */}
        <div style={gridStyle}>
          {features.map((feature, index) => {
            const Icon = feature.icon;
            return (
              <div key={index} style={cardStyle}>
                <div style={iconBoxStyle(feature.gradient)}>
                  <Icon style={{ width: 32, height: 32, color: '#ffffff' }} />
                </div>
                <h3 style={cardTitleStyle}>{feature.title}</h3>
                <p style={cardDescStyle}>{feature.description}</p>
                <ul style={featureListStyle}>
                  {feature.points.map((point, idx) => (
                    <li key={idx} style={featureItemStyle}>
                      <CheckCircle2 style={{ width: 16, height: 16, color: '#22C55E', flexShrink: 0 }} />
                      {point}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>

        {/* CTA Section */}
        <div style={ctaSectionStyle}>
          <h2 style={ctaTitleStyle}>Ready to transform your hiring?</h2>
          <p style={ctaSubtitleStyle}>Start your {trialDays}-day free trial today. No credit card required.</p>
          <button onClick={() => onNavigate("signup")} style={ctaButtonStyle}>
            Get Started Free
            <ArrowRight style={{ width: 20, height: 20 }} />
          </button>
        </div>
      </div>
    </div>
  );
}
