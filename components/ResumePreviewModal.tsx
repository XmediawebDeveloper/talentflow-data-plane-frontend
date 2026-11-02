import { X, Download, Printer, ZoomIn, ZoomOut, FileText } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

interface ResumePreviewModalProps {
  candidateName: string;
  candidateEmail: string;
  onClose: () => void;
}

export default function ResumePreviewModal({
  candidateName,
  candidateEmail,
  onClose
}: ResumePreviewModalProps) {
  const [zoomLevel, setZoomLevel] = useState(100);

  const handleDownload = () => {
    toast.info(`Downloading resume for ${candidateName}`);
  };

  const handlePrint = () => {
    window.print();
  };

  const handleZoomIn = () => {
    if (zoomLevel < 150) {
      setZoomLevel(zoomLevel + 10);
    }
  };

  const handleZoomOut = () => {
    if (zoomLevel > 50) {
      setZoomLevel(zoomLevel - 10);
    }
  };

  return (
    <div className="fixed inset-0 bg-gray-900/50 dark:bg-black/70 backdrop-blur-sm flex items-center justify-center z-[60] p-4 sm:p-6">
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl shadow-brand-blue/10 border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] w-full max-w-[95vw] sm:max-w-4xl max-h-[calc(100dvh-2rem)] sm:max-h-[calc(100dvh-3rem)] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-slate-50 dark:bg-slate-950 border-b border-gray-100 dark:border-slate-700/60 px-4 sm:px-6 py-3 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 sm:h-10 sm:w-10 bg-brand-blue/10 ring-1 ring-brand-blue/15 rounded-lg flex items-center justify-center">
              <FileText className="w-5 h-5 text-brand-blue" />
            </div>
            <div>
              <h2 className="tf-section-title">Resume Preview</h2>
              <p className="tf-card-desc">{candidateName}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 dark:text-slate-500 hover:bg-brand-blue/5 hover:text-brand-blue p-2 rounded-lg transition-colors"
           aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Toolbar */}
        <div className="bg-slate-50 dark:bg-slate-950 border-b border-gray-100 dark:border-slate-700/60 px-4 sm:px-6 py-3 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2">
            <button
              onClick={handleZoomOut}
              disabled={zoomLevel <= 50}
              className="p-2 text-gray-700 dark:text-slate-300 hover:bg-brand-blue/5 hover:text-brand-blue rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              aria-label="Zoom Out" title="Zoom Out"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <span className="tf-body min-w-[60px] text-center">
              {zoomLevel}%
            </span>
            <button
              onClick={handleZoomIn}
              disabled={zoomLevel >= 150}
              className="p-2 text-gray-700 dark:text-slate-300 hover:bg-brand-blue/5 hover:text-brand-blue rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              aria-label="Zoom In" title="Zoom In"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="px-4 py-2 text-sm bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-slate-300 hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue rounded-lg transition-colors flex items-center gap-2"
            >
              <Printer className="w-4 h-4" />
              Print
            </button>
            <button
              onClick={handleDownload}
              className="px-4 py-2 text-sm bg-brand-blue hover:bg-brand-blue-2 text-white rounded-lg shadow-md shadow-brand-blue/25 ring-1 ring-white/10 transition-colors flex items-center gap-2"
            >
              <Download className="w-4 h-4" />
              Download
            </button>
          </div>
        </div>

        {/* Resume Preview Content */}
        <div className="flex-1 overflow-y-auto bg-gray-200 p-6">
          <div
            className="bg-white dark:bg-slate-900 shadow-lg mx-auto"
            style={{ 
              width: `${zoomLevel}%`,
              maxWidth: '850px',
              minWidth: '600px',
              transform: 'scale(1)',
              transformOrigin: 'top center'
            }}
          >
            {/* Resume Content - A4 Paper Style */}
            <div className="p-12">
              {/* Header */}
              <div className="border-b-2 border-gray-800 pb-4 mb-6">
                <h1 className="text-3xl font-bold text-gray-900 dark:text-slate-50 mb-2">{candidateName}</h1>
                <div className="flex items-center gap-4 tf-card-desc">
                  <span>{candidateEmail}</span>
                  <span>•</span>
                  <span>+1 (555) 123-4567</span>
                  <span>•</span>
                  <span>San Francisco, CA</span>
                </div>
              </div>

              {/* Professional Summary */}
              <div className="mb-6">
                <h2 className="text-lg font-bold text-gray-900 dark:text-slate-50 mb-2 uppercase tracking-wide">Professional Summary</h2>
                <p className="tf-body leading-relaxed">
                  Experienced software engineer with 8+ years of expertise in full-stack development, cloud architecture, and team leadership. 
                  Proven track record of delivering scalable solutions and driving technical excellence across multiple domains. 
                  Passionate about clean code, best practices, and continuous learning.
                </p>
              </div>

              {/* Work Experience */}
              <div className="mb-6">
                <h2 className="text-lg font-bold text-gray-900 dark:text-slate-50 mb-3 uppercase tracking-wide">Work Experience</h2>
                <div className="space-y-4">
                  <div>
                    <div className="flex items-start justify-between mb-1">
                      <div>
                        <h3 className="font-bold text-gray-900 dark:text-slate-50">Senior Software Engineer</h3>
                        <p className="tf-body">Tech Corp Inc. • San Francisco, CA</p>
                      </div>
                      <span className="tf-card-desc">Jan 2020 - Present</span>
                    </div>
                    <ul className="list-disc list-inside text-sm text-gray-700 dark:text-slate-300 space-y-1 ml-2">
                      <li>Led development of microservices architecture serving 10M+ users</li>
                      <li>Improved system performance by 40% through optimization initiatives</li>
                      <li>Mentored team of 5 junior developers in best practices and code review</li>
                      <li>Implemented CI/CD pipeline reducing deployment time by 60%</li>
                    </ul>
                  </div>

                  <div>
                    <div className="flex items-start justify-between mb-1">
                      <div>
                        <h3 className="font-bold text-gray-900 dark:text-slate-50">Software Engineer</h3>
                        <p className="tf-body">StartupXYZ • Remote</p>
                      </div>
                      <span className="tf-card-desc">Mar 2018 - Dec 2019</span>
                    </div>
                    <ul className="list-disc list-inside text-sm text-gray-700 dark:text-slate-300 space-y-1 ml-2">
                      <li>Built SaaS platform from ground up using React and Node.js</li>
                      <li>Optimized database queries reducing load time by 60%</li>
                      <li>Developed RESTful APIs consumed by web and mobile applications</li>
                    </ul>
                  </div>

                  <div>
                    <div className="flex items-start justify-between mb-1">
                      <div>
                        <h3 className="font-bold text-gray-900 dark:text-slate-50">Junior Developer</h3>
                        <p className="tf-body">Digital Agency Co. • New York, NY</p>
                      </div>
                      <span className="tf-card-desc">Jun 2016 - Feb 2018</span>
                    </div>
                    <ul className="list-disc list-inside text-sm text-gray-700 dark:text-slate-300 space-y-1 ml-2">
                      <li>Developed responsive web applications for Fortune 500 clients</li>
                      <li>Collaborated with design team to implement pixel-perfect UI</li>
                      <li>Maintained legacy codebases and implemented new features</li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* Education */}
              <div className="mb-6">
                <h2 className="text-lg font-bold text-gray-900 dark:text-slate-50 mb-3 uppercase tracking-wide">Education</h2>
                <div>
                  <div className="flex items-start justify-between mb-1">
                    <div>
                      <h3 className="font-bold text-gray-900 dark:text-slate-50">Bachelor of Science in Computer Science</h3>
                      <p className="tf-body">University of California, Berkeley</p>
                    </div>
                    <span className="tf-card-desc">2012 - 2016</span>
                  </div>
                  <p className="tf-body">GPA: 3.8/4.0 • Magna Cum Laude</p>
                </div>
              </div>

              {/* Skills */}
              <div className="mb-6">
                <h2 className="text-lg font-bold text-gray-900 dark:text-slate-50 mb-3 uppercase tracking-wide">Technical Skills</h2>
                <div className="grid grid-cols-2 gap-x-8 gap-y-2 tf-body">
                  <div><strong>Languages:</strong> JavaScript, TypeScript, Python, Java</div>
                  <div><strong>Frontend:</strong> React, Next.js, Vue.js, Tailwind CSS</div>
                  <div><strong>Backend:</strong> Node.js, Express, Django, Spring Boot</div>
                  <div><strong>Database:</strong> PostgreSQL, MongoDB, Redis, MySQL</div>
                  <div><strong>Cloud:</strong> AWS, Google Cloud, Azure, Docker</div>
                  <div><strong>Tools:</strong> Git, Jenkins, Kubernetes, Terraform</div>
                </div>
              </div>

              {/* Certifications */}
              <div className="mb-6">
                <h2 className="text-lg font-bold text-gray-900 dark:text-slate-50 mb-3 uppercase tracking-wide">Certifications</h2>
                <ul className="space-y-1 text-sm text-gray-700 dark:text-slate-300">
                  <li>
                    <strong>AWS Certified Solutions Architect - Professional</strong>
                    <span className="text-gray-600 dark:text-slate-400 ml-2">• Amazon Web Services • Nov 2023</span>
                  </li>
                  <li>
                    <strong>Certified Kubernetes Administrator (CKA)</strong>
                    <span className="text-gray-600 dark:text-slate-400 ml-2">• CNCF • Jun 2022</span>
                  </li>
                </ul>
              </div>

              {/* Languages */}
              <div>
                <h2 className="text-lg font-bold text-gray-900 dark:text-slate-50 mb-3 uppercase tracking-wide">Languages</h2>
                <p className="tf-body">
                  English (Native) • Spanish (Professional Working Proficiency) • French (Elementary)
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
