/**
 * Multi-language code templates and configurations
 * Provides starter code, Monaco editor modes, and language metadata
 */

export interface LanguageConfig {
  id: string;
  name: string;
  monacoLanguage: string;
  extension: string;
  template: string;
  compilerName: string; // Name used by the compiler API
}

export const LANGUAGE_CONFIGS: Record<string, LanguageConfig> = {
  python: {
    id: 'python',
    name: 'Python 3',
    monacoLanguage: 'python',
    extension: '.py',
    compilerName: 'python3',
    template: `# Write your solution here

`,
  },

  javascript: {
    id: 'javascript',
    name: 'JavaScript (Node.js)',
    monacoLanguage: 'javascript',
    extension: '.js',
    compilerName: 'js',
    template: `// Write your solution here

`,
  },

  typescript: {
    id: 'typescript',
    name: 'TypeScript',
    monacoLanguage: 'typescript',
    extension: '.ts',
    compilerName: 'typescript',
    template: `// Write your solution here

`,
  },

  java: {
    id: 'java',
    name: 'Java',
    monacoLanguage: 'java',
    extension: '.java',
    compilerName: 'java',
    template: `import java.util.*;

public class Main {
    public static void main(String[] args) {
        // Write your solution here

    }
}
`,
  },

  cpp: {
    id: 'cpp',
    name: 'C++',
    monacoLanguage: 'cpp',
    extension: '.cpp',
    compilerName: 'cpp',
    template: `#include <iostream>
using namespace std;

int main() {
    // Write your solution here

    return 0;
}
`,
  },

  c: {
    id: 'c',
    name: 'C',
    monacoLanguage: 'c',
    extension: '.c',
    compilerName: 'c',
    template: `#include <stdio.h>

int main() {
    // Write your solution here

    return 0;
}
`,
  },

  csharp: {
    id: 'csharp',
    name: 'C#',
    monacoLanguage: 'csharp',
    extension: '.cs',
    compilerName: 'cs',
    template: `using System;

class Program {
    static void Main() {
        // Write your solution here

    }
}
`,
  },

  go: {
    id: 'go',
    name: 'Go',
    monacoLanguage: 'go',
    extension: '.go',
    compilerName: 'go',
    template: `package main

func main() {
    // Write your solution here

}
`,
  },

  rust: {
    id: 'rust',
    name: 'Rust',
    monacoLanguage: 'rust',
    extension: '.rs',
    compilerName: 'rust',
    template: `fn main() {
    // Write your solution here

}
`,
  },

  ruby: {
    id: 'ruby',
    name: 'Ruby',
    monacoLanguage: 'ruby',
    extension: '.rb',
    compilerName: 'ruby',
    template: `# Write your solution here

`,
  },

  php: {
    id: 'php',
    name: 'PHP',
    monacoLanguage: 'php',
    extension: '.php',
    compilerName: 'php',
    template: `<?php
// Write your solution here

?>
`,
  },

  kotlin: {
    id: 'kotlin',
    name: 'Kotlin',
    monacoLanguage: 'kotlin',
    extension: '.kt',
    compilerName: 'kotlin',
    template: `fun main() {
    // Write your solution here

}
`,
  },

  swift: {
    id: 'swift',
    name: 'Swift',
    monacoLanguage: 'swift',
    extension: '.swift',
    compilerName: 'swift',
    template: `// Write your solution here

`,
  },

  sql: {
    id: 'sql',
    name: 'SQL',
    monacoLanguage: 'sql',
    extension: '.sql',
    compilerName: 'sql',
    template: `-- Write your SQL query here

`,
  },
};

// Get all available languages as array
export const AVAILABLE_LANGUAGES = Object.values(LANGUAGE_CONFIGS);

// Get language config by ID
export function getLanguageConfig(languageId: string): LanguageConfig | undefined {
  return LANGUAGE_CONFIGS[languageId.toLowerCase()];
}

// Get language by compiler name
export function getLanguageByCompilerName(compilerName: string): LanguageConfig | undefined {
  return Object.values(LANGUAGE_CONFIGS).find(
    (config) => config.compilerName === compilerName.toLowerCase()
  );
}

// Get Monaco language from language ID
export function getMonacoLanguage(languageId: string): string {
  const config = getLanguageConfig(languageId);
  return config?.monacoLanguage || 'plaintext';
}

// Get template for a language
export function getLanguageTemplate(languageId: string): string {
  const config = getLanguageConfig(languageId);
  return config?.template || '// Write your code here\n';
}

// Detect if code expects input based on language patterns
export function detectsInputRequired(code: string, languageId: string): boolean {
  const patterns: Record<string, RegExp> = {
    python: /input\s*\(|sys\.stdin|raw_input/i,
    javascript: /process\.stdin|readline\(|prompt\(/i,
    typescript: /process\.stdin|readline\(|prompt\(/i,
    java: /Scanner|BufferedReader|System\.in|Console\.read/i,
    cpp: /cin\s*>>|scanf|getline|gets\(/i,
    c: /scanf|getchar|gets|fgets.*stdin/i,
    csharp: /Console\.Read|StreamReader/i,
    go: /fmt\.Scan|bufio\.NewReader|os\.Stdin/i,
    rust: /stdin|read_line/i,
    ruby: /gets|STDIN|ARGF/i,
    php: /fgets.*STDIN|\$_GET|\$_POST|readline/i,
    kotlin: /Scanner|readLine/i,
    swift: /readLine/i,
  };

  const pattern = patterns[languageId.toLowerCase()];
  if (!pattern) return false;

  // Remove comments before checking
  const codeWithoutComments = code
    .replace(/\/\/.*$/gm, '') // Single line comments
    .replace(/\/\*[\s\S]*?\*\//g, '') // Multi-line comments
    .replace(/#.*$/gm, ''); // Python/Ruby comments

  return pattern.test(codeWithoutComments);
}

// Common language aliases mapping
export const LANGUAGE_ALIASES: Record<string, string> = {
  'python3': 'python',
  'py': 'python',
  'js': 'javascript',
  'node': 'javascript',
  'nodejs': 'javascript',
  'ts': 'typescript',
  'c++': 'cpp',
  'c#': 'csharp',
  'dotnet': 'csharp',
  '.net': 'csharp',
  'golang': 'go',
  'rb': 'ruby',
};

// Resolve language alias to standard ID
export function resolveLanguageAlias(language: string): string {
  const normalized = language.toLowerCase().trim();
  return LANGUAGE_ALIASES[normalized] || normalized;
}
