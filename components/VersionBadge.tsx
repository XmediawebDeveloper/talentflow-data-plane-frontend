import { parseAssessmentTitle, getVersionBadge } from '@/lib/utils/assessmentUtils';

interface VersionBadgeProps {
  title?: string;
  version?: number;  // Accept version directly from API
  size?: 'sm' | 'md' | 'lg';
  variant?: 'primary' | 'secondary' | 'success';
}

export default function VersionBadge({ title, version: versionProp, size = 'sm', variant = 'primary' }: VersionBadgeProps) {
  // Prefer version prop over parsing from title
  let version = versionProp;
  let hasVersion = !!versionProp;

  // Fallback to parsing from title if version not provided
  if (!hasVersion && title) {
    const parsed = parseAssessmentTitle(title);
    version = parsed.version || undefined;
    hasVersion = parsed.hasVersion;
  }

  if (!hasVersion || !version) {
    return null;
  }

  const versionText = getVersionBadge(version);

  // Size classes
  const sizeClasses = {
    sm: 'text-xs px-2 py-0.5',
    md: 'text-sm px-2.5 py-1',
    lg: 'text-base px-3 py-1.5',
  };

  // Variant classes
  const variantClasses = {
    primary: 'bg-blue-100 text-blue-700 border-blue-300',
    secondary: 'bg-gray-100 text-gray-700 border-gray-300',
    success: 'bg-emerald-100 text-emerald-700 border-emerald-300',
  };

  return (
    <span
      className={`inline-flex items-center font-semibold rounded-md border ${sizeClasses[size]} ${variantClasses[variant]}`}
      title={`Version ${version}`}
    >
      {versionText}
    </span>
  );
}
