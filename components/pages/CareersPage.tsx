import { useState, useEffect } from "react";
import { useTheme } from 'next-themes';
import {
  Briefcase,
  MapPin,
  Clock,
  DollarSign,
  ArrowRight,
  Heart,
  Coffee,
  Plane,
  BookOpen,
  Users,
  Zap,
  Building,
} from "lucide-react";

interface CareersPageProps {
  onNavigate: (page: string) => void;
}

export default function CareersPage({ onNavigate }: CareersPageProps) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  const [isMobile, setIsMobile] = useState(false);
  const [isTablet, setIsTablet] = useState(false);
  const [selectedDepartment, setSelectedDepartment] = useState("All");

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
    backgroundColor: isDark ? 'rgba(236, 72, 153, 0.2)' : 'var(--raw-fce7f3)',
    color: isDark ? 'var(--raw-f9a8d4)' : 'var(--raw-db2777)',
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

  const benefitsGridStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : isTablet ? 'repeat(3, 1fr)' : 'repeat(4, 1fr)',
    gap: isMobile ? '12px' : '24px',
    marginBottom: isMobile ? '40px' : isTablet ? '60px' : '80px',
  };

  const benefitCardStyle: React.CSSProperties = {
    padding: isMobile ? '16px' : '24px',
    borderRadius: '16px',
    border: `1px solid ${isDark ? 'var(--raw-1e293b)' : 'var(--raw-e5e7eb)'}`,
    backgroundColor: isDark ? 'var(--raw-1e293b)' : 'var(--raw-ffffff)',
    textAlign: 'center',
  };

  const benefitIconStyle = (gradient: string): React.CSSProperties => ({
    width: '48px',
    height: '48px',
    borderRadius: '12px',
    background: gradient,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    margin: '0 auto 12px',
  });

  const benefitTitleStyle: React.CSSProperties = {
    fontSize: '16px',
    fontWeight: 600,
    color: isDark ? 'var(--raw-ffffff)' : 'var(--raw-111827)',
    marginBottom: '4px',
  };

  const benefitDescStyle: React.CSSProperties = {
    fontSize: '14px',
    color: isDark ? 'var(--raw-94a3b8)' : 'var(--raw-6b7280)',
  };

  const filterContainerStyle: React.CSSProperties = {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '12px',
    justifyContent: 'center',
    marginBottom: '48px',
  };

  const filterButtonStyle = (isActive: boolean): React.CSSProperties => ({
    padding: '10px 20px',
    borderRadius: '9999px',
    fontSize: '14px',
    fontWeight: 500,
    cursor: 'pointer',
    border: 'none',
    backgroundColor: isActive
      ? (isDark ? 'var(--raw-8b5cf6)' : 'var(--raw-7c3aed)')
      : (isDark ? 'var(--raw-374151)' : 'var(--raw-f3f4f6)'),
    color: isActive ? 'var(--raw-ffffff)' : (isDark ? 'var(--raw-d1d5db)' : 'var(--raw-374151)'),
    transition: 'all 0.2s',
  });

  const jobsContainerStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: isMobile ? '12px' : '16px',
    marginBottom: isMobile ? '40px' : isTablet ? '60px' : '80px',
  };

  const jobCardStyle: React.CSSProperties = {
    padding: isMobile ? '16px' : '24px',
    borderRadius: '16px',
    border: `1px solid ${isDark ? 'var(--raw-1e293b)' : 'var(--raw-e5e7eb)'}`,
    backgroundColor: isDark ? 'var(--raw-1e293b)' : 'var(--raw-ffffff)',
    display: 'flex',
    flexDirection: isMobile ? 'column' : 'row',
    justifyContent: 'space-between',
    alignItems: isMobile ? 'flex-start' : 'center',
    gap: '16px',
  };

  const jobInfoStyle: React.CSSProperties = {
    flex: 1,
  };

  const jobTitleStyle: React.CSSProperties = {
    fontSize: '20px',
    fontWeight: 700,
    color: isDark ? 'var(--raw-ffffff)' : 'var(--raw-111827)',
    marginBottom: '8px',
  };

  const jobMetaStyle: React.CSSProperties = {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '16px',
    color: isDark ? 'var(--raw-94a3b8)' : 'var(--raw-6b7280)',
    fontSize: '14px',
  };

  const jobMetaItemStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  };

  const applyButtonStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    padding: isMobile ? '10px 16px' : '12px 24px',
    fontSize: isMobile ? '13px' : '14px',
    fontWeight: 500,
    borderRadius: '10px',
    background: 'linear-gradient(135deg, var(--raw-667eea), var(--raw-764ba2))',
    color: 'var(--raw-ffffff)',
    border: 'none',
    cursor: 'pointer',
    width: isMobile ? '100%' : 'auto',
    justifyContent: 'center',
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
  };

  const benefits = [
    { icon: Heart, title: "Health & Wellness", description: "Full medical, dental, vision", gradient: "linear-gradient(135deg, var(--raw-ec4899), var(--raw-f43f5e))" },
    { icon: Plane, title: "Unlimited PTO", description: "Take time when you need it", gradient: "linear-gradient(135deg, var(--raw-3b82f6), var(--raw-8b5cf6))" },
    { icon: DollarSign, title: "Competitive Pay", description: "Top-of-market compensation", gradient: "linear-gradient(135deg, var(--raw-22c55e), var(--raw-14b8a6))" },
    { icon: BookOpen, title: "Learning Budget", description: "$2,000/year for growth", gradient: "linear-gradient(135deg, var(--raw-f59e0b), var(--raw-f97316))" },
    { icon: Coffee, title: "Remote First", description: "Work from anywhere", gradient: "linear-gradient(135deg, var(--raw-8b5cf6), var(--raw-ec4899))" },
    { icon: Users, title: "Team Retreats", description: "Annual company gatherings", gradient: "linear-gradient(135deg, var(--raw-06b6d4), var(--raw-3b82f6))" },
    { icon: Zap, title: "Equity", description: "Stock options for all", gradient: "linear-gradient(135deg, var(--raw-667eea), var(--raw-764ba2))" },
    { icon: Building, title: "401(k) Match", description: "4% company match", gradient: "linear-gradient(135deg, var(--raw-14b8a6), var(--raw-22c55e))" },
  ];

  const departments = ["All", "Engineering", "Product", "Design", "Sales", "Marketing", "Operations"];

  const jobs = [
    { title: "Senior Frontend Engineer", department: "Engineering", location: "Remote", type: "Full-time", salary: "$150k - $200k" },
    { title: "Backend Engineer", department: "Engineering", location: "Remote", type: "Full-time", salary: "$140k - $180k" },
    { title: "ML Engineer", department: "Engineering", location: "San Francisco", type: "Full-time", salary: "$180k - $240k" },
    { title: "Product Manager", department: "Product", location: "Remote", type: "Full-time", salary: "$150k - $190k" },
    { title: "Senior Product Designer", department: "Design", location: "Remote", type: "Full-time", salary: "$140k - $175k" },
    { title: "Account Executive", department: "Sales", location: "New York", type: "Full-time", salary: "$120k - $180k OTE" },
    { title: "Content Marketing Manager", department: "Marketing", location: "Remote", type: "Full-time", salary: "$100k - $130k" },
    { title: "Customer Success Manager", department: "Operations", location: "Remote", type: "Full-time", salary: "$80k - $110k" },
  ];

  const filteredJobs = selectedDepartment === "All"
    ? jobs
    : jobs.filter(job => job.department === selectedDepartment);

  return (
    <div style={pageStyle}>
      <div style={containerStyle}>
        {/* Header */}
        <div style={headerStyle}>
          <div style={badgeStyle}>
            <Briefcase style={{ width: 16, height: 16 }} />
            Join Our Team
          </div>
          <h1 className="tf-page-title" style={titleStyle}>Build the future of hiring with us</h1>
          <p style={subtitleStyle}>
            We're looking for passionate people to help us transform how companies find and hire talent.
          </p>
        </div>

        {/* Benefits */}
        <div style={benefitsGridStyle}>
          {benefits.map((benefit, index) => {
            const Icon = benefit.icon;
            return (
              <div key={index} style={benefitCardStyle}>
                <div style={benefitIconStyle(benefit.gradient)}>
                  <Icon style={{ width: 24, height: 24, color: 'var(--raw-ffffff)' }} />
                </div>
                <h3 style={benefitTitleStyle}>{benefit.title}</h3>
                <p style={benefitDescStyle}>{benefit.description}</p>
              </div>
            );
          })}
        </div>

        {/* Open Positions */}
        <h2 style={{ fontSize: '32px', fontWeight: 700, color: isDark ? 'var(--raw-ffffff)' : 'var(--raw-111827)', textAlign: 'center', marginBottom: '32px' }}>
          Open Positions
        </h2>

        {/* Department Filter */}
        <div style={filterContainerStyle}>
          {departments.map((dept) => (
            <button
              key={dept}
              onClick={() => setSelectedDepartment(dept)}
              style={filterButtonStyle(selectedDepartment === dept)}
            >
              {dept}
            </button>
          ))}
        </div>

        {/* Jobs List */}
        <div style={jobsContainerStyle}>
          {filteredJobs.map((job, index) => (
            <div key={index} style={jobCardStyle}>
              <div style={jobInfoStyle}>
                <h3 style={jobTitleStyle}>{job.title}</h3>
                <div style={jobMetaStyle}>
                  <span style={jobMetaItemStyle}>
                    <Briefcase style={{ width: 16, height: 16 }} />
                    {job.department}
                  </span>
                  <span style={jobMetaItemStyle}>
                    <MapPin style={{ width: 16, height: 16 }} />
                    {job.location}
                  </span>
                  <span style={jobMetaItemStyle}>
                    <Clock style={{ width: 16, height: 16 }} />
                    {job.type}
                  </span>
                  <span style={jobMetaItemStyle}>
                    <DollarSign style={{ width: 16, height: 16 }} />
                    {job.salary}
                  </span>
                </div>
              </div>
              <button style={applyButtonStyle}>
                Apply Now
                <ArrowRight style={{ width: 16, height: 16 }} />
              </button>
            </div>
          ))}
        </div>

        {/* CTA */}
        <div style={ctaSectionStyle}>
          <h2 style={ctaTitleStyle}>Don't see the right role?</h2>
          <p style={ctaSubtitleStyle}>
            We're always looking for talented people. Send us your resume and we'll keep you in mind.
          </p>
          <button onClick={() => onNavigate("contact")} style={ctaButtonStyle}>
            Get in Touch
            <ArrowRight style={{ width: 20, height: 20 }} />
          </button>
        </div>
      </div>
    </div>
  );
}
