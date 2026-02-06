/**
 * Vector Similarity Utilities
 *
 * Provides cosine similarity computation for comparing JD vectors with resume vectors
 * when AI Talent Match is triggered.
 *
 * Cosine similarity measures the cosine of the angle between two vectors,
 * ranging from -1 (opposite) to 1 (identical), with 0 indicating orthogonality.
 * For embedding vectors, this is typically normalized to 0-1 range.
 */

// Type definitions for vectors and similarity results
export interface Vector {
  values: number[];
  dimension: number;
}

export interface SimilarityResult {
  resumeId: string;
  similarityScore: number;  // Cosine similarity score (0-1)
  rank: number;             // Ranking position (1 = highest similarity)
}

export interface VectorMatchOptions {
  minSimilarity?: number;   // Minimum similarity threshold (default: 0.5)
  maxResults?: number;      // Maximum number of results to return
  sortDescending?: boolean; // Sort by similarity descending (default: true)
}

/**
 * Compute the dot product of two vectors
 * @param a First vector
 * @param b Second vector
 * @returns Dot product scalar value
 */
export function dotProduct(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`Vector dimension mismatch: ${a.length} vs ${b.length}`);
  }

  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += a[i] * b[i];
  }
  return sum;
}

/**
 * Compute the magnitude (L2 norm) of a vector
 * @param v Vector values
 * @returns Magnitude of the vector
 */
export function magnitude(v: number[]): number {
  let sumOfSquares = 0;
  for (let i = 0; i < v.length; i++) {
    sumOfSquares += v[i] * v[i];
  }
  return Math.sqrt(sumOfSquares);
}

/**
 * Normalize a vector to unit length
 * @param v Vector values
 * @returns Normalized vector with magnitude 1
 */
export function normalize(v: number[]): number[] {
  const mag = magnitude(v);
  if (mag === 0) {
    return v.map(() => 0);
  }
  return v.map(val => val / mag);
}

/**
 * Compute cosine similarity between two vectors
 *
 * Cosine similarity = (A · B) / (||A|| * ||B||)
 *
 * @param a First vector (e.g., JD embedding)
 * @param b Second vector (e.g., Resume embedding)
 * @returns Cosine similarity score between -1 and 1
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`Vector dimension mismatch: ${a.length} vs ${b.length}`);
  }

  if (a.length === 0) {
    throw new Error('Cannot compute similarity of empty vectors');
  }

  const dot = dotProduct(a, b);
  const magA = magnitude(a);
  const magB = magnitude(b);

  // Handle zero magnitude vectors
  if (magA === 0 || magB === 0) {
    return 0;
  }

  return dot / (magA * magB);
}

/**
 * Compute cosine similarity and normalize to 0-1 range
 * Maps the raw cosine similarity (-1 to 1) to a 0-1 scale
 *
 * @param a First vector (e.g., JD embedding)
 * @param b Second vector (e.g., Resume embedding)
 * @returns Normalized similarity score between 0 and 1
 */
export function normalizedCosineSimilarity(a: number[], b: number[]): number {
  const similarity = cosineSimilarity(a, b);
  // Map from [-1, 1] to [0, 1]
  return (similarity + 1) / 2;
}

/**
 * Compute similarity between a JD vector and multiple resume vectors
 * This is the main function used when AI Talent Match is triggered
 *
 * @param jdVector Job Description embedding vector
 * @param resumeVectors Array of resume vectors with their IDs
 * @param options Matching options (threshold, max results, sorting)
 * @returns Array of similarity results sorted by score
 */
export function computeJDResumeMatches(
  jdVector: number[],
  resumeVectors: Array<{ resumeId: string; vector: number[] }>,
  options: VectorMatchOptions = {}
): SimilarityResult[] {
  const {
    minSimilarity = 0.5,
    maxResults,
    sortDescending = true
  } = options;

  // Compute similarity for each resume
  const results: SimilarityResult[] = resumeVectors.map(({ resumeId, vector }) => {
    const similarityScore = cosineSimilarity(jdVector, vector);
    return {
      resumeId,
      similarityScore,
      rank: 0 // Will be assigned after sorting
    };
  });

  // Filter by minimum similarity threshold
  const filteredResults = results.filter(r => r.similarityScore >= minSimilarity);

  // Sort by similarity score
  filteredResults.sort((a, b) =>
    sortDescending
      ? b.similarityScore - a.similarityScore
      : a.similarityScore - b.similarityScore
  );

  // Assign ranks (1-based)
  filteredResults.forEach((result, index) => {
    result.rank = index + 1;
  });

  // Limit results if maxResults is specified
  if (maxResults && maxResults > 0) {
    return filteredResults.slice(0, maxResults);
  }

  return filteredResults;
}

/**
 * Batch compute similarities for multiple JD-resume pairs
 * Useful for computing similarity matrix
 *
 * @param jdVectors Array of JD vectors
 * @param resumeVectors Array of resume vectors
 * @returns 2D array where result[i][j] is similarity between jdVectors[i] and resumeVectors[j]
 */
export function computeSimilarityMatrix(
  jdVectors: number[][],
  resumeVectors: number[][]
): number[][] {
  return jdVectors.map(jdVector =>
    resumeVectors.map(resumeVector =>
      cosineSimilarity(jdVector, resumeVector)
    )
  );
}

/**
 * Find top-k most similar resumes for a given JD
 *
 * @param jdVector JD embedding vector
 * @param resumeVectors Array of resume vectors with IDs
 * @param k Number of top results to return
 * @returns Top-k similarity results
 */
export function findTopKSimilar(
  jdVector: number[],
  resumeVectors: Array<{ resumeId: string; vector: number[] }>,
  k: number
): SimilarityResult[] {
  return computeJDResumeMatches(jdVector, resumeVectors, {
    maxResults: k,
    sortDescending: true
  });
}

/**
 * Convert similarity score to a 1-10 rating scale
 * Used for UI display consistency with backend ratings
 *
 * @param similarityScore Cosine similarity score (0-1 or -1 to 1)
 * @param isNormalized Whether the score is already normalized to 0-1
 * @returns Rating from 1 to 10
 */
export function similarityToRating(similarityScore: number, isNormalized = true): number {
  // Ensure score is in 0-1 range
  const normalizedScore = isNormalized
    ? Math.max(0, Math.min(1, similarityScore))
    : (similarityScore + 1) / 2;

  // Map 0-1 to 1-10 scale
  return Math.round(normalizedScore * 9) + 1;
}

/**
 * Convert similarity score to percentage (0-100)
 *
 * @param similarityScore Cosine similarity score
 * @param isNormalized Whether the score is already normalized to 0-1
 * @returns Percentage from 0 to 100
 */
export function similarityToPercentage(similarityScore: number, isNormalized = true): number {
  const normalizedScore = isNormalized
    ? Math.max(0, Math.min(1, similarityScore))
    : (similarityScore + 1) / 2;

  return Math.round(normalizedScore * 100);
}

/**
 * Validate that a vector has the expected dimension
 *
 * @param vector Vector to validate
 * @param expectedDimension Expected dimension (e.g., 384 for bge-small-en-v1.5)
 * @returns True if valid
 */
export function validateVectorDimension(vector: number[], expectedDimension: number): boolean {
  return vector.length === expectedDimension;
}

/**
 * Common embedding model dimensions for reference
 */
export const EMBEDDING_DIMENSIONS = {
  'bge-small-en-v1.5': 384,
  'all-MiniLM-L6-v2': 384,
  'all-MiniLM-L12-v2': 384,
  'all-mpnet-base-v2': 768,
  'gte-small': 384,
  'text-embedding-ada-002': 1536, // OpenAI
  'text-embedding-3-small': 1536, // OpenAI
  'text-embedding-3-large': 3072, // OpenAI
} as const;

export type EmbeddingModel = keyof typeof EMBEDDING_DIMENSIONS;
