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
    template: `# Write your code here

def solve():
    # Read input
    n = int(input())

    # Your logic here
    result = n

    # Print output
    print(result)

if __name__ == "__main__":
    solve()
`,
  },

  javascript: {
    id: 'javascript',
    name: 'JavaScript (Node.js)',
    monacoLanguage: 'javascript',
    extension: '.js',
    compilerName: 'js',
    template: `// Write your code here

function solve(input) {
    const lines = input.trim().split('\\n');
    const n = parseInt(lines[0]);

    // Your logic here
    const result = n;

    console.log(result);
}

// Read input from stdin
process.stdin.resume();
process.stdin.setEncoding('utf8');
let inputData = '';
process.stdin.on('data', chunk => inputData += chunk);
process.stdin.on('end', () => solve(inputData));
`,
  },

  typescript: {
    id: 'typescript',
    name: 'TypeScript',
    monacoLanguage: 'typescript',
    extension: '.ts',
    compilerName: 'typescript',
    template: `// Write your code here

function solve(input: string): void {
    const lines = input.trim().split('\\n');
    const n: number = parseInt(lines[0]);

    // Your logic here
    const result: number = n;

    console.log(result);
}

// Read input from stdin
process.stdin.resume();
process.stdin.setEncoding('utf8');
let inputData = '';
process.stdin.on('data', (chunk: string) => inputData += chunk);
process.stdin.on('end', () => solve(inputData));
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
        Scanner scanner = new Scanner(System.in);

        // Read input
        int n = scanner.nextInt();

        // Your logic here
        int result = n;

        // Print output
        System.out.println(result);

        scanner.close();
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
#include <vector>
#include <string>
#include <algorithm>
using namespace std;

int main() {
    ios_base::sync_with_stdio(false);
    cin.tie(NULL);

    // Read input
    int n;
    cin >> n;

    // Your logic here
    int result = n;

    // Print output
    cout << result << endl;

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
#include <stdlib.h>
#include <string.h>

int main() {
    // Read input
    int n;
    scanf("%d", &n);

    // Your logic here
    int result = n;

    // Print output
    printf("%d\\n", result);

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
using System.Linq;
using System.Collections.Generic;

class Program {
    static void Main() {
        // Read input
        int n = int.Parse(Console.ReadLine());

        // Your logic here
        int result = n;

        // Print output
        Console.WriteLine(result);
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

import (
    "bufio"
    "fmt"
    "os"
)

func main() {
    reader := bufio.NewReader(os.Stdin)

    // Read input
    var n int
    fmt.Fscan(reader, &n)

    // Your logic here
    result := n

    // Print output
    fmt.Println(result)
}
`,
  },

  rust: {
    id: 'rust',
    name: 'Rust',
    monacoLanguage: 'rust',
    extension: '.rs',
    compilerName: 'rust',
    template: `use std::io::{self, BufRead};

fn main() {
    let stdin = io::stdin();
    let mut lines = stdin.lock().lines();

    // Read input
    let n: i32 = lines.next().unwrap().unwrap().trim().parse().unwrap();

    // Your logic here
    let result = n;

    // Print output
    println!("{}", result);
}
`,
  },

  ruby: {
    id: 'ruby',
    name: 'Ruby',
    monacoLanguage: 'ruby',
    extension: '.rb',
    compilerName: 'ruby',
    template: `# Write your code here

# Read input
n = gets.chomp.to_i

# Your logic here
result = n

# Print output
puts result
`,
  },

  php: {
    id: 'php',
    name: 'PHP',
    monacoLanguage: 'php',
    extension: '.php',
    compilerName: 'php',
    template: `<?php
// Write your code here

// Read input
$n = intval(trim(fgets(STDIN)));

// Your logic here
$result = $n;

// Print output
echo $result . PHP_EOL;
?>
`,
  },

  kotlin: {
    id: 'kotlin',
    name: 'Kotlin',
    monacoLanguage: 'kotlin',
    extension: '.kt',
    compilerName: 'kotlin',
    template: `import java.util.*

fun main() {
    val scanner = Scanner(System.in)

    // Read input
    val n = scanner.nextInt()

    // Your logic here
    val result = n

    // Print output
    println(result)
}
`,
  },

  swift: {
    id: 'swift',
    name: 'Swift',
    monacoLanguage: 'swift',
    extension: '.swift',
    compilerName: 'swift',
    template: `import Foundation

// Read input
let n = Int(readLine()!)!

// Your logic here
let result = n

// Print output
print(result)
`,
  },

  sql: {
    id: 'sql',
    name: 'SQL',
    monacoLanguage: 'sql',
    extension: '.sql',
    compilerName: 'sql',
    template: `-- Write your SQL query here

SELECT *
FROM table_name
WHERE condition
ORDER BY column_name;
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
