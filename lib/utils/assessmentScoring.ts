/**
 * Assessment Scoring Rules (Critical Evaluation Logic)
 * 
 * HR Section:
 * - Recorded and displayed in reports
 * - NOT part of final PASS/FAIL decision
 * 
 * Technical & Coding Sections:
 * - Each question evaluated on 0-10 rating scale
 * - Minimum passing score per question = 7
 * - Pass logic: At least 70% of questions must score ≥7 OR overall average ≥7
 * - Final PASS/FAIL uses only Technical + Coding scores
 */

export interface QuestionScore {
  questionId: string;
  question: string;
  score: number; // 0-10 scale
  maxScore: 10;
  section: 'HR' | 'Technical' | 'Coding';
  answer: string;
  feedback?: string;
}

export interface SectionScoreResult {
  sectionName: 'HR' | 'Technical' | 'Coding';
  questions: QuestionScore[];
  totalQuestions: number;
  questionsPassingThreshold: number; // Number of questions with score ≥7
  averageScore: number;
  isPassing: boolean; // Only for Technical & Coding
  isEvaluated: boolean; // HR is recorded but not evaluated for PASS/FAIL
}

export interface FinalAssessmentResult {
  candidateId: string;
  candidateName: string;
  assessmentId: string;
  hrSection: SectionScoreResult;
  technicalSection: SectionScoreResult | null;
  codingSection: SectionScoreResult | null;
  overallStatus: 'PASS' | 'FAIL';
  technicalPassed: boolean;
  codingPassed: boolean;
  totalEvaluatedSections: number;
  passedSections: number;
  evaluationDate: string;
}

/**
 * Evaluates a single section (Technical or Coding)
 * Pass criteria:
 * - At least 70% of questions must score ≥7, OR
 * - Overall average must be ≥7
 */
export function evaluateSection(questions: QuestionScore[]): SectionScoreResult {
  const sectionName = questions[0]?.section || 'Technical';
  const totalQuestions = questions.length;
  
  if (totalQuestions === 0) {
    return {
      sectionName,
      questions: [],
      totalQuestions: 0,
      questionsPassingThreshold: 0,
      averageScore: 0,
      isPassing: false,
      isEvaluated: sectionName !== 'HR',
    };
  }

  // Count questions with score ≥7
  const questionsPassingThreshold = questions.filter(q => q.score >= 7).length;
  
  // Calculate average score
  const totalScore = questions.reduce((sum, q) => sum + q.score, 0);
  const averageScore = totalScore / totalQuestions;
  
  // Determine if section passes
  // Pass if: At least 70% of questions score ≥7 OR average ≥7
  const percentagePassing = (questionsPassingThreshold / totalQuestions) * 100;
  const isPassing = percentagePassing >= 70 || averageScore >= 7;
  
  // HR section is not evaluated for PASS/FAIL
  const isEvaluated = sectionName !== 'HR';

  return {
    sectionName,
    questions,
    totalQuestions,
    questionsPassingThreshold,
    averageScore: Math.round(averageScore * 10) / 10, // Round to 1 decimal
    isPassing: isEvaluated ? isPassing : false,
    isEvaluated,
  };
}

/**
 * Calculate final assessment result
 * PASS/FAIL is determined ONLY by Technical + Coding sections
 * HR section is excluded from final decision
 */
export function calculateFinalResult(
  candidateId: string,
  candidateName: string,
  assessmentId: string,
  hrQuestions: QuestionScore[],
  technicalQuestions: QuestionScore[],
  codingQuestions: QuestionScore[]
): FinalAssessmentResult {
  // Evaluate each section
  const hrSection = evaluateSection(hrQuestions);
  const technicalSection = technicalQuestions.length > 0 ? evaluateSection(technicalQuestions) : null;
  const codingSection = codingQuestions.length > 0 ? evaluateSection(codingQuestions) : null;

  // Determine PASS/FAIL based ONLY on Technical + Coding
  const technicalPassed = technicalSection ? technicalSection.isPassing : true;
  const codingPassed = codingSection ? codingSection.isPassing : true;

  // Count evaluated sections (exclude HR)
  let totalEvaluatedSections = 0;
  let passedSections = 0;

  if (technicalSection) {
    totalEvaluatedSections++;
    if (technicalPassed) passedSections++;
  }

  if (codingSection) {
    totalEvaluatedSections++;
    if (codingPassed) passedSections++;
  }

  // Overall status: PASS if ALL evaluated sections (Technical + Coding) pass
  const overallStatus: 'PASS' | 'FAIL' = 
    totalEvaluatedSections > 0 && passedSections === totalEvaluatedSections ? 'PASS' : 'FAIL';

  return {
    candidateId,
    candidateName,
    assessmentId,
    hrSection,
    technicalSection,
    codingSection,
    overallStatus,
    technicalPassed,
    codingPassed,
    totalEvaluatedSections,
    passedSections,
    evaluationDate: new Date().toISOString(),
  };
}

/**
 * Get detailed scoring breakdown for display
 */
export function getScoringBreakdown(result: FinalAssessmentResult): string {
  const lines: string[] = [];
  
  lines.push('=== ASSESSMENT SCORING BREAKDOWN ===\n');
  
  // HR Section (Recorded but not evaluated)
  lines.push('HR Section:');
  lines.push(`  Status: RECORDED (Not evaluated for PASS/FAIL)`);
  lines.push(`  Questions: ${result.hrSection.totalQuestions}`);
  lines.push(`  Average Score: ${result.hrSection.averageScore}/10`);
  lines.push('');
  
  // Technical Section
  if (result.technicalSection) {
    lines.push('Technical Section:');
    lines.push(`  Total Questions: ${result.technicalSection.totalQuestions}`);
    lines.push(`  Questions Scoring ≥7: ${result.technicalSection.questionsPassingThreshold}/${result.technicalSection.totalQuestions}`);
    lines.push(`  Percentage Passing: ${Math.round((result.technicalSection.questionsPassingThreshold / result.technicalSection.totalQuestions) * 100)}%`);
    lines.push(`  Average Score: ${result.technicalSection.averageScore}/10`);
    lines.push(`  Section Result: ${result.technicalPassed ? '✓ PASS' : '✗ FAIL'}`);
    lines.push(`  Pass Criteria: ${result.technicalSection.questionsPassingThreshold}/${result.technicalSection.totalQuestions} questions ≥7 (70% required) OR average ≥7`);
    lines.push('');
  }
  
  // Coding Section
  if (result.codingSection) {
    lines.push('Coding Section:');
    lines.push(`  Total Questions: ${result.codingSection.totalQuestions}`);
    lines.push(`  Questions Scoring ≥7: ${result.codingSection.questionsPassingThreshold}/${result.codingSection.totalQuestions}`);
    lines.push(`  Percentage Passing: ${Math.round((result.codingSection.questionsPassingThreshold / result.codingSection.totalQuestions) * 100)}%`);
    lines.push(`  Average Score: ${result.codingSection.averageScore}/10`);
    lines.push(`  Section Result: ${result.codingPassed ? '✓ PASS' : '✗ FAIL'}`);
    lines.push(`  Pass Criteria: ${result.codingSection.questionsPassingThreshold}/${result.codingSection.totalQuestions} questions ≥7 (70% required) OR average ≥7`);
    lines.push('');
  }
  
  // Final Result
  lines.push('=== FINAL RESULT ===');
  lines.push(`Overall Status: ${result.overallStatus}`);
  lines.push(`Evaluated Sections: ${result.passedSections}/${result.totalEvaluatedSections} passed`);
  lines.push(`Note: HR section is NOT included in final PASS/FAIL decision`);
  
  return lines.join('\n');
}

/**
 * Example usage and test cases
 */
export function runScoringExamples() {
  console.log('=== Example 1: Technical Section with 10 questions ===\n');
  
  const technicalQuestions: QuestionScore[] = [
    { questionId: '1', question: 'Q1', score: 8, maxScore: 10, section: 'Technical', answer: 'Answer 1' },
    { questionId: '2', question: 'Q2', score: 9, maxScore: 10, section: 'Technical', answer: 'Answer 2' },
    { questionId: '3', question: 'Q3', score: 7, maxScore: 10, section: 'Technical', answer: 'Answer 3' },
    { questionId: '4', question: 'Q4', score: 7, maxScore: 10, section: 'Technical', answer: 'Answer 4' },
    { questionId: '5', question: 'Q5', score: 8, maxScore: 10, section: 'Technical', answer: 'Answer 5' },
    { questionId: '6', question: 'Q6', score: 6, maxScore: 10, section: 'Technical', answer: 'Answer 6' },
    { questionId: '7', question: 'Q7', score: 7, maxScore: 10, section: 'Technical', answer: 'Answer 7' },
    { questionId: '8', question: 'Q8', score: 9, maxScore: 10, section: 'Technical', answer: 'Answer 8' },
    { questionId: '9', question: 'Q9', score: 8, maxScore: 10, section: 'Technical', answer: 'Answer 9' },
    { questionId: '10', question: 'Q10', score: 7, maxScore: 10, section: 'Technical', answer: 'Answer 10' },
  ];
  
  const hrQuestions: QuestionScore[] = [
    { questionId: 'h1', question: 'HR Q1', score: 6, maxScore: 10, section: 'HR', answer: 'HR Answer 1' },
    { questionId: 'h2', question: 'HR Q2', score: 5, maxScore: 10, section: 'HR', answer: 'HR Answer 2' },
  ];
  
  const codingQuestions: QuestionScore[] = [
    { questionId: 'c1', question: 'Code Q1', score: 9, maxScore: 10, section: 'Coding', answer: 'Code Answer 1' },
    { questionId: 'c2', question: 'Code Q2', score: 8, maxScore: 10, section: 'Coding', answer: 'Code Answer 2' },
  ];
  
  const result = calculateFinalResult(
    'candidate-123',
    'John Doe',
    'assessment-456',
    hrQuestions,
    technicalQuestions,
    codingQuestions
  );
  
  console.log(getScoringBreakdown(result));
  console.log('\n=== Result Object ===');
  console.log(JSON.stringify(result, null, 2));
}
