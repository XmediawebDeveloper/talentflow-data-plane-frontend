"use client";

import { Menu, X, Moon, Sun } from "lucide-react";
import { useState, useEffect } from "react";

const navItems = [
  { label: "Home", page: "home" },
  { label: "Features", page: "features" },
  { label: "How It Works", page: "how-it-works" },
  { label: "Pricing", page: "pricing" },
  { label: "About", page: "about" },
  { label: "Careers", page: "careers" },
  { label: "Contact", page: "contact" },
];

interface PublicHeaderProps {
  activePage: string;
  onNavigate: (page: string) => void;
  onLogin: () => void;
  onSignup: () => void;
}

export function PublicHeader({ activePage, onNavigate, onLogin, onSignup }: PublicHeaderProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isDark, setIsDark] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const isDarkMode = document.documentElement.classList.contains("dark");
    setIsDark(isDarkMode);

    // Check if mobile
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const toggleDarkMode = () => {
    const newIsDark = !isDark;
    setIsDark(newIsDark);
    if (newIsDark) {
      document.documentElement.classList.add("dark");
      localStorage.setItem("theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("theme", "light");
    }
  };

  // Inline styles
  const headerStyle: React.CSSProperties = {
    backgroundColor: isDark ? '#0F172A' : '#ffffff',
    borderBottom: `1px solid ${isDark ? '#1E293B' : '#E5E7EB'}`,
    position: 'sticky',
    top: 0,
    zIndex: 50,
    transition: 'background-color 0.3s, border-color 0.3s',
  };

  const containerStyle: React.CSSProperties = {
    maxWidth: '1440px',
    margin: '0 auto',
    padding: '0 24px',
  };

  const flexRowStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: '64px',
  };

  const logoContainerStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    cursor: 'pointer',
    background: 'none',
    border: 'none',
  };

  const logoBoxStyle: React.CSSProperties = {
    width: '32px',
    height: '32px',
    background: 'linear-gradient(135deg, #2563EB, #1D4ED8)',
    borderRadius: '8px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  };

  const logoTextStyle: React.CSSProperties = {
    color: '#ffffff',
    fontSize: '14px',
    fontWeight: 600,
  };

  const brandTextContainerStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
  };

  const brandSubtextStyle: React.CSSProperties = {
    color: isDark ? '#94A3B8' : '#6B7280',
    fontSize: '10px',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  };

  const brandNameStyle: React.CSSProperties = {
    color: isDark ? '#ffffff' : '#111827',
    fontSize: '16px',
    fontWeight: 600,
    lineHeight: 1,
  };

  const navStyle: React.CSSProperties = {
    display: isMobile ? 'none' : 'flex',
    alignItems: 'center',
    gap: '32px',
  };

  const getNavItemStyle = (isActive: boolean): React.CSSProperties => ({
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: 500,
    color: isActive
      ? (isDark ? '#60A5FA' : '#2563EB')
      : (isDark ? '#CBD5E1' : '#374151'),
    transition: 'color 0.2s',
  });

  const rightButtonsStyle: React.CSSProperties = {
    display: isMobile ? 'none' : 'flex',
    alignItems: 'center',
    gap: '12px',
  };

  const mobileButtonsStyle: React.CSSProperties = {
    display: isMobile ? 'flex' : 'none',
    alignItems: 'center',
    gap: '8px',
  };

  const darkModeButtonStyle: React.CSSProperties = {
    padding: '8px',
    borderRadius: '8px',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
  };

  const signInButtonStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '8px 16px',
    fontSize: '14px',
    fontWeight: 500,
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'all 0.2s',
    backgroundColor: isDark ? 'rgba(30, 41, 59, 0.3)' : '#ffffff',
    color: isDark ? '#ffffff' : '#374151',
    border: `1px solid ${isDark ? '#334155' : '#E5E7EB'}`,
  };

  const startTrialButtonStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '8px 16px',
    fontSize: '14px',
    fontWeight: 500,
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'all 0.2s',
    backgroundColor: '#2563EB',
    color: '#ffffff',
    border: 'none',
  };

  const menuButtonStyle: React.CSSProperties = {
    padding: '8px',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
  };

  const mobileMenuStyle: React.CSSProperties = {
    display: mobileMenuOpen && isMobile ? 'block' : 'none',
    padding: '16px 0',
    borderTop: `1px solid ${isDark ? '#334155' : '#E5E7EB'}`,
  };

  const mobileNavStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  };

  const getMobileNavItemStyle = (isActive: boolean): React.CSSProperties => ({
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    textAlign: 'left',
    padding: '8px 0',
    fontSize: '14px',
    fontWeight: 500,
    color: isActive
      ? (isDark ? '#60A5FA' : '#2563EB')
      : (isDark ? '#CBD5E1' : '#374151'),
  });

  const mobileButtonContainerStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    paddingTop: '16px',
    borderTop: `1px solid ${isDark ? '#334155' : '#E5E7EB'}`,
  };

  return (
    <header style={headerStyle}>
      <div style={containerStyle}>
        <div style={flexRowStyle}>
          {/* Logo */}
          <button
            onClick={() => onNavigate("home")}
            style={logoContainerStyle}
          >
            <div style={logoBoxStyle}>
              <span style={logoTextStyle}>BI</span>
            </div>
            <div style={brandTextContainerStyle}>
              <span style={brandSubtextStyle}>BusinessIntegra</span>
              <span style={brandNameStyle}>TalentFlow</span>
            </div>
          </button>

          {/* Desktop Navigation */}
          <nav style={navStyle}>
            {navItems.map((item) => (
              <button
                key={item.page}
                onClick={() => onNavigate(item.page)}
                style={getNavItemStyle(activePage === item.page)}
              >
                {item.label}
              </button>
            ))}
          </nav>

          {/* Desktop Right Buttons */}
          <div style={rightButtonsStyle}>
            <button
              onClick={toggleDarkMode}
              style={darkModeButtonStyle}
              aria-label="Toggle dark mode"
            >
              {isDark ? (
                <Sun style={{ width: 20, height: 20, color: '#F59E0B' }} />
              ) : (
                <Moon style={{ width: 20, height: 20, color: '#6B7280' }} />
              )}
            </button>

            <button onClick={onLogin} style={signInButtonStyle}>
              Sign In
            </button>
            <button onClick={onSignup} style={startTrialButtonStyle}>
              Start Free Trial
            </button>
          </div>

          {/* Mobile Buttons */}
          <div style={mobileButtonsStyle}>
            <button
              onClick={toggleDarkMode}
              style={darkModeButtonStyle}
              aria-label="Toggle dark mode"
            >
              {isDark ? (
                <Sun style={{ width: 20, height: 20, color: '#F59E0B' }} />
              ) : (
                <Moon style={{ width: 20, height: 20, color: '#6B7280' }} />
              )}
            </button>

            <button
              style={menuButtonStyle}
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              {mobileMenuOpen ? (
                <X style={{ width: 24, height: 24, color: isDark ? '#CBD5E1' : '#374151' }} />
              ) : (
                <Menu style={{ width: 24, height: 24, color: isDark ? '#CBD5E1' : '#374151' }} />
              )}
            </button>
          </div>
        </div>

        {/* Mobile Menu */}
        <div style={mobileMenuStyle}>
          <nav style={mobileNavStyle}>
            {navItems.map((item) => (
              <button
                key={item.page}
                onClick={() => {
                  onNavigate(item.page);
                  setMobileMenuOpen(false);
                }}
                style={getMobileNavItemStyle(activePage === item.page)}
              >
                {item.label}
              </button>
            ))}
            <div style={mobileButtonContainerStyle}>
              <button
                onClick={() => {
                  onLogin();
                  setMobileMenuOpen(false);
                }}
                style={{ ...signInButtonStyle, width: '100%' }}
              >
                Sign In
              </button>
              <button
                onClick={() => {
                  onSignup();
                  setMobileMenuOpen(false);
                }}
                style={{ ...startTrialButtonStyle, width: '100%' }}
              >
                Start Free Trial
              </button>
            </div>
          </nav>
        </div>
      </div>
    </header>
  );
}
