/**
 * Utility functions for assessment display
 */

export interface ParsedAssessmentTitle {
  cleanTitle: string;  // Title without version text
  version: number | null;  // Extracted version number
  hasVersion: boolean;  // Whether version was found
}

/**
 * Parse assessment title to extract version number and clean title
 * Example: "Java Developer - Assessment - Version 3" -> { cleanTitle: "Java Developer - Assessment", version: 3 }
 */
export function parseAssessmentTitle(title: string): ParsedAssessmentTitle {
  // Match pattern: " - Version X" at the end
  const versionPattern = / - Version (\d+)$/;
  const match = title.match(versionPattern);

  if (match) {
    return {
      cleanTitle: title.replace(versionPattern, ''),
      version: parseInt(match[1], 10),
      hasVersion: true,
    };
  }

  return {
    cleanTitle: title,
    version: null,
    hasVersion: false,
  };
}

/**
 * Get version badge text (e.g., "V1", "V2")
 */
export function getVersionBadge(version: number | null): string | null {
  return version ? `V${version}` : null;
}

/**
 * Remove version text from assessment title
 * Example: "Java Developer - Assessment - Version 3" -> "Java Developer - Assessment"
 */
export function stripVersionFromTitle(title: string): string {
  return parseAssessmentTitle(title).cleanTitle;
}
