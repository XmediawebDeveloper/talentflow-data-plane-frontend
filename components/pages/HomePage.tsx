import { useState, useEffect } from "react";
import { useTheme } from 'next-themes';
import {
  ArrowRight,
  Play,
  Sparkles,
  TrendingUp,
  Users,
  Shield,
  Zap,
  Clock,
  CheckCircle2,
  Star,
  BarChart3,
  Video,
  FileText,
  X,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  Upload,
  Search,
  Send,
} from "lucide-react";

interface HomePageProps {
  onNavigate: (page: string) => void;
}

export default function HomePage({ onNavigate }: HomePageProps) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  const [demoModalOpen, setDemoModalOpen] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isSmallMobile, setIsSmallMobile] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [isTablet, setIsTablet] = useState(false);
  const [trialDays, setTrialDays] = useState<number>(14);

  useEffect(() => {
    const checkScreen = () => {
      const w = window.innerWidth;
      setIsSmallMobile(w < 400);
      setIsMobile(w < 640);
      setIsTablet(w >= 640 && w < 1024);
    };
    checkScreen();
    window.addEventListener('resize', checkScreen);

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

  // Styles
  const pageStyle: React.CSSProperties = {
    minHeight: '100vh',
    overflow: 'hidden',
    backgroundColor: isDark ? '#0F172A' : '#ffffff',
    color: isDark ? '#ffffff' : '#111827',
  };

  const heroSectionStyle: React.CSSProperties = {
    position: 'relative',
    minHeight: isMobile ? '80vh' : '90vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  };

  const gradientBgStyle: React.CSSProperties = {
    position: 'absolute',
    inset: 0,
    background: 'linear-gradient(135deg, #667EEA 0%, #764BA2 50%, #F093FB 100%)',
    opacity: isDark ? 0.2 : 0.1,
  };

  const containerStyle: React.CSSProperties = {
    maxWidth: '1400px',
    margin: '0 auto',
    padding: isMobile ? '0 16px' : isTablet ? '0 20px' : '0 24px',
    position: 'relative',
    zIndex: 10,
  };

  const textCenterStyle: React.CSSProperties = {
    textAlign: 'center',
  };

  const badgeStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    padding: '12px 24px',
    borderRadius: '9999px',
    backgroundColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.85)',
    border: `1px solid ${isDark ? 'rgba(255,255,255,0.2)' : 'rgba(102,126,234,0.3)'}`,
    backdropFilter: 'blur(12px)',
    marginBottom: '32px',
  };

  const badgeTextStyle: React.CSSProperties = {
    fontSize: '14px',
    fontWeight: 500,
    color: isDark ? '#F1F5F9' : '#374151',
  };

  const h1Style: React.CSSProperties = {
    fontSize: isMobile ? '32px' : isTablet ? '52px' : '80px',
    fontWeight: 700,
    lineHeight: 1.1,
    letterSpacing: '-0.02em',
    marginBottom: isMobile ? '20px' : '32px',
  };

  const gradientTextStyle: React.CSSProperties = {
    background: 'linear-gradient(to right, #667EEA, #764BA2)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    backgroundClip: 'text',
  };

  const subHeadlineStyle: React.CSSProperties = {
    fontSize: isMobile ? '15px' : isTablet ? '18px' : '24px',
    color: isDark ? '#CBD5E1' : '#4B5563',
    maxWidth: '768px',
    margin: isMobile ? '0 auto 32px' : '0 auto 48px',
    lineHeight: 1.6,
  };

  const ctaContainerStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: isMobile ? 'column' : 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '16px',
    marginBottom: '32px',
  };

  const primaryButtonStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    height: isMobile ? '52px' : '64px',
    padding: isMobile ? '0 24px' : '0 40px',
    fontSize: isMobile ? '16px' : '18px',
    fontWeight: 500,
    borderRadius: isMobile ? '12px' : '16px',
    cursor: 'pointer',
    border: 'none',
    background: 'linear-gradient(to right, #667EEA, #764BA2)',
    color: '#ffffff',
    boxShadow: '0 10px 40px rgba(102, 126, 234, 0.3)',
    transition: 'all 0.2s',
    width: isMobile ? '100%' : 'auto',
  };

  const outlineButtonStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    height: isMobile ? '52px' : '64px',
    padding: isMobile ? '0 24px' : '0 40px',
    fontSize: isMobile ? '16px' : '18px',
    fontWeight: 500,
    borderRadius: isMobile ? '12px' : '16px',
    cursor: 'pointer',
    backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.8)',
    color: isDark ? '#ffffff' : '#374151',
    border: `2px solid ${isDark ? 'rgba(255,255,255,0.2)' : '#E5E7EB'}`,
    transition: 'all 0.2s',
    width: isMobile ? '100%' : 'auto',
  };

  const trustIndicatorsStyle: React.CSSProperties = {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '32px',
    color: isDark ? '#94A3B8' : '#6B7280',
    fontSize: '14px',
  };

  const trustItemStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  };

  // Stats section styles
  const statsSectionStyle: React.CSSProperties = {
    padding: isMobile ? '40px 0' : isTablet ? '60px 0' : '80px 0',
    backgroundColor: isDark ? '#0F172A' : '#ffffff',
  };

  const statsGridStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: isSmallMobile ? '1fr' : isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)',
    gap: isSmallMobile ? '10px' : isMobile ? '12px' : '24px',
  };

  const statCardStyle: React.CSSProperties = {
    padding: isSmallMobile ? '16px 12px' : isMobile ? '20px' : '32px',
    textAlign: 'center',
    borderRadius: isSmallMobile ? '10px' : '12px',
    border: `1px solid ${isDark ? '#1E293B' : '#E5E7EB'}`,
    backgroundColor: isDark ? '#1E293B' : '#ffffff',
    display: isSmallMobile ? 'flex' : 'block',
    flexDirection: isSmallMobile ? 'row' : undefined,
    alignItems: isSmallMobile ? 'center' : undefined,
    gap: isSmallMobile ? '12px' : undefined,
  };

  const statIconBoxStyle = (gradient: string): React.CSSProperties => ({
    width: isSmallMobile ? '40px' : '56px',
    height: isSmallMobile ? '40px' : '56px',
    minWidth: isSmallMobile ? '40px' : '56px',
    borderRadius: isSmallMobile ? '10px' : '16px',
    background: gradient,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    margin: isSmallMobile ? '0' : '0 auto 16px',
  });

  const statNumberStyle: React.CSSProperties = {
    fontSize: isSmallMobile ? '20px' : isMobile ? '24px' : isTablet ? '30px' : '36px',
    fontWeight: 700,
    color: isDark ? '#ffffff' : '#111827',
    marginBottom: isSmallMobile ? '2px' : '8px',
  };

  const statLabelStyle: React.CSSProperties = {
    color: isDark ? '#94A3B8' : '#6B7280',
    fontSize: isSmallMobile ? '12px' : '14px',
  };

  // Features section styles
  const featuresSectionStyle: React.CSSProperties = {
    padding: isMobile ? '48px 0' : isTablet ? '72px 0' : '96px 0',
    backgroundColor: isDark ? 'rgba(30, 41, 59, 0.5)' : '#F9FAFB',
  };

  const sectionHeadingStyle: React.CSSProperties = {
    textAlign: 'center',
    marginBottom: isMobile ? '32px' : isTablet ? '48px' : '64px',
  };

  const featureBadgeStyle: React.CSSProperties = {
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

  const sectionTitleStyle: React.CSSProperties = {
    fontSize: isMobile ? '24px' : isTablet ? '36px' : '48px',
    fontWeight: 700,
    color: isDark ? '#ffffff' : '#111827',
    marginBottom: '16px',
  };

  const sectionSubtitleStyle: React.CSSProperties = {
    fontSize: isMobile ? '16px' : isTablet ? '18px' : '20px',
    color: isDark ? '#94A3B8' : '#6B7280',
    maxWidth: '672px',
    margin: '0 auto',
  };

  const featuresGridStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: isMobile ? '1fr' : isTablet ? 'repeat(2, 1fr)' : 'repeat(3, 1fr)',
    gap: isMobile ? '16px' : '32px',
  };

  const featureCardStyle: React.CSSProperties = {
    padding: isMobile ? '20px' : '32px',
    borderRadius: '12px',
    border: `1px solid ${isDark ? '#1E293B' : '#E5E7EB'}`,
    backgroundColor: isDark ? '#1E293B' : '#ffffff',
  };

  const featureIconBoxStyle = (gradient: string): React.CSSProperties => ({
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

  const featureTitleStyle: React.CSSProperties = {
    fontSize: isMobile ? '20px' : '24px',
    fontWeight: 700,
    color: isDark ? '#ffffff' : '#111827',
    marginBottom: '12px',
  };

  const featureDescStyle: React.CSSProperties = {
    color: isDark ? '#94A3B8' : '#6B7280',
    lineHeight: 1.6,
  };

  // How it works section
  const howItWorksSectionStyle: React.CSSProperties = {
    padding: isMobile ? '48px 0' : isTablet ? '72px 0' : '96px 0',
    backgroundColor: isDark ? '#0F172A' : '#ffffff',
  };

  const howItWorksBadgeStyle: React.CSSProperties = {
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

  const stepsGridStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: isMobile ? '1fr' : isTablet ? '1fr' : 'repeat(3, 1fr)',
    gap: isMobile ? '32px' : '48px',
    maxWidth: '1024px',
    margin: '0 auto',
  };

  const stepStyle: React.CSSProperties = {
    textAlign: 'center',
  };

  const stepNumberStyle = (gradient: string): React.CSSProperties => ({
    fontSize: isMobile ? '64px' : isTablet ? '80px' : '96px',
    fontWeight: 700,
    background: gradient,
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    backgroundClip: 'text',
    marginBottom: isMobile ? '16px' : '24px',
  });

  const stepTitleStyle: React.CSSProperties = {
    fontSize: isMobile ? '20px' : '24px',
    fontWeight: 700,
    color: isDark ? '#ffffff' : '#111827',
    marginBottom: '16px',
  };

  const stepDescStyle: React.CSSProperties = {
    color: isDark ? '#94A3B8' : '#6B7280',
    lineHeight: 1.6,
  };

  // CTA section
  const ctaSectionStyle: React.CSSProperties = {
    position: 'relative',
    padding: isMobile ? '48px 0' : isTablet ? '72px 0' : '96px 0',
    overflow: 'hidden',
  };

  const ctaGradientBgStyle: React.CSSProperties = {
    position: 'absolute',
    inset: 0,
    background: 'linear-gradient(to right, #667EEA, #764BA2)',
    opacity: 0.9,
  };

  const ctaContentStyle: React.CSSProperties = {
    position: 'relative',
    zIndex: 10,
    textAlign: 'center',
    maxWidth: '896px',
    margin: '0 auto',
  };

  const ctaHeadingStyle: React.CSSProperties = {
    fontSize: isMobile ? '26px' : isTablet ? '40px' : '60px',
    fontWeight: 700,
    color: '#ffffff',
    lineHeight: 1.2,
    marginBottom: '24px',
  };

  const ctaSubtextStyle: React.CSSProperties = {
    fontSize: isMobile ? '16px' : isTablet ? '18px' : '20px',
    color: 'rgba(255,255,255,0.9)',
    maxWidth: '672px',
    margin: isMobile ? '0 auto 32px' : '0 auto 48px',
    lineHeight: 1.6,
  };

  const ctaButtonPrimaryStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    height: isMobile ? '52px' : '64px',
    padding: isMobile ? '0 24px' : '0 48px',
    fontSize: isMobile ? '16px' : '18px',
    fontWeight: 500,
    borderRadius: isMobile ? '12px' : '16px',
    cursor: 'pointer',
    border: 'none',
    backgroundColor: '#ffffff',
    color: '#7C3AED',
    boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
    transition: 'all 0.2s',
    width: isMobile ? '100%' : 'auto',
  };

  const ctaButtonSecondaryStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: isMobile ? '52px' : '64px',
    padding: isMobile ? '0 24px' : '0 48px',
    fontSize: isMobile ? '16px' : '18px',
    fontWeight: 500,
    borderRadius: isMobile ? '12px' : '16px',
    cursor: 'pointer',
    backgroundColor: 'transparent',
    color: '#ffffff',
    border: '2px solid #ffffff',
    transition: 'all 0.2s',
    width: isMobile ? '100%' : 'auto',
  };

  const ctaTrustStyle: React.CSSProperties = {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '32px',
    color: 'rgba(255,255,255,0.8)',
    marginTop: '32px',
  };

  // Modal styles
  const modalOverlayStyle: React.CSSProperties = {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(0,0,0,0.9)',
    backdropFilter: 'blur(4px)',
    zIndex: 50,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '16px',
  };

  const modalContentStyle: React.CSSProperties = {
    position: 'relative',
    width: '100%',
    maxWidth: isFullscreen ? '100%' : '1024px',
    height: isFullscreen ? '100%' : 'auto',
    borderRadius: isFullscreen ? 0 : '12px',
    overflow: 'hidden',
    backgroundColor: isDark ? '#1E293B' : '#ffffff',
  };

  const stats = [
    { number: "2,500+", label: "Active Customers", icon: Users, gradient: "linear-gradient(135deg, #3B82F6, #8B5CF6)" },
    { number: "5M+", label: "Resumes Processed", icon: FileText, gradient: "linear-gradient(135deg, #8B5CF6, #EC4899)" },
    { number: "40%", label: "Faster Hiring", icon: TrendingUp, gradient: "linear-gradient(135deg, #22C55E, #14B8A6)" },
    { number: "98%", label: "Satisfaction", icon: Star, gradient: "linear-gradient(135deg, #F97316, #EF4444)" },
  ];

  const features = [
    { icon: Sparkles, title: "AI Resume Scoring", description: "Automatically rank candidates based on job requirements with 95% accuracy", gradient: "linear-gradient(135deg, #3B82F6, #8B5CF6)" },
    { icon: Video, title: "Video Interviews", description: "Conduct and record video interviews with AI-powered sentiment analysis", gradient: "linear-gradient(135deg, #8B5CF6, #EC4899)" },
    { icon: BarChart3, title: "Advanced Analytics", description: "Get insights into your hiring pipeline with real-time dashboards", gradient: "linear-gradient(135deg, #22C55E, #14B8A6)" },
    { icon: FileText, title: "Smart Assessments", description: "Create custom tests and quizzes with automatic grading", gradient: "linear-gradient(135deg, #F97316, #EF4444)" },
    { icon: Users, title: "Team Collaboration", description: "Work together with hiring managers and interviewers in real-time", gradient: "linear-gradient(135deg, #EC4899, #8B5CF6)" },
    { icon: Shield, title: "Enterprise Security", description: "SOC 2 Type II certified with bank-level encryption", gradient: "linear-gradient(135deg, #14B8A6, #3B82F6)" },
  ];

  const steps = [
    { step: "01", title: "Create Your Account", description: "Sign up in under 2 minutes with no credit card required", gradient: "linear-gradient(135deg, #3B82F6, #8B5CF6)" },
    { step: "02", title: "Post Your Jobs", description: "Add job descriptions and let our AI automatically parse requirements", gradient: "linear-gradient(135deg, #8B5CF6, #EC4899)" },
    { step: "03", title: "Start Hiring", description: "Receive ranked candidates and schedule interviews instantly", gradient: "linear-gradient(135deg, #EC4899, #F97316)" },
  ];

  return (
    <div style={pageStyle}>
      {/* Hero Section */}
      <section style={heroSectionStyle}>
        <div style={gradientBgStyle}></div>

        <div style={containerStyle}>
          <div style={textCenterStyle}>
            {/* Badge */}
            <div style={badgeStyle}>
              <Sparkles style={{ width: 16, height: 16, color: isDark ? '#A78BFA' : '#667EEA' }} />
              <span style={badgeTextStyle}>Rated 4.9/5 by 2,500+ recruitment teams</span>
              <div style={{ display: 'flex', gap: '2px' }}>
                {[...Array(5)].map((_, i) => (
                  <Star key={i} style={{ width: 12, height: 12, fill: '#667EEA', color: '#667EEA' }} />
                ))}
              </div>
            </div>

            {/* Main Headline */}
            <h1 style={h1Style}>
              <span style={{ color: isDark ? '#ffffff' : '#111827' }}>Hire Smarter with</span>
              <br />
              <span style={gradientTextStyle}>AI-Powered Recruiting</span>
            </h1>

            {/* Subheadline */}
            <p style={subHeadlineStyle}>
              Transform your hiring process with intelligent resume screening, automated assessments, and AI-powered interviews. Save{" "}
              <span style={{ fontWeight: 600, color: '#667EEA' }}>15+ hours per week</span>.
            </p>

            {/* CTA Buttons */}
            <div style={ctaContainerStyle}>
              <button onClick={() => onNavigate("signup")} style={primaryButtonStyle}>
                Get Started Free
                <ArrowRight style={{ width: 20, height: 20 }} />
              </button>
              <button onClick={() => setDemoModalOpen(true)} style={outlineButtonStyle}>
                <Play style={{ width: 20, height: 20 }} />
                Watch Demo
              </button>
            </div>

            {/* Trust Indicators */}
            <div style={trustIndicatorsStyle}>
              <div style={trustItemStyle}>
                <CheckCircle2 style={{ width: 20, height: 20, color: '#22C55E' }} />
                <span>{trialDays}-{trialDays === 1 ? 'day' : 'days'} free trial</span>
              </div>
              <div style={trustItemStyle}>
                <CheckCircle2 style={{ width: 20, height: 20, color: '#22C55E' }} />
                <span>No credit card required</span>
              </div>
              <div style={trustItemStyle}>
                <CheckCircle2 style={{ width: 20, height: 20, color: '#22C55E' }} />
                <span>Setup in 5 minutes</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Demo Modal */}
      {demoModalOpen && (
        <div style={modalOverlayStyle}>
          <div style={modalContentStyle}>
            <div style={{
              position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10,
              background: 'linear-gradient(to bottom, rgba(0,0,0,0.8), transparent)',
              padding: '24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{
                  width: 48, height: 48, borderRadius: 12,
                  background: 'linear-gradient(135deg, #8B5CF6, #EC4899)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                  <Play style={{ width: 24, height: 24, color: '#fff' }} />
                </div>
                <div>
                  <h3 style={{ fontWeight: 700, color: '#fff', fontSize: 18 }}>TalentFlow Product Demo</h3>
                  <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.8)' }}>See how TalentFlow transforms recruiting</p>
                </div>
              </div>
              <button onClick={() => setDemoModalOpen(false)} style={{ padding: 8, background: 'none', border: 'none', cursor: 'pointer' }}>
                <X style={{ width: 24, height: 24, color: '#fff' }} />
              </button>
            </div>

            <div style={{
              aspectRatio: isFullscreen ? 'auto' : '16/9',
              height: isFullscreen ? '100vh' : 'auto',
              background: 'linear-gradient(135deg, #1E293B, #581C87, #9D174D)',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <div style={{ textAlign: 'center', padding: 32 }}>
                <div style={{
                  width: 128, height: 128, margin: '0 auto 24px',
                  borderRadius: '50%', background: 'linear-gradient(135deg, #8B5CF6, #EC4899)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                  <Video style={{ width: 64, height: 64, color: '#fff' }} />
                </div>
                <h4 style={{ fontSize: 30, fontWeight: 700, color: '#fff', marginBottom: 12 }}>Product Demo Video</h4>
                <p style={{ fontSize: 18, color: 'rgba(255,255,255,0.8)', maxWidth: 640, margin: '0 auto 32px' }}>
                  Watch how TalentFlow streamlines your entire recruiting process
                </p>
                <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 16, justifyContent: 'center' }}>
                  <button onClick={() => { setDemoModalOpen(false); window.location.href = `https://${process.env.NEXT_PUBLIC_BASE_DOMAIN}/signup?plan=free_trial`; }} style={primaryButtonStyle}>
                    Start Free Trial <ArrowRight style={{ width: 20, height: 20 }} />
                  </button>
                  <button onClick={() => { setDemoModalOpen(false); onNavigate("contact"); }}
                    style={{ ...outlineButtonStyle, borderColor: '#fff', color: '#fff', backgroundColor: 'transparent' }}>
                    Schedule Live Demo
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Stats Section */}
      <section style={statsSectionStyle}>
        <div style={containerStyle}>
          <div style={statsGridStyle}>
            {stats.map((stat, index) => {
              const Icon = stat.icon;
              return (
                <div key={index} style={statCardStyle}>
                  <div style={statIconBoxStyle(stat.gradient)}>
                    <Icon style={{ width: isSmallMobile ? 20 : 28, height: isSmallMobile ? 20 : 28, color: '#fff' }} />
                  </div>
                  {isSmallMobile ? (
                    <div style={{ textAlign: 'left' }}>
                      <div style={statNumberStyle}>{stat.number}</div>
                      <div style={statLabelStyle}>{stat.label}</div>
                    </div>
                  ) : (
                    <>
                      <div style={statNumberStyle}>{stat.number}</div>
                      <div style={statLabelStyle}>{stat.label}</div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section style={featuresSectionStyle}>
        <div style={containerStyle}>
          <div style={sectionHeadingStyle}>
            <div style={featureBadgeStyle}>
              <Zap style={{ width: 16, height: 16 }} />
              Powerful Features
            </div>
            <h2 style={sectionTitleStyle}>Everything You Need to Hire Better</h2>
            <p style={sectionSubtitleStyle}>
              AI-powered tools that streamline every step of your recruitment process
            </p>
          </div>

          <div style={featuresGridStyle}>
            {features.map((feature, index) => {
              const Icon = feature.icon;
              return (
                <div key={index} style={featureCardStyle}>
                  <div style={featureIconBoxStyle(feature.gradient)}>
                    <Icon style={{ width: 32, height: 32, color: '#fff' }} />
                  </div>
                  <h3 style={featureTitleStyle}>{feature.title}</h3>
                  <p style={featureDescStyle}>{feature.description}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section style={howItWorksSectionStyle}>
        <div style={containerStyle}>
          <div style={sectionHeadingStyle}>
            <div style={howItWorksBadgeStyle}>
              <Clock style={{ width: 16, height: 16 }} />
              Simple Process
            </div>
            <h2 style={sectionTitleStyle}>Get Started in Minutes</h2>
            <p style={sectionSubtitleStyle}>
              Three simple steps to transform your hiring process
            </p>
          </div>

          <div style={stepsGridStyle}>
            {steps.map((item, index) => (
              <div key={index} style={stepStyle}>
                <div style={stepNumberStyle(item.gradient)}>{item.step}</div>
                <h3 style={stepTitleStyle}>{item.title}</h3>
                <p style={stepDescStyle}>{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section style={ctaSectionStyle}>
        <div style={ctaGradientBgStyle}></div>
        <div style={{ ...containerStyle, ...ctaContentStyle }}>
          <h2 style={ctaHeadingStyle}>Ready to Transform Your Hiring?</h2>
          <p style={ctaSubtextStyle}>
            Join 2,500+ companies using TalentFlow to build amazing teams faster
          </p>
          <div style={ctaContainerStyle}>
            <button onClick={() => { window.location.href = `https://${process.env.NEXT_PUBLIC_BASE_DOMAIN}/signup?plan=free_trial`; }} style={ctaButtonPrimaryStyle}>
              Start Free Trial
              <ArrowRight style={{ width: 20, height: 20 }} />
            </button>
            <button onClick={() => onNavigate("pricing")} style={ctaButtonSecondaryStyle}>
              View Pricing
            </button>
          </div>

          <div style={ctaTrustStyle}>
            <div style={trustItemStyle}>
              <Shield style={{ width: 20, height: 20 }} />
              <span>SOC 2 Certified</span>
            </div>
            <div style={trustItemStyle}>
              <Users style={{ width: 20, height: 20 }} />
              <span>2,500+ Customers</span>
            </div>
            <div style={trustItemStyle}>
              <Star style={{ width: 20, height: 20, fill: 'currentColor' }} />
              <span>4.9/5 Rating</span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
