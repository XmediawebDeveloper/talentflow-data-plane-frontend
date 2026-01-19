import { useState, useEffect } from "react";
import {
  Users,
  Target,
  Heart,
  Lightbulb,
  Award,
  Globe,
  ArrowRight,
  Linkedin,
  Twitter,
} from "lucide-react";

interface AboutPageProps {
  onNavigate: (page: string) => void;
}

export default function AboutPage({ onNavigate }: AboutPageProps) {
  const [isMobile, setIsMobile] = useState(false);
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    setIsDark(document.documentElement.classList.contains('dark'));
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

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
    marginBottom: '80px',
  };

  const badgeStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 16px',
    borderRadius: '9999px',
    backgroundColor: isDark ? 'rgba(59, 130, 246, 0.2)' : '#DBEAFE',
    color: isDark ? '#93C5FD' : '#2563EB',
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

  const sectionStyle: React.CSSProperties = {
    marginBottom: '80px',
  };

  const sectionTitleStyle: React.CSSProperties = {
    fontSize: '32px',
    fontWeight: 700,
    color: isDark ? '#ffffff' : '#111827',
    marginBottom: '24px',
    textAlign: 'center',
  };

  const storyGridStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
    gap: '48px',
    alignItems: 'center',
    marginBottom: '80px',
  };

  const storyTextStyle: React.CSSProperties = {
    fontSize: '18px',
    color: isDark ? '#CBD5E1' : '#4B5563',
    lineHeight: 1.8,
  };

  const storyImageStyle: React.CSSProperties = {
    width: '100%',
    aspectRatio: '16/10',
    borderRadius: '24px',
    background: 'linear-gradient(135deg, #667EEA 0%, #764BA2 100%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  };

  const valuesGridStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)',
    gap: '32px',
    marginBottom: '80px',
  };

  const valueCardStyle: React.CSSProperties = {
    padding: '32px',
    borderRadius: '16px',
    border: `1px solid ${isDark ? '#1E293B' : '#E5E7EB'}`,
    backgroundColor: isDark ? '#1E293B' : '#ffffff',
    textAlign: 'center',
  };

  const valueIconStyle = (gradient: string): React.CSSProperties => ({
    width: '64px',
    height: '64px',
    borderRadius: '16px',
    background: gradient,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    margin: '0 auto 16px',
  });

  const valueTitleStyle: React.CSSProperties = {
    fontSize: '20px',
    fontWeight: 700,
    color: isDark ? '#ffffff' : '#111827',
    marginBottom: '8px',
  };

  const valueDescStyle: React.CSSProperties = {
    color: isDark ? '#94A3B8' : '#6B7280',
    lineHeight: 1.6,
  };

  const teamGridStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: isMobile ? '1fr' : 'repeat(4, 1fr)',
    gap: '32px',
    marginBottom: '80px',
  };

  const teamCardStyle: React.CSSProperties = {
    textAlign: 'center',
  };

  const teamAvatarStyle = (gradient: string): React.CSSProperties => ({
    width: '120px',
    height: '120px',
    borderRadius: '50%',
    background: gradient,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    margin: '0 auto 16px',
    fontSize: '36px',
    fontWeight: 700,
    color: '#ffffff',
  });

  const teamNameStyle: React.CSSProperties = {
    fontSize: '18px',
    fontWeight: 700,
    color: isDark ? '#ffffff' : '#111827',
    marginBottom: '4px',
  };

  const teamRoleStyle: React.CSSProperties = {
    color: isDark ? '#94A3B8' : '#6B7280',
    fontSize: '14px',
    marginBottom: '12px',
  };

  const socialLinksStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'center',
    gap: '8px',
  };

  const socialLinkStyle: React.CSSProperties = {
    width: '32px',
    height: '32px',
    borderRadius: '8px',
    backgroundColor: isDark ? '#334155' : '#F3F4F6',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
  };

  const statsGridStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)',
    gap: '24px',
    padding: '48px',
    borderRadius: '24px',
    background: 'linear-gradient(135deg, #667EEA 0%, #764BA2 100%)',
    marginBottom: '80px',
  };

  const statStyle: React.CSSProperties = {
    textAlign: 'center',
  };

  const statNumberStyle: React.CSSProperties = {
    fontSize: '48px',
    fontWeight: 700,
    color: '#ffffff',
    marginBottom: '8px',
  };

  const statLabelStyle: React.CSSProperties = {
    color: 'rgba(255,255,255,0.8)',
    fontSize: '16px',
  };

  const ctaSectionStyle: React.CSSProperties = {
    textAlign: 'center',
    padding: '60px 40px',
    borderRadius: '24px',
    backgroundColor: isDark ? '#1E293B' : '#F9FAFB',
  };

  const ctaTitleStyle: React.CSSProperties = {
    fontSize: isMobile ? '28px' : '36px',
    fontWeight: 700,
    color: isDark ? '#ffffff' : '#111827',
    marginBottom: '16px',
  };

  const ctaButtonStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    padding: '16px 32px',
    fontSize: '18px',
    fontWeight: 500,
    borderRadius: '12px',
    background: 'linear-gradient(135deg, #667EEA, #764BA2)',
    color: '#ffffff',
    border: 'none',
    cursor: 'pointer',
  };

  const values = [
    { icon: Target, title: "Mission-Driven", description: "We're on a mission to make hiring fair, efficient, and human-centric.", gradient: "linear-gradient(135deg, #3B82F6, #8B5CF6)" },
    { icon: Heart, title: "People First", description: "Both candidates and recruiters deserve a better experience.", gradient: "linear-gradient(135deg, #EC4899, #F43F5E)" },
    { icon: Lightbulb, title: "Innovation", description: "We push the boundaries of what's possible with AI in recruitment.", gradient: "linear-gradient(135deg, #F59E0B, #F97316)" },
    { icon: Users, title: "Collaboration", description: "Great hiring is a team effort. We build tools that bring people together.", gradient: "linear-gradient(135deg, #22C55E, #14B8A6)" },
    { icon: Award, title: "Excellence", description: "We hold ourselves to the highest standards in everything we do.", gradient: "linear-gradient(135deg, #8B5CF6, #EC4899)" },
    { icon: Globe, title: "Global Impact", description: "We're building for teams around the world, in every industry.", gradient: "linear-gradient(135deg, #06B6D4, #3B82F6)" },
  ];

  const team = [
    { name: "Sarah Chen", role: "CEO & Co-founder", initials: "SC", gradient: "linear-gradient(135deg, #667EEA, #764BA2)" },
    { name: "Michael Park", role: "CTO & Co-founder", initials: "MP", gradient: "linear-gradient(135deg, #3B82F6, #8B5CF6)" },
    { name: "Emily Rodriguez", role: "VP of Product", initials: "ER", gradient: "linear-gradient(135deg, #EC4899, #F43F5E)" },
    { name: "David Kim", role: "VP of Engineering", initials: "DK", gradient: "linear-gradient(135deg, #22C55E, #14B8A6)" },
  ];

  const stats = [
    { number: "2,500+", label: "Companies" },
    { number: "5M+", label: "Resumes Processed" },
    { number: "50+", label: "Countries" },
    { number: "98%", label: "Satisfaction" },
  ];

  return (
    <div style={pageStyle}>
      <div style={containerStyle}>
        {/* Header */}
        <div style={headerStyle}>
          <div style={badgeStyle}>
            <Users style={{ width: 16, height: 16 }} />
            About Us
          </div>
          <h1 style={titleStyle}>Building the future of hiring</h1>
          <p style={subtitleStyle}>
            We're a team of recruiters, engineers, and AI researchers on a mission to make hiring smarter and more human.
          </p>
        </div>

        {/* Our Story */}
        <div style={storyGridStyle}>
          <div>
            <h2 style={{ ...sectionTitleStyle, textAlign: 'left', marginBottom: '24px' }}>Our Story</h2>
            <p style={storyTextStyle}>
              TalentFlow was born from frustration. Our founders spent years in recruiting, watching talented candidates get lost in broken processes and overworked recruiters drown in repetitive tasks.
              <br /><br />
              In 2020, we set out to build something better. Using the latest advances in AI, we created a platform that handles the busywork so recruiters can focus on what matters: connecting with people.
              <br /><br />
              Today, we serve over 2,500 companies worldwide, from fast-growing startups to Fortune 500 enterprises. But we're just getting started.
            </p>
          </div>
          <div style={storyImageStyle}>
            <Users style={{ width: 120, height: 120, color: '#ffffff' }} />
          </div>
        </div>

        {/* Our Values */}
        <div style={sectionStyle}>
          <h2 style={sectionTitleStyle}>Our Values</h2>
          <div style={valuesGridStyle}>
            {values.map((value, index) => {
              const Icon = value.icon;
              return (
                <div key={index} style={valueCardStyle}>
                  <div style={valueIconStyle(value.gradient)}>
                    <Icon style={{ width: 32, height: 32, color: '#ffffff' }} />
                  </div>
                  <h3 style={valueTitleStyle}>{value.title}</h3>
                  <p style={valueDescStyle}>{value.description}</p>
                </div>
              );
            })}
          </div>
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

        {/* Leadership Team */}
        <div style={sectionStyle}>
          <h2 style={sectionTitleStyle}>Leadership Team</h2>
          <div style={teamGridStyle}>
            {team.map((member, index) => (
              <div key={index} style={teamCardStyle}>
                <div style={teamAvatarStyle(member.gradient)}>{member.initials}</div>
                <h3 style={teamNameStyle}>{member.name}</h3>
                <p style={teamRoleStyle}>{member.role}</p>
                <div style={socialLinksStyle}>
                  <div style={socialLinkStyle}>
                    <Linkedin style={{ width: 16, height: 16, color: isDark ? '#CBD5E1' : '#6B7280' }} />
                  </div>
                  <div style={socialLinkStyle}>
                    <Twitter style={{ width: 16, height: 16, color: isDark ? '#CBD5E1' : '#6B7280' }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* CTA */}
        <div style={ctaSectionStyle}>
          <h2 style={ctaTitleStyle}>Want to join our team?</h2>
          <p style={{ ...subtitleStyle, marginBottom: '24px' }}>
            We're always looking for talented people to help us build the future of hiring.
          </p>
          <button onClick={() => onNavigate("careers")} style={ctaButtonStyle}>
            View Open Positions
            <ArrowRight style={{ width: 20, height: 20 }} />
          </button>
        </div>
      </div>
    </div>
  );
}
