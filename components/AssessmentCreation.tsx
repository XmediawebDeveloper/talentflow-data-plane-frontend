import { ArrowLeft, Clock, Briefcase, Sliders, Plus, X, Sparkles, AlertCircle, CheckCircle2, Code, Users, Brain, BarChart, FileText, Shield, Video, Info, Building2, MapPin, Calendar, User, TrendingUp, Eye, Edit3, MoreVertical, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Job } from '@/lib/types/types';
import { assessmentService, jdService } from '@/lib/services';
import JDCreation from '@/components/JDCreation';
import { toast } from 'sonner';

// 1:1 JD-Assessment relationship: JDs that already have assessments cannot be selected

interface TopicSettings {
  hr_enabled: boolean;
  hr_scoring_type: 'informational' | 'scored';
  technical_enabled: boolean;
  technical_scoring_type: 'informational' | 'scored';
  coding_enabled: boolean;
  coding_scoring_type: 'informational' | 'scored';
}

interface AssessmentCreationProps {
  onBack: () => void;
  jobs: Job[];
  onCreateAssessment: (assessment: any) => void;
  onCreateNewJD?: () => void;
  onJobsRefresh?: () => void;
  topicSettings?: TopicSettings;
  preSelectedJobId?: string;
}

interface SectionConfig {
  name: 'HR' | 'Technical' | 'Coding';
  percentage: number;
  topics: string[];
  enabled: boolean;
}

export default function AssessmentCreation({ onBack, jobs, onCreateAssessment, onCreateNewJD, onJobsRefresh, topicSettings, preSelectedJobId }: AssessmentCreationProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Read initial step from URL, default to 'select-jd'
  const urlStep = searchParams.get('step') as 'select-jd' | 'configure' | 'preview' | null;
  const urlJdId = searchParams.get('jd_id');
  const editAssessmentId = searchParams.get('edit'); // Edit mode: assessment ID to edit

  const [step, setStepState] = useState<'select-jd' | 'configure' | 'preview'>(urlStep || 'select-jd');
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [duration, setDuration] = useState(30); // Assessment duration in minutes (15-180)
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingAssessment, setEditingAssessment] = useState<any>(null);

  // Helper function to update step and URL
  const setStep = (newStep: 'select-jd' | 'configure' | 'preview', jobId?: string) => {
    setStepState(newStep);
    const params = new URLSearchParams();

    // When going back to select-jd, clear all params
    if (newStep === 'select-jd') {
      router.push('/recruitment/assessments/create', { scroll: false });
      return;
    }

    params.set('step', newStep);
    if (jobId || selectedJob?.id) {
      params.set('jd_id', jobId || selectedJob?.id || '');
    }
    const queryString = params.toString();
    router.push(`/recruitment/assessments/create${queryString ? `?${queryString}` : ''}`, { scroll: false });
  };

  // Navigate to JD creation page
  const handleCreateNewJD = () => {
    router.push('/recruitment/jd-creation?from=assessment');
  };

  // Auto-select job if preSelectedJobId or urlJdId is provided
  useEffect(() => {
    const jdIdToSelect = preSelectedJobId || urlJdId;
    if (jdIdToSelect && jobs.length > 0 && !selectedJob) {
      const job = jobs.find(j => j.id === jdIdToSelect);
      if (job) {
        // Configure sections properly based on JD coding requirements
        const jdRequiresCoding = job.coding_required === true;
        const hasLanguages = job.supported_languages && job.supported_languages.length > 0;
        let codingLanguages: string[] = hasLanguages ? job.supported_languages! : [];

        // Inline language detection for URL-based selection
        const detectLanguages = (skills: string[]): string[] => {
          const skillsText = skills.join(' ').toLowerCase();
          const detected = new Set<string>();
          if (/\b(java|spring|hibernate|maven)\b/i.test(skillsText)) detected.add('Java');
          if (/\b(python|django|flask|fastapi|pandas)\b/i.test(skillsText)) detected.add('Python');
          if (/\b(javascript|node|react|angular|vue|express)\b/i.test(skillsText)) detected.add('JavaScript');
          if (/\b(typescript)\b/i.test(skillsText)) detected.add('TypeScript');
          if (/\b(c#|csharp|\.net|dotnet|asp\.net)\b/i.test(skillsText)) detected.add('C#');
          if (/\b(c\+\+|cpp)\b/i.test(skillsText)) detected.add('C++');
          if (/\b(golang|go\s*lang)\b/i.test(skillsText)) detected.add('Go');
          if (/\b(ruby|rails)\b/i.test(skillsText)) detected.add('Ruby');
          if (/\b(php|laravel)\b/i.test(skillsText)) detected.add('PHP');
          if (/\b(kotlin|android)\b/i.test(skillsText)) detected.add('Kotlin');
          if (/\b(swift|ios)\b/i.test(skillsText)) detected.add('Swift');
          if (/\b(rust)\b/i.test(skillsText)) detected.add('Rust');
          return Array.from(detected);
        };

        const checkCodingRole = (j: Job): boolean => {
          const patterns = [/developer/i, /engineer/i, /programmer/i, /sdet/i, /software/i, /devops/i];
          const text = `${j.title} ${j.description || ''}`;
          return patterns.some(p => p.test(text));
        };

        // Detect languages from skills if JD requires coding but no languages specified
        if (jdRequiresCoding && !hasLanguages && job.skills && job.skills.length > 0) {
          const detectedLangs = detectLanguages(job.skills);
          if (detectedLangs.length > 0) {
            codingLanguages = detectedLangs;
          }
        }

        // Check for dynamic detection from skills
        let shouldEnableCoding = jdRequiresCoding;
        if (!jdRequiresCoding && job.skills && job.skills.length > 0) {
          const detectedLangs = detectLanguages(job.skills);
          if (detectedLangs.length > 0 && checkCodingRole(job)) {
            shouldEnableCoding = true;
            codingLanguages = detectedLangs;
          }
        }

        // Store JD-extracted languages
        setJdExtractedLanguages(codingLanguages);

        // Set sections with correct percentages based on coding requirement
        if (shouldEnableCoding && codingLanguages.length > 0) {
          setSections([
            { name: 'HR', percentage: 20, topics: [], enabled: true },
            { name: 'Technical', percentage: 70, topics: [], enabled: true },
            { name: 'Coding', percentage: 10, topics: [], enabled: true },
          ]);
          setSelectedCodingLanguages(codingLanguages);
        } else {
          // No coding required - HR 30%, Technical 70%
          setSections([
            { name: 'HR', percentage: 30, topics: [], enabled: true },
            { name: 'Technical', percentage: 70, topics: [], enabled: true },
            { name: 'Coding', percentage: 0, topics: [], enabled: false },
          ]);
          setSelectedCodingLanguages([]);
        }

        setSelectedJob(job);
        if (urlStep === 'configure' || urlStep === 'preview') {
          setStepState(urlStep);
        } else {
          setStep('configure', job.id);
        }
        console.log('[TalentFlow] Auto-selected JD for assessment:', job.title, 'Coding required:', shouldEnableCoding);
      }
    }
  }, [preSelectedJobId, urlJdId, jobs, selectedJob, urlStep]);

  // Load assessment data when in edit mode
  useEffect(() => {
    const loadAssessmentForEdit = async () => {
      if (!editAssessmentId) return;

      try {
        setIsEditMode(true);
        console.log('[TalentFlow] Loading assessment for edit:', editAssessmentId);

        const assessment = await assessmentService.get(editAssessmentId);
        setEditingAssessment(assessment);

        // Pre-populate form fields with existing assessment data
        // Note: Duration is always fixed at 30 minutes (backend value ignored for now)
        setDuration(30);
        setProctoringEnabled(assessment.proctoring_enabled ?? true);

        // Update sections with existing data
        setSections([
          {
            name: 'HR',
            percentage: assessment.hr_percentage || 0,
            topics: assessment.hr_topics || [],
            enabled: assessment.hr_enabled ?? true
          },
          {
            name: 'Technical',
            percentage: assessment.technical_percentage || 0,
            topics: assessment.technical_topics || [],
            enabled: assessment.technical_enabled ?? true
          },
          {
            name: 'Coding',
            percentage: assessment.coding_percentage || 0,
            topics: assessment.coding_topics || [],
            enabled: assessment.coding_enabled ?? false
          }
        ]);

        // Set coding languages if present
        if (assessment.coding_languages?.length > 0) {
          setSelectedCodingLanguages(assessment.coding_languages);
        }

        console.log('[TalentFlow] Assessment loaded for editing:', assessment.title);
      } catch (error) {
        console.error('Failed to load assessment for edit:', error);
        toast.error('Failed to load assessment for editing. Please try again.');
        router.push('/recruitment/assessments');
      }
    };

    loadAssessmentForEdit();
  }, [editAssessmentId]);

  // Initialize sections based on global topic settings
  const getInitialSections = (): SectionConfig[] => {
    const hrEnabled = topicSettings?.hr_enabled ?? true;
    const technicalEnabled = topicSettings?.technical_enabled ?? true;
    const codingEnabled = topicSettings?.coding_enabled ?? true;

    // Calculate percentages based on enabled sections
    const enabledCount = [hrEnabled, technicalEnabled, codingEnabled].filter(Boolean).length;
    let hrPct = 0, techPct = 0, codePct = 0;

    if (enabledCount === 3) {
      hrPct = 20; techPct = 70; codePct = 10;
    } else if (enabledCount === 2) {
      if (hrEnabled && technicalEnabled) { hrPct = 30; techPct = 70; }
      else if (hrEnabled && codingEnabled) { hrPct = 40; codePct = 60; }
      else if (technicalEnabled && codingEnabled) { techPct = 70; codePct = 30; }
    } else if (enabledCount === 1) {
      if (hrEnabled) hrPct = 100;
      else if (technicalEnabled) techPct = 100;
      else if (codingEnabled) codePct = 100;
    }

    return [
      { name: 'HR', percentage: hrPct, topics: [], enabled: hrEnabled },
      { name: 'Technical', percentage: techPct, topics: [], enabled: technicalEnabled },
      { name: 'Coding', percentage: codePct, topics: [], enabled: false }, // Coding starts disabled, enabled by JD
    ];
  };

  const [sections, setSections] = useState<SectionConfig[]>(getInitialSections());
  const [newTopic, setNewTopic] = useState({ section: '' as 'HR' | 'Technical' | 'Coding', value: '' });
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedAssessment, setGeneratedAssessment] = useState<any>(null);
  const [proctoringEnabled, setProctoringEnabled] = useState(true);

  const [localJobs, setLocalJobs] = useState<Job[]>(jobs);
  const [isLoadingJobs, setIsLoadingJobs] = useState(false);

  // 1:1 JD-Assessment: Track which JDs already have assessments
  const [jdsWithAssessments, setJdsWithAssessments] = useState<Set<string>>(new Set());

  // Auto-save draft state
  const [isAutoSaving, setIsAutoSaving] = useState(false);
  const [draftSavedId, setDraftSavedId] = useState<string | null>(null);

  // Full-screen JD Creation modal state
  const [showJDCreation, setShowJDCreation] = useState(false);

  // Coding confirmation popup state
  const [showCodingConfirm, setShowCodingConfirm] = useState(false);
  const [codingPopupMode, setCodingPopupMode] = useState<'enable' | 'disable'>('enable');
  const [selectedCodingLanguages, setSelectedCodingLanguages] = useState<string[]>([]);

  // Store previous percentages when coding is disabled (to restore when re-enabled)
  const [savedPercentagesBeforeCodingDisable, setSavedPercentagesBeforeCodingDisable] = useState<{
    hr: number;
    technical: number;
    coding: number;
  } | null>(null);

  // Minimum round validation popup state
  const [showMinRoundPopup, setShowMinRoundPopup] = useState(false);

  // Store JD-extracted languages separately so we can restore them when re-enabling coding
  const [jdExtractedLanguages, setJdExtractedLanguages] = useState<string[]>([]);

  // Collapsible sections state
  const [isAIGenerationExpanded, setIsAIGenerationExpanded] = useState(false);
  const [isScoringRulesExpanded, setIsScoringRulesExpanded] = useState(false);

  // Available programming languages for selection
  const programmingLanguages = [
    'Python', 'JavaScript', 'TypeScript', 'Java', 'C++', 'C#', 'Go',
    'Rust', 'Ruby', 'PHP', 'Swift', 'Kotlin', 'Scala', 'R', 'SQL'
  ];

  // Handle when JD is published from the modal
  const handleJDPublished = async (publishedJob: Job) => {
    // Close the modal
    setShowJDCreation(false);

    // Refresh the jobs list to include the new JD
    try {
      const response = await jdService.list({ status: 'published', page_size: 100, source: 'my-jds' });
      if (response?.items?.length > 0) {
        const mappedJobs: Job[] = response.items.map((jd: any) => ({
          id: jd.id,
          title: jd.title,
          description: jd.description || '',
          department: jd.department || 'General',
          location: jd.location || '',
          experience: jd.job_level || 'Mid-Level',
          skills: jd.must_have_skills || [],
          status: 'Published' as const,
          created: jd.created_at?.split('T')[0] || new Date().toISOString().split('T')[0],
          applicants: jd.applicants_count || 0,
          daysActive: 0,
          requiredMatch: 70,
          coding_required: jd.coding_required || false,
          supported_languages: jd.supported_languages || [],
        }));
        setLocalJobs(mappedJobs);

        // Find and auto-select the newly created JD
        const newJob = mappedJobs.find(j => j.id === publishedJob.id);
        if (newJob) {
          handleJobSelect(newJob);
        }
      }
    } catch (error) {
      console.error('Failed to refresh JDs:', error);
    }

    // Notify parent to refresh if needed
    if (onJobsRefresh) {
      onJobsRefresh();
    }
  };

  // Fetch published JDs and JDs that already have assessments on mount
  useEffect(() => {
    const fetchData = async () => {
      setIsLoadingJobs(true);
      try {
        // Fetch both JDs and JDs with assessments in parallel
        const [jdResponse, jdsWithAssessmentsResponse] = await Promise.all([
          jdService.list({ status: 'published', page_size: 100, source: 'my-jds' }),
          assessmentService.getJDsWithAssessments(),
        ]);

        // Set JDs that already have assessments (for 1:1 filtering)
        setJdsWithAssessments(new Set(jdsWithAssessmentsResponse));
        console.log('[TalentFlow] JDs with existing assessments:', jdsWithAssessmentsResponse.length);

        if (jdResponse?.items?.length > 0) {
          const mappedJobs: Job[] = jdResponse.items.map((jd: any) => ({
            id: jd.id,
            job_id: jd.job_id || '',
            title: jd.title,
            description: jd.description || '',
            department: jd.department || 'General',
            location: jd.location || '',
            experience: jd.job_level || 'Mid-Level',
            skills: jd.must_have_skills || [],
            status: 'Published',
            postedDate: jd.published_at || jd.created_at,
            postedBy: jd.created_by_name || 'Unknown',
            applicants: jd.applicants_count || 0,
            daysActive: 0,
            requiredMatch: 70,
            coding_required: jd.coding_required || false,
            supported_languages: jd.supported_languages || [],
            industry_type: jd.industry_type || 'Technology',
            employmentType: jd.employment_type || 'full_time',
            creation_method: jd.creation_method || 'manual',
            experience_min: jd.experience_min,
            experience_max: jd.experience_max,
          }));
          setLocalJobs(mappedJobs);
        }
      } catch (error) {
        console.error('Failed to fetch JDs:', error);
        // Fall back to props if API fails
        setLocalJobs(jobs);
      } finally {
        setIsLoadingJobs(false);
      }
    };

    fetchData();
  }, []);

  // NOTE: Auto-save on unmount is DISABLED to prevent issues with React Strict Mode
  // and unwanted saves when entering the configure page.
  // Auto-save ONLY happens when user explicitly clicks the back button (handleAutoSaveDraft).

  // Check if JD requires coding based on skills/technologies
  const requiresCoding = (job: Job) => {
    const codingKeywords = ['developer', 'engineer', 'programmer', 'software', 'coding', 'python', 'java', 'javascript', 'react', 'node'];
    const jobText = `${job.title} ${job.description} ${job.skills.join(' ')}`.toLowerCase();
    return codingKeywords.some(keyword => jobText.includes(keyword));
  };

  // Dynamic programming language detection from skills
  // This is used as a fallback when AI extraction didn't properly set coding_required/supported_languages
  const detectProgrammingLanguagesFromSkills = (skills: string[]): string[] => {
    const skillsText = skills.join(' ').toLowerCase();
    const detectedLanguages = new Set<string>();

    // ============ JAVA ============
    // Core Java, J2EE, Spring ecosystem, Hibernate, Maven, Gradle
    if (/\b(core\s*java|java\s*\d+|j2ee|jee|java\s*ee|spring\s*(boot|mvc|framework|cloud|security)?|hibernate|struts|maven|gradle|jpa|jdbc|jvm|servlet|jsp|tomcat|wildfly|jboss)\b/i.test(skillsText) ||
        /\bjava\b/i.test(skillsText)) {
      detectedLanguages.add('Java');
    }

    // ============ PYTHON ============
    // Django, Flask, FastAPI, Data Science libs, ML frameworks
    if (/\b(python|django|flask|fastapi|pandas|numpy|scipy|matplotlib|seaborn|scikit[\s-]?learn|pytorch|tensorflow|keras|jupyter|pip|conda|pyspark|celery|asyncio)\b/i.test(skillsText)) {
      detectedLanguages.add('Python');
    }

    // ============ JAVASCRIPT ============
    // Node.js, React, Angular, Vue, Express, Next.js, etc.
    if (/\b(javascript|node\.?js|react\.?js?|angular\.?js?|vue\.?js?|express\.?js?|next\.?js?|nuxt\.?js?|gatsby|svelte|jquery|webpack|babel|npm|yarn|es6|ecmascript|redux|mobx|graphql\s*js|nest\.?js?|deno)\b/i.test(skillsText) ||
        /\bjs\b/i.test(skillsText)) {
      detectedLanguages.add('JavaScript');
    }

    // ============ TYPESCRIPT ============
    if (/\b(typescript|ts)\b/i.test(skillsText)) {
      detectedLanguages.add('TypeScript');
    }

    // ============ C# / .NET ============
    // ASP.NET, .NET Core, Entity Framework, Blazor, LINQ
    if (/\b(c#|csharp|c\s*sharp|\.net|dotnet|asp\.?net|entity\s*framework|blazor|linq|xamarin|maui|unity3d|wcf|wpf|winforms)\b/i.test(skillsText)) {
      detectedLanguages.add('C#');
    }

    // ============ C++ ============
    // STL, Qt, Boost, embedded systems
    if (/\b(c\+\+|cpp|stl|boost|qt\s*(framework)?|cmake|embedded\s*c\+\+|opencv)\b/i.test(skillsText)) {
      detectedLanguages.add('C++');
    }

    // ============ C ============
    // Embedded C, Linux kernel, system programming (careful to avoid false positives)
    if (/\b(embedded\s*c|c\s*programming|ansi\s*c|c\s*language|linux\s*kernel|posix|glibc)\b/i.test(skillsText)) {
      detectedLanguages.add('C');
    }

    // ============ GO / GOLANG ============
    // Gin, Echo, Kubernetes (Go-based)
    if (/\b(golang|go\s*lang|go\s*programming|gin\s*(framework)?|echo\s*(framework)?|goroutine|gomod)\b/i.test(skillsText) ||
        /\bgo\b/i.test(skillsText) && /\b(backend|microservice|api|docker|kubernetes|cloud)\b/i.test(skillsText)) {
      detectedLanguages.add('Go');
    }

    // ============ RUBY ============
    // Rails, Sinatra, RSpec
    if (/\b(ruby|rails|ruby\s*on\s*rails|sinatra|rspec|capybara|sidekiq|rake)\b/i.test(skillsText)) {
      detectedLanguages.add('Ruby');
    }

    // ============ PHP ============
    // Laravel, Symfony, WordPress (dev), CodeIgniter
    if (/\b(php|laravel|symfony|codeigniter|wordpress\s*(dev|development|plugin)|drupal|magento|composer|yii)\b/i.test(skillsText)) {
      detectedLanguages.add('PHP');
    }

    // ============ KOTLIN ============
    // Android development, Ktor
    if (/\b(kotlin|android\s*(development|dev|kotlin)|ktor|jetpack\s*compose)\b/i.test(skillsText)) {
      detectedLanguages.add('Kotlin');
    }

    // ============ SWIFT ============
    // iOS development, SwiftUI
    if (/\b(swift|ios\s*(development|dev)|swiftui|uikit|cocoa|xcode)\b/i.test(skillsText)) {
      detectedLanguages.add('Swift');
    }

    // ============ RUST ============
    // Systems programming, cargo
    if (/\b(rust|rustlang|cargo|tokio|actix)\b/i.test(skillsText)) {
      detectedLanguages.add('Rust');
    }

    // ============ SCALA ============
    // Spark, Akka, Play Framework
    if (/\b(scala|akka|play\s*framework|spark\s*scala|sbt)\b/i.test(skillsText)) {
      detectedLanguages.add('Scala');
    }

    // ============ R ============
    // Data science, statistics (careful with single letter)
    if (/\b(r\s*programming|r\s*language|rstudio|tidyverse|ggplot|shiny\s*r|cran)\b/i.test(skillsText) ||
        (/\br\b/i.test(skillsText) && /\b(statistics|data\s*science|machine\s*learning|analytics)\b/i.test(skillsText))) {
      detectedLanguages.add('R');
    }

    // ============ SQL ============
    // Database programming (not just querying)
    if (/\b(pl\/?sql|t-sql|stored\s*procedure|sql\s*server|oracle\s*(db|database|developer)|mysql|postgresql|database\s*(development|programming|developer))\b/i.test(skillsText)) {
      detectedLanguages.add('SQL');
    }

    // ============ DART ============
    // Flutter
    if (/\b(dart|flutter)\b/i.test(skillsText)) {
      detectedLanguages.add('Dart');
    }

    // ============ PERL ============
    if (/\b(perl|perl\s*scripting)\b/i.test(skillsText)) {
      detectedLanguages.add('Perl');
    }

    // ============ SHELL/BASH ============
    // Shell scripting (if significant)
    if (/\b(bash\s*scripting|shell\s*scripting|linux\s*scripting|powershell\s*(scripting|development))\b/i.test(skillsText)) {
      detectedLanguages.add('Bash');
    }

    // ============ AUTOMATION TESTING FRAMEWORKS ============
    // NOTE: Automation frameworks (Selenium, Cypress, Playwright, Appium) alone do NOT trigger coding rounds
    // They are assessed in the Technical round instead. Only actual programming languages trigger coding.
    // However, if automation is mentioned WITH a specific language (e.g., "Selenium with Java"),
    // the language itself will be detected by the patterns above.

    return Array.from(detectedLanguages);
  };

  // Check if job title/description indicates a coding role
  const isCodingRole = (job: Job): boolean => {
    const codingRolePatterns = [
      /developer/i,
      /engineer/i,
      /programmer/i,
      /sdet/i,
      /automation\s*(test|engineer|tester)/i,
      /full\s*stack/i,
      /front\s*end/i,
      /back\s*end/i,
      /software/i,
      /devops/i,
    ];
    const titleAndDesc = `${job.title} ${job.description || ''}`;
    return codingRolePatterns.some(pattern => pattern.test(titleAndDesc));
  };

  const handleJobSelect = (job: Job) => {
    setSelectedJob(job);

    // Check if JD explicitly requires coding (from JD configuration)
    const jdRequiresCoding = job.coding_required === true;
    const hasLanguages = job.supported_languages && job.supported_languages.length > 0;

    // Start with JD-specified languages
    let codingLanguages: string[] = hasLanguages ? job.supported_languages! : [];

    // If JD requires coding but no languages specified, try to detect from skills
    if (jdRequiresCoding && !hasLanguages && job.skills && job.skills.length > 0) {
      const detectedLanguages = detectProgrammingLanguagesFromSkills(job.skills);
      if (detectedLanguages.length > 0) {
        codingLanguages = detectedLanguages;
        console.log('[TalentFlow] JD requires coding - detected languages from skills:', detectedLanguages);
      }
    }

    // DYNAMIC DETECTION: If JD doesn't have coding_required set but has programming skills
    let shouldEnableCoding = jdRequiresCoding;  // Enable if JD says coding is required

    // Fallback: Dynamic detection from skills if JD doesn't have coding_required set
    if (!jdRequiresCoding && job.skills && job.skills.length > 0) {
      const detectedLanguages = detectProgrammingLanguagesFromSkills(job.skills);

      // If we detected programming languages AND it's a coding-related role, enable coding
      if (detectedLanguages.length > 0 && isCodingRole(job)) {
        shouldEnableCoding = true;
        codingLanguages = detectedLanguages;
        console.log('[TalentFlow] Dynamic language detection enabled coding for JD:', job.title, 'Languages:', detectedLanguages);
      }
    }

    // Store JD-extracted languages so we can restore them when re-enabling coding
    setJdExtractedLanguages(codingLanguages);

    // Auto-configure sections based on coding requirement
    if (shouldEnableCoding && codingLanguages.length > 0) {
      // Coding is required AND we have languages - enable coding section with languages
      setSections([
        { name: 'HR', percentage: 20, topics: [], enabled: true },
        { name: 'Technical', percentage: 70, topics: [], enabled: true },
        { name: 'Coding', percentage: 10, topics: [], enabled: true },
      ]);
      setSelectedCodingLanguages(codingLanguages);
      console.log('[TalentFlow] Coding enabled with languages:', codingLanguages);
    } else if (shouldEnableCoding && codingLanguages.length === 0) {
      // Coding is required but NO languages detected - enable coding but show language popup
      setSections([
        { name: 'HR', percentage: 20, topics: [], enabled: true },
        { name: 'Technical', percentage: 70, topics: [], enabled: true },
        { name: 'Coding', percentage: 10, topics: [], enabled: true },
      ]);
      setSelectedCodingLanguages([]);
      // Show language selection popup since JD requires coding but no languages were extracted
      setTimeout(() => {
        setCodingPopupMode('enable');
        setShowCodingConfirm(true);
      }, 100);
      console.log('[TalentFlow] Coding enabled but no languages detected - showing popup');
    } else {
      // JD does NOT require coding - coding section is hidden (not just disabled)
      setSections([
        { name: 'HR', percentage: 30, topics: [], enabled: true },
        { name: 'Technical', percentage: 70, topics: [], enabled: true },
        { name: 'Coding', percentage: 0, topics: [], enabled: false },
      ]);
      setSelectedCodingLanguages([]);
    }
    setStep('configure', job.id);
  };

  const updatePercentage = (sectionName: string, value: number) => {
    setSections(sections.map(s =>
      s.name === sectionName ? { ...s, percentage: Math.max(0, Math.min(100, value)) } : s
    ));
  };

  const handleDurationChange = (value: number) => {
    // Duration is locked at 30 minutes - this function is kept for compatibility
    setDuration(30);
  };

  const handleProctoringToggle = () => {
    setProctoringEnabled(!proctoringEnabled);
  };

  const addTopic = (sectionName: 'HR' | 'Technical' | 'Coding') => {
    if (!newTopic.value.trim()) return;
    setSections(sections.map(s =>
      s.name === sectionName
        ? { ...s, topics: [...s.topics, newTopic.value.trim()] }
        : s
    ));
    setNewTopic({ section: '' as any, value: '' });
  };

  const removeTopic = (sectionName: string, topicIndex: number) => {
    setSections(sections.map(s =>
      s.name === sectionName
        ? { ...s, topics: s.topics.filter((_, i) => i !== topicIndex) }
        : s
    ));
  };

  const getTotalPercentage = () => {
    return sections.filter(s => s.enabled).reduce((sum, s) => sum + s.percentage, 0);
  };

  // Handle coding section toggle with confirmation popups
  const handleCodingToggle = () => {
    const codingSection = sections.find(s => s.name === 'Coding');
    const isCurrentlyEnabled = codingSection?.enabled || false;

    if (!isCurrentlyEnabled) {
      // User wants to ENABLE coding
      // If we have JD-extracted languages, use them directly without popup
      if (jdExtractedLanguages.length > 0) {
        // Restore languages from JD extraction
        setSelectedCodingLanguages(jdExtractedLanguages);

        // Restore previous percentages if available, otherwise use defaults
        if (savedPercentagesBeforeCodingDisable) {
          setSections(sections.map(s => {
            if (s.name === 'HR') return { ...s, percentage: savedPercentagesBeforeCodingDisable.hr };
            if (s.name === 'Technical') return { ...s, percentage: savedPercentagesBeforeCodingDisable.technical };
            if (s.name === 'Coding') return { ...s, enabled: true, percentage: savedPercentagesBeforeCodingDisable.coding };
            return s;
          }));
          setSavedPercentagesBeforeCodingDisable(null);
        } else {
          setSections(sections.map(s => {
            if (s.name === 'HR') return { ...s, percentage: 20 };
            if (s.name === 'Technical') return { ...s, percentage: 70 };
            if (s.name === 'Coding') return { ...s, enabled: true, percentage: 10 };
            return s;
          }));
        }
        console.log('[TalentFlow] Coding re-enabled with JD-extracted languages:', jdExtractedLanguages);
        return;
      }

      // No JD-extracted languages - show popup for language selection
      setCodingPopupMode('enable');
      setShowCodingConfirm(true);
    } else {
      // User wants to DISABLE coding - check if at least one other round is enabled
      const otherEnabledCount = sections.filter(s => s.name !== 'Coding' && s.enabled).length;
      if (otherEnabledCount === 0) {
        setShowMinRoundPopup(true);
        return;
      }

      const hasLanguages = selectedCodingLanguages.length > 0;
      if (hasLanguages) {
        // Has languages configured - show confirmation popup before disabling
        setCodingPopupMode('disable');
        setShowCodingConfirm(true);
      } else {
        // No languages - disable directly with percentage redistribution
        const hrSection = sections.find(s => s.name === 'HR');
        const technicalSection = sections.find(s => s.name === 'Technical');
        const codingSection = sections.find(s => s.name === 'Coding');

        // Save current percentages
        setSavedPercentagesBeforeCodingDisable({
          hr: hrSection?.percentage || 0,
          technical: technicalSection?.percentage || 0,
          coding: codingSection?.percentage || 0,
        });

        // Redistribute coding percentage
        const codingPct = codingSection?.percentage || 0;
        let newHrPct = hrSection?.percentage || 0;
        let newTechPct = technicalSection?.percentage || 0;

        if (hrSection?.enabled && technicalSection?.enabled && codingPct > 0) {
          const totalOther = newHrPct + newTechPct;
          if (totalOther > 0) {
            const hrRatio = newHrPct / totalOther;
            newHrPct = Math.round(newHrPct + codingPct * hrRatio);
            newTechPct = 100 - newHrPct;
          } else {
            newHrPct = 50;
            newTechPct = 50;
          }
        } else if (hrSection?.enabled) {
          newHrPct = 100;
        } else if (technicalSection?.enabled) {
          newTechPct = 100;
        }

        setSections(sections.map(s => {
          if (s.name === 'HR') return { ...s, percentage: newHrPct };
          if (s.name === 'Technical') return { ...s, percentage: newTechPct };
          if (s.name === 'Coding') return { ...s, enabled: false, percentage: 0 };
          return s;
        }));
      }
    }
  };

  // Confirm button handler - works for both enable and disable modes
  const handleConfirmCodingAction = () => {
    if (codingPopupMode === 'enable') {
      // Enabling coding - require language selection
      if (selectedCodingLanguages.length === 0) {
        toast.warning('Please select at least one programming language');
        return;
      }

      // Restore previous percentages if available, otherwise use defaults
      if (savedPercentagesBeforeCodingDisable) {
        setSections(sections.map(s => {
          if (s.name === 'HR') return { ...s, percentage: savedPercentagesBeforeCodingDisable.hr };
          if (s.name === 'Technical') return { ...s, percentage: savedPercentagesBeforeCodingDisable.technical };
          if (s.name === 'Coding') return { ...s, enabled: true, percentage: savedPercentagesBeforeCodingDisable.coding };
          return s;
        }));
        setSavedPercentagesBeforeCodingDisable(null); // Clear saved state
      } else {
        // Default: HR 20%, Technical 70%, Coding 10%
        setSections(sections.map(s => {
          if (s.name === 'HR') return { ...s, percentage: 20 };
          if (s.name === 'Technical') return { ...s, percentage: 70 };
          if (s.name === 'Coding') return { ...s, enabled: true, percentage: 10 };
          return s;
        }));
      }
    } else {
      // Disabling coding - save current percentages, redistribute, clear languages
      const hrSection = sections.find(s => s.name === 'HR');
      const technicalSection = sections.find(s => s.name === 'Technical');
      const codingSection = sections.find(s => s.name === 'Coding');

      // Save current percentages before disabling
      setSavedPercentagesBeforeCodingDisable({
        hr: hrSection?.percentage || 0,
        technical: technicalSection?.percentage || 0,
        coding: codingSection?.percentage || 0,
      });

      // Redistribute coding percentage to other enabled rounds
      const codingPct = codingSection?.percentage || 0;
      const hrEnabled = hrSection?.enabled || false;
      const techEnabled = technicalSection?.enabled || false;

      let newHrPct = hrSection?.percentage || 0;
      let newTechPct = technicalSection?.percentage || 0;

      if (hrEnabled && techEnabled && codingPct > 0) {
        // Both HR and Technical enabled - split coding % proportionally
        const totalOther = newHrPct + newTechPct;
        if (totalOther > 0) {
          const hrRatio = newHrPct / totalOther;
          const techRatio = newTechPct / totalOther;
          newHrPct = Math.round(newHrPct + codingPct * hrRatio);
          newTechPct = 100 - newHrPct; // Ensure total is exactly 100%
        } else {
          // Both are 0, split evenly
          newHrPct = 50;
          newTechPct = 50;
        }
      } else if (hrEnabled && codingPct > 0) {
        // Only HR enabled - give all coding % to HR
        newHrPct = 100;
      } else if (techEnabled && codingPct > 0) {
        // Only Technical enabled - give all coding % to Technical
        newTechPct = 100;
      }

      setSelectedCodingLanguages([]);
      setSections(sections.map(s => {
        if (s.name === 'HR') return { ...s, percentage: newHrPct };
        if (s.name === 'Technical') return { ...s, percentage: newTechPct };
        if (s.name === 'Coding') return { ...s, enabled: false, percentage: 0 };
        return s;
      }));
    }
    setShowCodingConfirm(false);
  };

  // Cancel button handler - works for both enable and disable modes
  const handleCancelCodingAction = () => {
    // Just close the popup without making changes
    setShowCodingConfirm(false);
  };

  // Handle HR round toggle with validation
  const handleHRToggle = () => {
    const hrSection = sections.find(s => s.name === 'HR');
    const isCurrentlyEnabled = hrSection?.enabled || false;

    if (isCurrentlyEnabled) {
      // Trying to disable HR - check if at least one other round is enabled
      const otherEnabledCount = sections.filter(s => s.name !== 'HR' && s.enabled).length;
      if (otherEnabledCount === 0) {
        setShowMinRoundPopup(true);
        return;
      }

      // Redistribute HR percentage to other enabled rounds
      const hrPct = hrSection?.percentage || 0;
      const techSection = sections.find(s => s.name === 'Technical');
      const codingSection = sections.find(s => s.name === 'Coding');

      let newTechPct = techSection?.percentage || 0;
      let newCodingPct = codingSection?.percentage || 0;

      if (techSection?.enabled && codingSection?.enabled && hrPct > 0) {
        const totalOther = newTechPct + newCodingPct;
        if (totalOther > 0) {
          const techRatio = newTechPct / totalOther;
          newTechPct = Math.round(newTechPct + hrPct * techRatio);
          newCodingPct = 100 - newTechPct;
        } else {
          newTechPct = 50;
          newCodingPct = 50;
        }
      } else if (techSection?.enabled) {
        newTechPct = 100;
      } else if (codingSection?.enabled) {
        newCodingPct = 100;
      }

      setSections(sections.map(s => {
        if (s.name === 'HR') return { ...s, enabled: false, percentage: 0 };
        if (s.name === 'Technical') return { ...s, percentage: newTechPct };
        if (s.name === 'Coding') return { ...s, percentage: newCodingPct };
        return s;
      }));
    } else {
      // Enabling HR - give it a default percentage and adjust others
      const techSection = sections.find(s => s.name === 'Technical');
      const codingSection = sections.find(s => s.name === 'Coding');
      const totalCurrent = (techSection?.enabled ? techSection.percentage : 0) + (codingSection?.enabled ? codingSection.percentage : 0);

      // Give HR 30% by default, reduce others proportionally
      const hrNewPct = 30;
      const remaining = 100 - hrNewPct;

      let newTechPct = techSection?.percentage || 0;
      let newCodingPct = codingSection?.percentage || 0;

      if (totalCurrent > 0) {
        if (techSection?.enabled) newTechPct = Math.round((techSection.percentage / totalCurrent) * remaining);
        if (codingSection?.enabled) newCodingPct = remaining - (techSection?.enabled ? newTechPct : 0);
      }

      setSections(sections.map(s => {
        if (s.name === 'HR') return { ...s, enabled: true, percentage: hrNewPct };
        if (s.name === 'Technical') return { ...s, percentage: newTechPct };
        if (s.name === 'Coding') return { ...s, percentage: newCodingPct };
        return s;
      }));
    }
  };

  // Handle Technical round toggle with validation
  const handleTechnicalToggle = () => {
    const techSection = sections.find(s => s.name === 'Technical');
    const isCurrentlyEnabled = techSection?.enabled || false;

    if (isCurrentlyEnabled) {
      // Trying to disable Technical - check if at least one other round is enabled
      const otherEnabledCount = sections.filter(s => s.name !== 'Technical' && s.enabled).length;
      if (otherEnabledCount === 0) {
        setShowMinRoundPopup(true);
        return;
      }

      // Redistribute Technical percentage to other enabled rounds
      const techPct = techSection?.percentage || 0;
      const hrSection = sections.find(s => s.name === 'HR');
      const codingSection = sections.find(s => s.name === 'Coding');

      let newHrPct = hrSection?.percentage || 0;
      let newCodingPct = codingSection?.percentage || 0;

      if (hrSection?.enabled && codingSection?.enabled && techPct > 0) {
        const totalOther = newHrPct + newCodingPct;
        if (totalOther > 0) {
          const hrRatio = newHrPct / totalOther;
          newHrPct = Math.round(newHrPct + techPct * hrRatio);
          newCodingPct = 100 - newHrPct;
        } else {
          newHrPct = 50;
          newCodingPct = 50;
        }
      } else if (hrSection?.enabled) {
        newHrPct = 100;
      } else if (codingSection?.enabled) {
        newCodingPct = 100;
      }

      setSections(sections.map(s => {
        if (s.name === 'HR') return { ...s, percentage: newHrPct };
        if (s.name === 'Technical') return { ...s, enabled: false, percentage: 0 };
        if (s.name === 'Coding') return { ...s, percentage: newCodingPct };
        return s;
      }));
    } else {
      // Enabling Technical - give it a default percentage and adjust others
      const hrSection = sections.find(s => s.name === 'HR');
      const codingSection = sections.find(s => s.name === 'Coding');
      const totalCurrent = (hrSection?.enabled ? hrSection.percentage : 0) + (codingSection?.enabled ? codingSection.percentage : 0);

      // Give Technical 70% by default, reduce others proportionally
      const techNewPct = 70;
      const remaining = 100 - techNewPct;

      let newHrPct = hrSection?.percentage || 0;
      let newCodingPct = codingSection?.percentage || 0;

      if (totalCurrent > 0) {
        if (hrSection?.enabled) newHrPct = Math.round((hrSection.percentage / totalCurrent) * remaining);
        if (codingSection?.enabled) newCodingPct = remaining - (hrSection?.enabled ? newHrPct : 0);
      }

      setSections(sections.map(s => {
        if (s.name === 'HR') return { ...s, percentage: newHrPct };
        if (s.name === 'Technical') return { ...s, enabled: true, percentage: techNewPct };
        if (s.name === 'Coding') return { ...s, percentage: newCodingPct };
        return s;
      }));
    }
  };

  // Toggle a language in the selection
  const toggleLanguageSelection = (lang: string) => {
    setSelectedCodingLanguages(prev =>
      prev.includes(lang) ? prev.filter(l => l !== lang) : [...prev, lang]
    );
  };

  const handleGenerateAssessment = async (saveAsDraft: boolean = false) => {
    setIsGenerating(true);

    try {
      // Call the real API to create/update assessment
      const hrSection = sections.find(s => s.name === 'HR');
      const technicalSection = sections.find(s => s.name === 'Technical');
      const codingSection = sections.find(s => s.name === 'Coding');

      const assessmentData = {
        jd_id: selectedJob?.id || '',
        title: isEditMode && editingAssessment
          ? editingAssessment.title  // Keep existing title - backend will update version
          : `${selectedJob?.title} - Assessment - Version 1`,
        description: `Assessment for ${selectedJob?.title} position`,
        duration_minutes: duration,  // Include the configured duration
        hr_enabled: hrSection?.enabled || false,
        hr_percentage: hrSection?.enabled ? hrSection.percentage : 0,
        hr_topics: hrSection?.topics || [],
        technical_enabled: technicalSection?.enabled || false,
        technical_percentage: technicalSection?.enabled ? technicalSection.percentage : 0,
        technical_topics: technicalSection?.topics || [],
        coding_enabled: codingSection?.enabled || false,
        coding_percentage: codingSection?.enabled ? codingSection.percentage : 0,
        coding_topics: codingSection?.topics || [],
        coding_languages: selectedCodingLanguages,
        proctoring_enabled: proctoringEnabled,
      };

      let resultAssessment;

      if (isEditMode && editingAssessment) {
        // Update existing assessment
        console.log('[TalentFlow] Updating assessment:', editingAssessment.id);
        resultAssessment = await assessmentService.update(editingAssessment.id, assessmentData);

        // If not saving as draft, publish the updated assessment
        if (!saveAsDraft) {
          await assessmentService.publish(editingAssessment.id);
        }
      } else {
        // Create new assessment
        resultAssessment = await assessmentService.create(assessmentData);

        // If not saving as draft, publish immediately
        if (!saveAsDraft) {
          await assessmentService.publish(resultAssessment.id);
        }
      }

      // Map API response to local format
      const assessmentDefinition = {
        id: resultAssessment.id,
        title: resultAssessment.title,
        version: resultAssessment.version || 1,
        job: selectedJob,
        duration: resultAssessment.duration_minutes,
        sections: sections.filter(s => s.enabled).map(section => ({
          name: section.name,
          percentage: section.percentage,
          topics: section.topics,
          questions: Math.ceil((resultAssessment.duration_minutes * section.percentage) / 100 / 2),
          difficulty: selectedJob?.experience === 'Senior' || selectedJob?.experience === 'Lead' ? 'Advanced' :
                     selectedJob?.experience === 'Mid-Level' ? 'Intermediate' : 'Basic',
          estimatedTime: Math.ceil((resultAssessment.duration_minutes * section.percentage) / 100),
        })),
        status: saveAsDraft ? 'Draft' : 'Active',
        createdAt: resultAssessment.created_at,
      };

      setGeneratedAssessment(assessmentDefinition);
      setIsGenerating(false);

      // If published (not draft), redirect to assessments list
      if (!saveAsDraft) {
        console.log('[AssessmentCreation] Assessment published, redirecting to assessments list');
        router.push('/recruitment/assessments');
      } else {
        // If saved as draft, show preview
        setStep('preview');
      }
    } catch (error) {
      console.error('Failed to create/update assessment:', error);
      setIsGenerating(false);
      toast.error(`Failed to ${isEditMode ? 'update' : 'create'} assessment: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const handlePublish = () => {
    onCreateAssessment({ ...generatedAssessment, status: 'Active' });
    onBack();
  };

  // Auto-save as draft when navigating away from configure step
  const handleAutoSaveDraft = async (navigateCallback: () => void) => {
    // Only auto-save if we're in configure step and have a selected job
    if (step !== 'configure' || !selectedJob) {
      navigateCallback();
      return;
    }

    // If already saved as draft, just navigate
    if (draftSavedId) {
      navigateCallback();
      return;
    }

    // Check if percentages are valid before auto-saving
    const totalPercentage = sections.filter(s => s.enabled).reduce((sum, s) => sum + s.percentage, 0);
    if (totalPercentage !== 100) {
      console.log('[TalentFlow] Skipping auto-save: percentages do not sum to 100% (current:', totalPercentage, '%)');
      navigateCallback();
      return;
    }

    setIsAutoSaving(true);

    try {
      const hrSection = sections.find(s => s.name === 'HR');
      const technicalSection = sections.find(s => s.name === 'Technical');
      const codingSection = sections.find(s => s.name === 'Coding');

      const assessmentData = {
        jd_id: selectedJob?.id || '',
        title: `${selectedJob?.title} - Assessment - Version 1`,
        description: `Assessment for ${selectedJob?.title} position`,
        duration_minutes: duration,
        hr_enabled: hrSection?.enabled || false,
        hr_percentage: hrSection?.enabled ? hrSection.percentage : 0,
        hr_topics: hrSection?.topics || [],
        technical_enabled: technicalSection?.enabled || false,
        technical_percentage: technicalSection?.enabled ? technicalSection.percentage : 0,
        technical_topics: technicalSection?.topics || [],
        coding_enabled: codingSection?.enabled || false,
        coding_percentage: codingSection?.enabled ? codingSection.percentage : 0,
        coding_topics: codingSection?.topics || [],
        coding_languages: selectedCodingLanguages,
        proctoring_enabled: proctoringEnabled,
      };

      // Check if an assessment already exists for this JD
      const existingAssessments = await assessmentService.list({ jd_id: selectedJob.id });

      if (existingAssessments?.items && existingAssessments.items.length > 0) {
        // Assessment already exists for this JD - update it instead of creating
        const existingAssessment = existingAssessments.items[0];
        console.log('[TalentFlow] Assessment already exists for JD, updating:', existingAssessment.id);

        await assessmentService.update(existingAssessment.id, assessmentData);
        setDraftSavedId(existingAssessment.id);
        console.log('[TalentFlow] Assessment updated as draft:', existingAssessment.id);
      } else {
        // No existing assessment - create new one
        const createdAssessment = await assessmentService.create(assessmentData);
        setDraftSavedId(createdAssessment.id);
        console.log('[TalentFlow] Assessment auto-saved as draft:', createdAssessment.id);
      }

      setIsAutoSaving(false);
      navigateCallback();
    } catch (error) {
      console.error('Failed to auto-save draft:', error);
      setIsAutoSaving(false);
      // Still navigate even if save fails
      navigateCallback();
    }
  };

  // Handle browser close/refresh - save draft
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (step === 'configure' && selectedJob && !draftSavedId) {
        // Check if percentages are valid before auto-saving
        const totalPct = sections.filter(s => s.enabled).reduce((sum, s) => sum + s.percentage, 0);
        if (totalPct !== 100) {
          console.log('[TalentFlow] Skipping beforeunload auto-save: percentages do not sum to 100%');
          return;
        }

        // Trigger auto-save synchronously (best effort)
        const hrSection = sections.find(s => s.name === 'HR');
        const technicalSection = sections.find(s => s.name === 'Technical');
        const codingSection = sections.find(s => s.name === 'Coding');

        const createData = {
          jd_id: selectedJob?.id || '',
          title: `${selectedJob?.title} - Assessment - Version 1`,
          description: `Assessment for ${selectedJob?.title} position`,
          duration_minutes: duration,
          hr_enabled: hrSection?.enabled || false,
          hr_percentage: hrSection?.enabled ? hrSection.percentage : 0,
          hr_topics: hrSection?.topics || [],
          technical_enabled: technicalSection?.enabled || false,
          technical_percentage: technicalSection?.enabled ? technicalSection.percentage : 0,
          technical_topics: technicalSection?.topics || [],
          coding_enabled: codingSection?.enabled || false,
          coding_percentage: codingSection?.enabled ? codingSection.percentage : 0,
          coding_topics: codingSection?.topics || [],
          coding_languages: selectedCodingLanguages,
          proctoring_enabled: proctoringEnabled,
        };

        // Use sendBeacon for reliable save on page unload
        const blob = new Blob([JSON.stringify(createData)], { type: 'application/json' });
        navigator.sendBeacon?.('/api/assessments/draft', blob);

        e.preventDefault();
        e.returnValue = '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [step, selectedJob, draftSavedId, sections, duration, selectedCodingLanguages, proctoringEnabled]);

  const totalPercentage = getTotalPercentage();
  const enabledSections = sections.filter(s => s.enabled);
  const hasAtLeastOneEnabled = enabledSections.length > 0;
  const hasZeroPercentageEnabled = enabledSections.some(s => s.percentage === 0);
  const isPercentageValid = totalPercentage === 100 && hasAtLeastOneEnabled && !hasZeroPercentageEnabled;

  // Use localJobs which includes newly created JDs
  const availableJobs = localJobs.length > 0 ? localJobs : jobs;

  // Step 1: Select JD
  if (step === 'select-jd') {
    return (
      <div className="flex-1 p-8 overflow-y-auto bg-gray-50">
        <div className="w-full">
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-6 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
            Back to Assessments
          </button>

          <div className="mb-8">
            <h1 className="text-gray-900 mb-2">{isEditMode ? 'Edit Assessment' : 'Create New Assessment'}</h1>
            <p className="text-gray-600">
              {isEditMode
                ? 'Update the assessment configuration. Changes will create a new version.'
                : 'Select a Job Description to create an AI-powered assessment'}
            </p>
          </div>

          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-6 flex items-start gap-3">
            <Sparkles className="w-5 h-5 text-gray-800 flex-shrink-0 mt-0.5" />
            <div>
              <div className="text-sm text-gray-800 mb-1">AI-Powered Assessment Generation</div>
              <div className="text-sm text-gray-900">
                Automatically generate questions based on the JD, adjusting difficulty, topics, and time allocation based on your configuration. <strong>Each candidate receives a unique, freshly generated question set</strong> to ensure fairness and prevent question sharing.
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-gray-900">Select Job Description</h2>
                  <p className="text-sm text-gray-600 mt-1">
                    Choose the JD that this assessment will be based on
                  </p>
                </div>
                <button
                  onClick={handleCreateNewJD}
                  className="px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-colors flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  Create New Job
                </button>
              </div>
            </div>

            <div className="p-6">
              {isLoadingJobs ? (
                <div className="text-center py-12">
                  <div className="w-10 h-10 border-4 border-gray-300 border-t-gray-800 rounded-full animate-spin mx-auto mb-3"></div>
                  <p className="text-gray-500">Loading job descriptions...</p>
                </div>
              ) : (
              <div className="space-y-3">
                {availableJobs.filter(j => j.status === 'Published').map(job => {
                  // Check if this JD already has an assessment (1:1 relationship)
                  const hasExistingAssessment = jdsWithAssessments.has(job.id);

                  // Format experience range
                  const expRange = job.experience_min && job.experience_max
                    ? `${job.experience_min}-${job.experience_max} years`
                    : job.experience_min
                      ? `${job.experience_min}+ years`
                      : job.experience || 'Not specified';

                  // Format posted date
                  const postedDate = job.postedDate
                    ? new Date(job.postedDate).toLocaleDateString('en-US', { day: '2-digit', month: '2-digit', year: 'numeric' })
                    : 'N/A';

                  return (
                    <div
                      key={job.id}
                      onClick={() => !hasExistingAssessment && handleJobSelect(job)}
                      className={`w-full text-left p-5 border rounded-lg transition-all ${
                        hasExistingAssessment
                          ? 'border-gray-200 bg-gray-50 opacity-60 cursor-not-allowed'
                          : 'border-gray-200 hover:border-gray-300 hover:shadow-md cursor-pointer bg-white'
                      }`}
                    >
                      <div className="flex items-start gap-4">
                        {/* Icon */}
                        <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
                          <Briefcase className="w-5 h-5 text-gray-500" />
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          {/* Title Row */}
                          <div className="flex items-center gap-2 mb-2 flex-wrap">
                            {job.job_id && (
                              <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs font-medium">
                                {job.job_id}
                              </span>
                            )}
                            <h3 className="text-gray-900 font-medium">
                              {job.title}
                            </h3>
                            <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs flex items-center gap-1">
                              <span className="w-1.5 h-1.5 bg-green-500 rounded-full"></span>
                              Published
                            </span>
                            {job.creation_method === 'ai_generated' && (
                              <span className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full text-xs flex items-center gap-1">
                                <span className="w-1.5 h-1.5 bg-purple-500 rounded-full"></span>
                                AI
                              </span>
                            )}
                          </div>

                          {/* Details Row */}
                          <div className="flex items-center gap-4 text-xs text-gray-500 flex-wrap">
                            <span className="flex items-center gap-1">
                              <Building2 className="w-3.5 h-3.5" />
                              {job.industry_type || 'Technology'}
                            </span>
                            <span className="flex items-center gap-1">
                              <MapPin className="w-3.5 h-3.5" />
                              {job.location}
                            </span>
                            <span className="flex items-center gap-1">
                              <Clock className="w-3.5 h-3.5" />
                              {job.employmentType || 'full_time'}
                            </span>
                            <span className="flex items-center gap-1">
                              <TrendingUp className="w-3.5 h-3.5" />
                              {expRange}
                            </span>
                            <span className="flex items-center gap-1">
                              <Calendar className="w-3.5 h-3.5" />
                              Posted {postedDate}
                            </span>
                            <span className="flex items-center gap-1">
                              <User className="w-3.5 h-3.5" />
                              By {job.postedBy || 'Unknown'}
                            </span>
                            <span className="flex items-center gap-1">
                              <Users className="w-3.5 h-3.5" />
                              {job.applicants || 0} applicants
                            </span>
                          </div>
                        </div>

                        {/* Right side - Coding badge and Select button */}
                        <div className="flex items-center gap-3 flex-shrink-0">
                          {job.coding_required === true ? (
                            <span className="px-2.5 py-1 bg-green-100 text-green-700 rounded text-xs flex items-center gap-1">
                              <Code className="w-3 h-3" />
                              Coding
                            </span>
                          ) : (
                            <span className="px-2.5 py-1 bg-gray-100 text-gray-500 rounded text-xs flex items-center gap-1">
                              <Code className="w-3 h-3" />
                              No Coding
                            </span>
                          )}
                          {hasExistingAssessment ? (
                            <span className="px-3 py-1.5 bg-green-100 text-green-700 rounded-lg text-xs flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3" />
                              Assessment Created
                            </span>
                          ) : (
                            <button className="px-3 py-1.5 bg-gray-800 text-white rounded-lg text-xs hover:bg-gray-900 transition-colors">
                              Select
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}

                {availableJobs.filter(j => j.status === 'Published').length === 0 && (
                  <div className="text-center py-12 text-gray-500">
                    <Briefcase className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p>No published jobs available</p>
                    <p className="text-sm mt-1">Create and publish a Job first to create assessments</p>
                    <button
                      onClick={handleCreateNewJD}
                      className="mt-4 px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-colors flex items-center gap-2 mx-auto"
                    >
                      <Plus className="w-4 h-4" />
                      Create New Job
                    </button>
                  </div>
                )}
              </div>
              )}
            </div>
          </div>
        </div>

        {/* Full-screen JD Creation Modal */}
        {showJDCreation && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-[95vw] h-[95vh] flex flex-col">
              {/* Modal Header */}
              <div className="bg-gray-800 px-6 py-4 flex items-center justify-between flex-shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center">
                    <Briefcase className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h2 className="text-white font-medium">Create New Job</h2>
                    <p className="text-gray-300 text-sm">Create a job description for your assessment</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowJDCreation(false)}
                  className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                  title="Close"
                >
                  <X className="w-5 h-5 text-white" />
                </button>
              </div>

              {/* JDCreation Component */}
              <div className="flex-1 overflow-auto">
                <JDCreation
                  onBack={() => setShowJDCreation(false)}
                  onPublish={(job) => handleJDPublished(job)}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Step 2: Configure Assessment
  if (step === 'configure') {
    const enabledSectionsCount = sections.filter(s => s.enabled).length;

    return (
      <div className="flex-1 p-8 overflow-y-auto bg-gray-50 relative">
        {/* Auto-saving overlay */}
        {isAutoSaving && (
          <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl p-6 flex items-center gap-3">
              <Loader2 className="w-5 h-5 animate-spin text-gray-700" />
              <span className="text-gray-700 font-medium">Auto-saving draft...</span>
            </div>
          </div>
        )}

        <div className="w-full">
          <button
            onClick={() => handleAutoSaveDraft(() => setStep('select-jd'))}
            disabled={isAutoSaving}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-6 transition-colors disabled:opacity-50"
          >
            <ArrowLeft className="w-5 h-5" />
            Back to Job Selection
          </button>

          <div className="mb-6">
            <h1 className="text-2xl font-semibold text-gray-900 mb-1">Configure Assessment</h1>
            <p className="text-gray-600">
              Set duration, section distribution, and topics for <span className="text-gray-900 font-medium">{selectedJob?.title}</span>
            </p>
          </div>

          {/* Two Column Layout */}
          <div className="flex gap-6">
            {/* Left Column - Main Content */}
            <div className="flex-1 space-y-6">
              {/* Configure Assessment Rounds */}
              <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
                <div className="flex items-center gap-2 mb-2">
                  <Sliders className="w-5 h-5 text-gray-700" />
                  <h3 className="font-medium text-gray-900">Configure Assessment Rounds</h3>
                </div>
                <p className="text-sm text-gray-500 mb-4">
                  Choose which rounds to include in this assessment. Disabled rounds will not appear in the section distribution.
                </p>

                <div className="space-y-3">
                  {/* HR Round Toggle */}
                  <div className={`p-4 border rounded-lg transition-all ${!topicSettings?.hr_enabled ? 'border-gray-200 bg-gray-100 opacity-60' : sections.find(s => s.name === 'HR')?.enabled ? 'border-gray-300 bg-white' : 'border-gray-200 bg-gray-50'}`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Users className="w-5 h-5 text-gray-600" />
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-gray-900">HR Round</span>
                            {topicSettings?.hr_enabled === false ? (
                              <span className="px-2 py-0.5 bg-red-100 text-red-600 rounded text-xs">Disabled in Settings</span>
                            ) : topicSettings?.hr_scoring_type === 'scored' ? (
                              <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs">Scored (0-10)</span>
                            ) : (
                              <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs">Informational</span>
                            )}
                          </div>
                          <p className="text-sm text-gray-500">Cultural fit, communication skills, and behavioral questions</p>
                        </div>
                      </div>
                      <button
                        onClick={() => topicSettings?.hr_enabled !== false && handleHRToggle()}
                        disabled={topicSettings?.hr_enabled === false}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${topicSettings?.hr_enabled === false ? 'bg-gray-200 cursor-not-allowed' : sections.find(s => s.name === 'HR')?.enabled ? 'bg-gray-800' : 'bg-gray-300'}`}
                      >
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${sections.find(s => s.name === 'HR')?.enabled ? 'translate-x-6' : 'translate-x-1'}`} />
                      </button>
                    </div>
                  </div>

                  {/* Technical Round Toggle */}
                  <div className={`p-4 border rounded-lg transition-all ${!topicSettings?.technical_enabled ? 'border-gray-200 bg-gray-100 opacity-60' : sections.find(s => s.name === 'Technical')?.enabled ? 'border-gray-300 bg-white' : 'border-gray-200 bg-gray-50'}`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Brain className="w-5 h-5 text-gray-600" />
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-gray-900">Technical Round</span>
                            {topicSettings?.technical_enabled === false ? (
                              <span className="px-2 py-0.5 bg-red-100 text-red-600 rounded text-xs">Disabled in Settings</span>
                            ) : topicSettings?.technical_scoring_type === 'informational' ? (
                              <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs">Informational</span>
                            ) : (
                              <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs">Scored (0-10)</span>
                            )}
                          </div>
                          <p className="text-sm text-gray-500">Domain knowledge, technical concepts, and job-specific skills</p>
                        </div>
                      </div>
                      <button
                        onClick={() => topicSettings?.technical_enabled !== false && handleTechnicalToggle()}
                        disabled={topicSettings?.technical_enabled === false}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${topicSettings?.technical_enabled === false ? 'bg-gray-200 cursor-not-allowed' : sections.find(s => s.name === 'Technical')?.enabled ? 'bg-gray-800' : 'bg-gray-300'}`}
                      >
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${sections.find(s => s.name === 'Technical')?.enabled ? 'translate-x-6' : 'translate-x-1'}`} />
                      </button>
                    </div>
                  </div>

                  {/* Coding Round Toggle - Only shown when JD requires coding or languages detected */}
                  {(() => {
                    // Determine if coding section should be shown at all
                    const isCodingDisabledBySettings = topicSettings?.coding_enabled === false;

                    // Check if JD requires coding or languages were extracted/detected
                    const jdRequiresCoding = selectedJob?.coding_required === true;
                    const hasExtractedLanguages = jdExtractedLanguages.length > 0;

                    // Only show coding section if JD requires it OR languages were detected
                    // Hide completely if JD doesn't require coding (no toggle at all)
                    const shouldShowCodingSection = (jdRequiresCoding || hasExtractedLanguages) && !isCodingDisabledBySettings;

                    if (!shouldShowCodingSection) {
                      // Don't render the coding section at all - it's not needed for this JD
                      return null;
                    }

                    const codingEnabled = sections.find(s => s.name === 'Coding')?.enabled;
                    const wasAutoDetected = !jdRequiresCoding && hasExtractedLanguages;

                    return (
                      <div className={`p-4 border rounded-lg transition-all ${codingEnabled ? 'border-gray-300 bg-white' : 'border-gray-200 bg-gray-50'}`}>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <Code className="w-5 h-5 text-gray-600" />
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-gray-900">Coding Round</span>
                                {topicSettings?.coding_scoring_type === 'informational' ? (
                                  <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs">Informational</span>
                                ) : (
                                  <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs">Scored (0-10)</span>
                                )}
                                {wasAutoDetected && (
                                  <span className="px-2 py-0.5 bg-blue-100 text-blue-600 rounded text-xs">Auto-Detected from Skills</span>
                                )}
                                {jdRequiresCoding && (
                                  <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs">Auto-Enabled</span>
                                )}
                              </div>
                              <p className="text-sm text-gray-500">
                                {wasAutoDetected
                                  ? `Programming languages detected from skills: ${selectedCodingLanguages.length > 0 ? selectedCodingLanguages.join(', ') : jdExtractedLanguages.join(', ')}`
                                  : `Programming languages: ${selectedCodingLanguages.length > 0 ? selectedCodingLanguages.join(', ') : jdExtractedLanguages.join(', ')}`
                                }
                              </p>
                            </div>
                          </div>
                          <button
                            onClick={() => handleCodingToggle()}
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${codingEnabled ? 'bg-gray-800' : 'bg-gray-300'}`}
                          >
                            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${codingEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                          </button>
                        </div>
                      </div>
                    );
                  })()}
                </div>

                {/* Smart Configuration Info */}
                <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
                  <div className="flex items-start gap-2">
                    <Sparkles className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-blue-700">
                      <strong>Smart Configuration:</strong> Coding round is only shown when the JD requires coding or programming languages are detected in the skills. Languages are automatically extracted from the JD and preserved when toggling the coding round. Disabled rounds are hidden from the section distribution below.
                    </p>
                  </div>
                </div>
              </div>

              {/* Assessment Duration - LOCKED at 30 minutes */}
              <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Clock className="w-5 h-5 text-gray-700" />
                  <h3 className="font-medium text-gray-900">Assessment Duration</h3>
                  <span className="text-xs text-gray-500 ml-2">(Fixed at 30 minutes)</span>
                </div>
                <div className="flex items-center gap-4">
                  <input
                    type="range"
                    min="30"
                    max="30"
                    step="5"
                    value={30}
                    disabled
                    className="flex-1 h-2 bg-gray-100 rounded-lg appearance-none cursor-not-allowed"
                  />
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={30}
                      disabled
                      className="w-16 px-3 py-2 border border-gray-300 rounded-lg text-center text-sm text-gray-900 bg-gray-50 cursor-not-allowed"
                    />
                    <span className="text-sm text-gray-600">minutes</span>
                  </div>
                </div>
                <p className="text-xs text-gray-500 mt-2">Duration is fixed at 30 minutes for all assessments</p>
              </div>

              {/* Proctoring & Security - Hidden for now */}
              {/* <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Shield className="w-5 h-5 text-violet-600" />
                  <h3 className="font-medium text-gray-900">Proctoring & Security</h3>
                </div>

                <div className={`p-4 border rounded-lg transition-all ${proctoringEnabled ? 'border-violet-300 bg-violet-50' : 'border-gray-200 bg-gray-50'}`}>
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${proctoringEnabled ? 'bg-violet-100' : 'bg-gray-200'}`}>
                        <Video className={`w-5 h-5 ${proctoringEnabled ? 'text-violet-600' : 'text-gray-500'}`} />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium text-gray-900">Proctoring Mode</span>
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                            proctoringEnabled ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-600'
                          }`}>
                            {proctoringEnabled ? 'Enabled' : 'Disabled'}
                          </span>
                        </div>
                        <p className="text-sm text-gray-600 mb-3">
                          {proctoringEnabled
                            ? 'Advanced security monitoring will be active for this assessment including webcam, screen recording, and AI cheating prevention.'
                            : 'Standard mode without advanced monitoring. Suitable for low-stakes assessments.'
                          }
                        </p>

                        {/* Privacy Notice */}
                        {/* {proctoringEnabled && (
                          <div className="flex items-start gap-2 p-3 bg-blue-50 rounded-lg border border-blue-100">
                            <Info className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
                            <p className="text-xs text-blue-700">
                              Candidates will be notified about proctoring before starting. All recordings are encrypted and GDPR/DPDP compliant.
                            </p>
                          </div>
                        )} */}
                      {/* </div>
                    </div> */}

                    {/* Toggle Switch */}
                    {/* <div className="flex flex-col items-center gap-1 ml-4">
                      <button
                        onClick={handleProctoringToggle}
                        className={`relative inline-flex h-7 w-14 items-center rounded-full transition-colors ${
                          proctoringEnabled ? 'bg-violet-600' : 'bg-gray-300'
                        }`}
                      >
                        <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-md transition-transform ${
                          proctoringEnabled ? 'translate-x-8' : 'translate-x-1'
                        }`} />
                      </button>
                      <span className="text-xs text-gray-500 font-medium">
                        {proctoringEnabled ? 'ON' : 'OFF'}
                      </span>
                    </div>
                  </div>
                </div>
              </div> */}

              {/* Section Distribution */}
              <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Sliders className="w-5 h-5 text-gray-700" />
                    <h3 className="font-medium text-gray-900">Section Distribution</h3>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-500">Total:</span>
                    <span className={`text-sm font-medium ${isPercentageValid ? 'text-green-600' : 'text-red-600'}`}>
                      {totalPercentage}%
                    </span>
                  </div>
                </div>

                {!isPercentageValid && (
                  <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-yellow-600 flex-shrink-0 mt-0.5" />
                    <div className="text-sm text-yellow-800">
                      {!hasAtLeastOneEnabled && (
                        <p>At least one assessment round must be enabled.</p>
                      )}
                      {hasAtLeastOneEnabled && hasZeroPercentageEnabled && (
                        <p>Enabled rounds cannot have 0% allocation. Disable the round or assign a percentage.</p>
                      )}
                      {hasAtLeastOneEnabled && !hasZeroPercentageEnabled && totalPercentage !== 100 && (
                        <p>Section percentages must total exactly 100% (currently {totalPercentage}%).</p>
                      )}
                    </div>
                  </div>
                )}

                <div className="space-y-4">
                  {sections.filter(s => s.enabled).map((section) => (
                    <div key={section.name} className="p-4 border border-gray-200 rounded-lg">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          {section.name === 'HR' && <Users className="w-4 h-4 text-gray-600" />}
                          {section.name === 'Technical' && <Brain className="w-4 h-4 text-gray-600" />}
                          {section.name === 'Coding' && <Code className="w-4 h-4 text-gray-600" />}
                          <span className="font-medium text-gray-900">{section.name} Section</span>
                          {section.name === 'HR' ? (
                            <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs">Informational</span>
                          ) : (
                            <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs">Scored (0-10)</span>
                          )}
                        </div>
                        {section.name === 'Coding' && requiresCoding(selectedJob!) && (
                          <span className="text-xs text-gray-500">Auto-enabled (coding required)</span>
                        )}
                      </div>

                      <p className="text-xs text-gray-500 mb-3">
                        ~{Math.ceil((duration * section.percentage) / 100)} minutes • ~{Math.ceil((duration * section.percentage) / 100 / 2)} questions
                        {section.name !== 'HR' && <span> • Pass: &gt;7/10</span>}
                      </p>

                      {/* Percentage Allocation */}
                      <div className="mb-4">
                        <label className="text-xs text-gray-600 mb-2 block">Percentage Allocation</label>
                        <div className="flex items-center gap-3">
                          <input
                            type="range"
                            min="0"
                            max="100"
                            value={section.percentage}
                            onChange={(e) => updatePercentage(section.name, Number(e.target.value))}
                            className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-gray-800"
                          />
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              value={section.percentage}
                              onChange={(e) => updatePercentage(section.name, Number(e.target.value))}
                              className="w-14 px-2 py-1.5 border border-gray-300 rounded-lg text-center text-sm text-gray-900"
                            />
                            <span className="text-sm text-gray-600">%</span>
                          </div>
                        </div>
                      </div>

                      {/* Topics */}
                      <div>
                        <label className="text-xs text-gray-600 mb-2 block">
                          Topics (LLM will generate questions based on these)
                        </label>
                        <div className="flex gap-2 mb-2">
                          <input
                            type="text"
                            value={newTopic.section === section.name ? newTopic.value : ''}
                            onChange={(e) => setNewTopic({ section: section.name, value: e.target.value })}
                            onKeyPress={(e) => e.key === 'Enter' && addTopic(section.name)}
                            placeholder={`e.g., ${
                              section.name === 'HR'
                                ? 'conflict handling, salary discussion, teamwork'
                                : section.name === 'Technical'
                                ? 'domain tools, regulations, workflows'
                                : 'algorithm type, framework, logic pattern'
                            }`}
                            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500 text-sm"
                          />
                          <button
                            onClick={() => addTopic(section.name)}
                            className="px-3 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-colors flex items-center gap-1 text-sm"
                          >
                            <Plus className="w-4 h-4" />
                            Add Topic
                          </button>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {section.topics.map((topic, idx) => (
                            <span
                              key={idx}
                              className="px-2.5 py-1 bg-gray-100 text-gray-800 rounded text-xs flex items-center gap-1.5 border border-gray-200"
                            >
                              {topic}
                              <button onClick={() => removeTopic(section.name, idx)} className="hover:text-gray-900">
                                <X className="w-3 h-3" />
                              </button>
                            </span>
                          ))}
                          {section.topics.length === 0 && (
                            <span className="text-xs text-gray-400 italic">
                              No topics added yet. Add topics for AI to generate relevant questions.
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Right Column - Sidebar */}
            <div className="w-80 flex-shrink-0 space-y-4">
              {/* AI Assessment Generation Info */}
              <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4">
                <div
                  className="flex items-center justify-between cursor-pointer"
                  onClick={() => setIsAIGenerationExpanded(!isAIGenerationExpanded)}
                >
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-gray-700" />
                    <h4 className="font-medium text-gray-900 text-sm">AI Assessment Generation</h4>
                  </div>
                  {isAIGenerationExpanded ? (
                    <ChevronUp className="w-5 h-5 text-gray-600" />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-gray-600" />
                  )}
                </div>
                {isAIGenerationExpanded && (
                  <div className="text-xs text-gray-600 space-y-2 mt-3">
                    <p>• <strong>Unique Question Sets:</strong> Each candidate receives freshly generated questions for fairness</p>
                    <p>• LLM will analyze the JD and generate questions dynamically per candidate</p>
                    <p>• Question difficulty adjusted based on experience level</p>
                    <p>• Number of questions and time allocation calculated automatically</p>
                    <p>• Topics you provide will guide the question generation process</p>
                  </div>
                )}
              </div>

              {/* Assessment Scoring Rules */}
              <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4">
                <div
                  className="flex items-center justify-between cursor-pointer"
                  onClick={() => setIsScoringRulesExpanded(!isScoringRulesExpanded)}
                >
                  <div className="flex items-center gap-2">
                    <BarChart className="w-5 h-5 text-gray-700" />
                    <h4 className="font-medium text-gray-900 text-sm">Assessment Scoring Rules</h4>
                  </div>
                  {isScoringRulesExpanded ? (
                    <ChevronUp className="w-5 h-5 text-gray-600" />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-gray-600" />
                  )}
                </div>
                {isScoringRulesExpanded && (
                  <>
                    <p className="text-xs text-gray-500 mb-3 mt-3">Understanding how candidates are evaluated for PASS/FAIL determination</p>

                {/* HR Section */}
                <div className="mb-3 pb-3 border-b border-gray-100">
                  <div className="flex items-center gap-2 mb-1">
                    <Users className="w-4 h-4 text-gray-600" />
                    <span className="text-xs font-medium text-gray-900">HR Section</span>
                  </div>
                  <div className="text-xs text-gray-600 ml-6 space-y-0.5">
                    <p>• Responses recorded</p>
                    <p>• Displayed in reports</p>
                  </div>
                  <div className="ml-6 mt-1 px-2 py-1 bg-gray-100 rounded text-xs text-gray-600">
                    <strong>NOT part of PASS/FAIL</strong>
                  </div>
                </div>

                {/* Technical Section */}
                <div className="mb-3 pb-3 border-b border-gray-100">
                  <div className="flex items-center gap-2 mb-1">
                    <Brain className="w-4 h-4 text-gray-600" />
                    <span className="text-xs font-medium text-gray-900">Technical Section</span>
                  </div>
                  <div className="text-xs text-gray-600 ml-6 space-y-0.5">
                    <p>• 0-10 rating per question</p>
                    <p>• Min passing score: 7/10</p>
                  </div>
                  <div className="ml-6 mt-1 px-2 py-1 bg-green-100 rounded text-xs text-green-700">
                    <strong>Counts toward PASS/FAIL</strong>
                  </div>
                </div>

                {/* Coding Section */}
                <div className="mb-3 pb-3 border-b border-gray-100">
                  <div className="flex items-center gap-2 mb-1">
                    <Code className="w-4 h-4 text-gray-600" />
                    <span className="text-xs font-medium text-gray-900">Coding Section</span>
                  </div>
                  <div className="text-xs text-gray-600 ml-6 space-y-0.5">
                    <p>• 0-10 rating per question</p>
                    <p>• Min passing score: 7/10</p>
                  </div>
                  <div className="ml-6 mt-1 px-2 py-1 bg-green-100 rounded text-xs text-green-700">
                    <strong>Counts toward PASS/FAIL</strong>
                  </div>
                </div>

                {/* Pass/Fail Logic */}
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <CheckCircle2 className="w-4 h-4 text-gray-600" />
                    <span className="text-xs font-medium text-gray-900">Pass/Fail Logic (Technical & Coding Only)</span>
                  </div>
                  <div className="text-xs text-gray-600 ml-6 space-y-1">
                    <p><strong>For each section (Technical/Coding):</strong></p>
                    <p>• At least 70% of questions must score ≥7, <strong>OR</strong></p>
                    <p>• Overall section average must be ≥7</p>
                  </div>
                  <div className="mt-2 ml-6 text-xs text-gray-500">
                    <p><strong>Example:</strong> If 10 Technical questions exist:</p>
                    <p>✅ Pass: 7+ questions score ≥7</p>
                    <p>✅ Pass: Average score ≥7.0</p>
                    <p>❌ Fail: Only 6 questions score ≥7 AND average &lt;7</p>
                  </div>
                </div>
                  </>
                )}
              </div>

              {/* Summary */}
              <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4">
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <div className="text-xs text-gray-500 mb-1">Total Duration</div>
                    <div className="text-xl font-semibold text-gray-900">{duration} min</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 mb-1">Sections</div>
                    <div className="text-xl font-semibold text-gray-900">{enabledSectionsCount}</div>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-2">
                  <button
                    onClick={() => handleGenerateAssessment(true)}
                    disabled={!isPercentageValid || isGenerating}
                    className="flex-1 px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors text-sm disabled:bg-gray-100 disabled:cursor-not-allowed"
                  >
                    {isGenerating ? 'Saving...' : 'Save as Draft'}
                  </button>
                  <button
                    onClick={() => handleGenerateAssessment(false)}
                    disabled={!isPercentageValid || isGenerating}
                    className="flex-1 px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center justify-center gap-1.5 text-sm"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    {isGenerating ? 'Publishing...' : 'Publish Assessment'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Coding Confirmation Popup */}
        {showCodingConfirm && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl max-w-md w-full">
              {/* Header */}
              <div className={`${codingPopupMode === 'disable' ? 'bg-red-50 border-b border-red-200' : 'bg-blue-50 border-b border-blue-200'} px-6 py-4 rounded-t-xl`}>
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 ${codingPopupMode === 'disable' ? 'bg-red-100' : 'bg-blue-100'} rounded-lg flex items-center justify-center`}>
                    <Code className={`w-5 h-5 ${codingPopupMode === 'disable' ? 'text-red-600' : 'text-blue-600'}`} />
                  </div>
                  <div>
                    <h3 className="font-medium text-gray-900">
                      {codingPopupMode === 'disable'
                        ? 'Disable Coding Round?'
                        : 'Enable Coding Round'}
                    </h3>
                    <p className={`text-sm ${codingPopupMode === 'disable' ? 'text-red-700' : 'text-blue-700'}`}>
                      {codingPopupMode === 'disable'
                        ? 'This will remove the coding assessment'
                        : 'Select programming languages for the assessment'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Content */}
              <div className="p-6">
                {codingPopupMode === 'disable' ? (
                  <>
                    <p className="text-gray-600 mb-4">
                      Are you sure you want to disable the coding round? The following languages will be removed:
                    </p>
                    <div className="flex flex-wrap gap-2 mb-4">
                      {selectedCodingLanguages.map(lang => (
                        <span key={lang} className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-full text-sm">
                          {lang}
                        </span>
                      ))}
                    </div>
                  </>
                ) : (
                  <>
                    <p className="text-gray-600 mb-4">
                      Please select at least one programming language for the coding assessment.
                    </p>
                    {/* Language Selection */}
                    <div className="mb-4">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Programming Languages <span className="text-red-500">*</span>
                      </label>
                      <div className="border border-gray-200 rounded-lg p-3 max-h-40 overflow-y-auto">
                        <div className="flex flex-wrap gap-2">
                          {programmingLanguages.map(lang => (
                            <button
                              key={lang}
                              onClick={() => toggleLanguageSelection(lang)}
                              className={`px-3 py-1.5 rounded-full text-sm transition-colors ${
                                selectedCodingLanguages.includes(lang)
                                  ? 'bg-gray-800 text-white'
                                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                              }`}
                            >
                              {lang}
                            </button>
                          ))}
                        </div>
                      </div>
                      {selectedCodingLanguages.length > 0 && (
                        <p className="text-xs text-gray-500 mt-2">
                          Selected: {selectedCodingLanguages.join(', ')}
                        </p>
                      )}
                    </div>
                  </>
                )}
              </div>

              {/* Actions */}
              <div className="bg-gray-50 px-6 py-4 rounded-b-xl flex gap-3">
                <button
                  onClick={handleCancelCodingAction}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmCodingAction}
                  disabled={codingPopupMode === 'enable' && selectedCodingLanguages.length === 0}
                  className={`flex-1 px-4 py-2 rounded-lg transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed ${
                    codingPopupMode === 'disable'
                      ? 'bg-red-600 text-white hover:bg-red-700'
                      : 'bg-gray-800 text-white hover:bg-gray-900'
                  }`}
                >
                  {codingPopupMode === 'disable' ? 'Yes, Disable' : 'Enable Coding'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Minimum Round Required Popup */}
        {showMinRoundPopup && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full">
              {/* Header */}
              <div className="bg-amber-50 border-b border-amber-200 px-6 py-4 rounded-t-xl">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center">
                    <AlertCircle className="w-5 h-5 text-amber-600" />
                  </div>
                  <div>
                    <h3 className="font-medium text-gray-900">Cannot Disable Round</h3>
                    <p className="text-sm text-amber-700">Minimum requirement not met</p>
                  </div>
                </div>
              </div>

              {/* Content */}
              <div className="p-6">
                <p className="text-gray-600">
                  At least one assessment round must be enabled. Please enable another round before disabling this one.
                </p>
              </div>

              {/* Actions */}
              <div className="bg-gray-50 px-6 py-4 rounded-b-xl">
                <button
                  onClick={() => setShowMinRoundPopup(false)}
                  className="w-full px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-colors"
                >
                  Got it
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Step 3: Preview Generated Assessment
  if (step === 'preview') {
    if (isGenerating) {
      return (
        <div className="flex-1 flex items-center justify-center bg-gray-50">
          <div className="text-center">
            <div className="w-16 h-16 border-4 border-gray-800 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <h3 className="text-gray-900 mb-2">Saving Assessment Definition...</h3>
            <p className="text-gray-600">Configuring your assessment parameters</p>
          </div>
        </div>
      );
    }

    return (
      <div className="flex-1 p-8 overflow-y-auto bg-gray-50">
        <div className="w-full">
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-2">
              <CheckCircle2 className="w-8 h-8 text-green-600" />
              <h1 className="text-gray-900">Assessment Definition Saved Successfully</h1>
            </div>
            <p className="text-gray-600">
              Your assessment configuration has been saved. Questions will be generated when candidates are assigned.
            </p>
          </div>

          {/* Unique Question Generation Highlight */}
          <div className="bg-gradient-to-r from-green-50 to-emerald-50 border-2 border-green-300 rounded-xl p-6 mb-6">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-green-600 rounded-lg">
                <Sparkles className="w-6 h-6 text-white" />
              </div>
              <div className="flex-1">
                <h3 className="text-green-900 mb-2">🎯 Unique Question Generation Enabled</h3>
                <p className="text-sm text-green-800 mb-3">
                  <strong>Each candidate will receive a completely unique set of questions</strong> when they take this assessment. 
                  This ensures fairness, prevents question sharing, and maintains assessment integrity.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm text-green-800">
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
                    <span>Fresh questions generated per candidate</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
                    <span>Same difficulty & topic coverage</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
                    <span>Prevents answer memorization</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
                    <span>Fair & standardized evaluation</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Assessment Summary */}
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6 mb-6">
            <div className="flex items-center gap-2 mb-4">
              <h2 className="text-gray-900">{generatedAssessment?.title}</h2>
              <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs font-semibold flex-shrink-0">
                V{generatedAssessment?.version || 1}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-4 mb-6">
              <div className="p-4 bg-gray-50 rounded-lg">
                <div className="text-sm text-gray-800 mb-1">Total Duration</div>
                <div className="text-2xl text-gray-900">{duration} min</div>
              </div>
              <div className="p-4 bg-green-50 rounded-lg">
                <div className="text-sm text-green-600 mb-1">Sections</div>
                <div className="text-2xl text-gray-900">{generatedAssessment?.sections.length}</div>
              </div>
              <div className="p-4 bg-yellow-50 rounded-lg">
                <div className="text-sm text-yellow-600 mb-1">Difficulty</div>
                <div className="text-2xl text-gray-900">{selectedJob?.experience}</div>
              </div>
            </div>
          </div>

          {/* Scoring Rules Summary */}
          <div className="bg-gradient-to-r from-gray-50 to-pink-50 border-2 border-gray-300 rounded-lg p-6 mb-6">
            <div className="flex items-start gap-3 mb-4">
              <BarChart className="w-6 h-6 text-gray-800 flex-shrink-0" />
              <div>
                <h3 className="text-gray-800 mb-2">🎯 Evaluation & Scoring Logic</h3>
                <p className="text-sm text-gray-700">
                  How candidates will be evaluated when taking this assessment
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* HR Section Info */}
              <div className="bg-white rounded-lg p-4 border border-gray-200">
                <div className="flex items-center gap-2 mb-2">
                  <Users className="w-4 h-4 text-gray-800" />
                  <h4 className="text-sm text-gray-900">HR Section</h4>
                  <span className="ml-auto px-2 py-0.5 bg-gray-100 text-gray-900 rounded text-xs">
                    Not Scored
                  </span>
                </div>
                <p className="text-xs text-gray-600">
                  Responses recorded and displayed in reports for review, but <strong>NOT included in PASS/FAIL decision</strong>
                </p>
              </div>

              {/* Technical + Coding Info */}
              <div className="bg-white rounded-lg p-4 border border-green-300">
                <div className="flex items-center gap-2 mb-2">
                  <Brain className="w-4 h-4 text-gray-800" />
                  <Code className="w-4 h-4 text-green-600" />
                  <h4 className="text-sm text-gray-900">Technical + Coding</h4>
                  <span className="ml-auto px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs">
                    Scored
                  </span>
                </div>
                <p className="text-xs text-gray-600 mb-2">
                  Each question scored 0-10. <strong>Pass requires:</strong>
                </p>
                <div className="text-xs text-gray-700 space-y-1">
                  <p>• ≥70% of questions score ≥7, <strong>OR</strong></p>
                  <p>• Section average ≥7.0</p>
                </div>
              </div>
            </div>

            <div className="mt-4 bg-green-100 border border-green-300 rounded-lg p-3">
              <p className="text-sm text-green-900 text-center">
                <strong>Final Result:</strong> PASS/FAIL determined by Technical + Coding sections only
              </p>
            </div>
          </div>

          {/* Section Breakdown */}
          <div className="space-y-4 mb-6">
            {generatedAssessment?.sections.map((section: any, idx: number) => (
              <div key={idx} className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    {section.name === 'HR' && <Users className="w-5 h-5 text-gray-800" />}
                    {section.name === 'Technical' && <Brain className="w-5 h-5 text-gray-800" />}
                    {section.name === 'Coding' && <Code className="w-5 h-5 text-green-600" />}
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-gray-900">{section.name} Section</h3>
                        {section.name === 'HR' ? (
                          <span className="px-2 py-0.5 bg-gray-100 text-gray-900 rounded text-xs">
                            Informational Only
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs">
                            Scored (0-10 scale)
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <div className="text-2xl text-gray-800">{section.percentage}%</div>
                    {section.name !== 'HR' && (
                      <span className="text-xs text-green-600">✅ Counts to PASS/FAIL</span>
                    )}
                  </div>
                </div>

                <div className="mb-4">
                  <div className="text-sm text-gray-700 mb-2">Topics Covered:</div>
                  <div className="flex flex-wrap gap-2">
                    {section.topics.map((topic: string, tidx: number) => (
                      <span key={tidx} className="px-3 py-1 bg-gray-100 text-gray-700 rounded-lg text-sm">
                        {topic}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Note: Questions NOT generated yet */}
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                  <div className="text-sm text-gray-800">
                    ℹ️ <strong>Questions will be generated dynamically</strong> when candidates are assigned to this assessment based on the configured topics and difficulty level.
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Actions */}
          <div className="flex justify-between items-center">
            <div className="text-sm text-gray-600">
              Status: <span className={`font-medium ${generatedAssessment?.status === 'Active' ? 'text-green-600' : 'text-yellow-600'}`}>
                {generatedAssessment?.status === 'Active' ? 'Published' : 'Draft'}
              </span>
            </div>
            <button
              onClick={() => {
                // Just notify parent and go back - assessment is already saved
                onCreateAssessment(generatedAssessment);
              }}
              className="px-6 py-2.5 bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-colors flex items-center gap-2"
            >
              <CheckCircle2 className="w-5 h-5" />
              Done - Go to Assessments
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}