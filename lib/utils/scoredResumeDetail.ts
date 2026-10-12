/**
 * One `/jds/{id}/scored-resumes` item, in the shape `CandidateScoringDetailPage`
 * reads — the same mapping Job Details uses for its Scored Resumes tab
 * (JobDetailView's fetchScoredResumes + toCandidateDetail), so a scorecard
 * opened from AI Talent Match renders exactly as one opened there.
 */
export function toScoredResumeDetail(item: any, jobTitle: string): any {
  let matchStatus = 'No Match';
  if (item.match_status === 'exact_match' || item.match_status === 'excellent') {
    matchStatus = 'Exact Match';
  } else if (item.match_status === 'partial_match' || item.match_status === 'partial') {
    matchStatus = 'Partial Match';
  }
  const matchedSkills: string[] = item.matched_skills || item.matchedSkills || item.skills || [];
  const missingSkills: string[] = item.missing_skills || item.missingSkills || item.gaps || [];

  return {
    id: item.id,
    resume_id: item.resume_id || '',
    resumeId: item.resume_id || '',
    candidateName: item.candidate_name || 'Unknown',
    email: item.candidate_email || '',
    phone: item.phone || '',
    matchStatus,
    scorePercentage: Number((item.overall_score || 0).toFixed(1)),
    overallRating10: item.overall_rating_10,
    essentialRating10: item.essential_rating_10,
    nonEssentialRating10: item.non_essential_rating_10,
    ratingSummaryText: item.rating_summary_text,
    scoredDate: item.created_at || new Date().toISOString(),
    scoredBy: item.scored_by_name || item.scored_by || 'System',
    batchId: item.batch_id || item.scoring_batch_id || undefined,
    source: item.source || 'database',
    experience: item.experience_years ? `${item.experience_years} years` : undefined,
    education: item.education,
    certifications: item.certifications || [],
    version: item.resume_version || 1,
    resumeVersion: item.resume_version || 1,
    tenantName: item.tenant_name || item.tenantName,
    tenantId: item.tenant_id || item.tenantId,
    aiSummary: item.ai_summary,
    strengths: item.strengths || [],
    gaps: item.gaps || [],
    title: item.current_title,
    jobTitle,
    // The JD (version) this score is against — the scored-resumes table and
    // the scorecard both read it.
    jdId: item.jd_id || item.job_description_id,
    currentCompany: item.current_company,
    location: item.location,
    skills: item.skills || [],
    matchedSkills,
    missingSkills,
    scoreBreakdown: item.score_breakdown || [],
    criteriaScores: item.criteria_scores || {},
    essentialScore: item.essential_score,
    nonEssentialScore: item.non_essential_score,
    experienceDetails: item.experience_details || item.experience || [],
    educationDetails: item.education_details || item.education || [],
    technicalSkills: item.technical_skills || item.skills || [],
    softSkills: item.soft_skills || [],
    languages: item.languages || [],
    professionalSummary: item.professional_summary || item.ai_summary || '',
  };
}
