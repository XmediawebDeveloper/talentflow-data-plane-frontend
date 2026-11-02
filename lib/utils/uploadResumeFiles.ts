import { resumeService } from '@/lib/services/resumeService';
import { toast } from 'sonner';

/**
 * Upload resumes into My Resumes for `UploadModal`'s `onUpload`: one file, or
 * several in parallel, with every backend refusal (duplicate 409, invalid /
 * empty resume 400, read-only / quota / permission 403, parser 503) turned
 * into the result shape the modal shows. `afterUpload` runs once the files
 * are stored (the caller's list refresh). Shared by the Select Applicants to
 * Score popup and the invite popup's My Resumes.
 */
export async function uploadResumeFiles(files: File[], folderId: string | undefined, afterUpload?: () => Promise<void> | void) {
  try {
    if (files.length === 0) {
      return {
        success: false,
        error: 'No file provided'
      };
    }

    // For bulk upload, upload all files sequentially
    if (files.length > 1) {
      const results = await Promise.allSettled(
        files.map(file => resumeService.upload(file, folderId))
      );
      await afterUpload?.();
      const uploadedResumes = results
        .filter((r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof resumeService.upload>>> => r.status === 'fulfilled' && !!r.value?.id)
        .map(r => ({ id: r.value.id as string, candidateName: (r.value.candidate_name as string) || 'Resume' }));
      if (uploadedResumes.length > 0) {
        const failedCount = files.length - uploadedResumes.length;
        if (failedCount > 0) {
          toast.error(`${failedCount} of ${files.length} resumes could not be uploaded (invalid, non-English or duplicate).`);
        }
        return {
          success: true,
          resumeId: uploadedResumes[0].id,
          candidateName: uploadedResumes[0].candidateName,
          uploadedResumes,
        };
      }
      // All files rejected — re-throw the first rejection so the catch
      // below maps 409 → DuplicateResumeDetectedModal payload instead of
      // surfacing axios's raw "Request failed with status code 409".
      const firstRejection = results.find(r => r.status === 'rejected') as PromiseRejectedResult | undefined;
      if (firstRejection) throw firstRejection.reason;
      return { success: false, error: 'Upload failed' };
    }

    const response = await resumeService.upload(files[0], folderId);
    await afterUpload?.();

    return {
      success: true,
      resumeId: response.id,
      candidateName: response.candidate_name,
      uploadedResumes: [{ id: response.id, candidateName: response.candidate_name || 'Resume' }],
    };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the API's error bodies, read defensively
  } catch (error: any) {
    console.error('Upload error:', error);

    // Handle 409 duplicate resume
    if (error?.response?.status === 409) {
      const detail = error?.response?.data?.detail;
      const existingResume = detail?.existing_resume;
      const isExactDuplicate = detail?.is_exact_duplicate ?? true;
      const contentDifferences = detail?.content_differences || [];

      if (existingResume) {
        return {
          success: false,
          error: `A resume for ${existingResume.candidate_name || 'this candidate'} already exists in your Shared Resume Database.`,
          existingResume: {
            id: existingResume.id,
            candidateName: existingResume.candidate_name || existingResume.file_name || 'Unknown',
            email: existingResume.email || '',
            currentTitle: existingResume.current_title || '',
            folderName: existingResume.folder_name || '',
            uploadedAt: existingResume.upload_date || '',
            version: existingResume.version || 1,
          },
          duplicateData: {
            file: files[0],
            existingResume: {
              id: existingResume.id,
              candidate_name: existingResume.candidate_name || existingResume.file_name || 'Unknown',
              email: existingResume.email || '',
              folder_name: existingResume.folder_name,
              folder_path: existingResume.folder_path || 'My Resumes',
              upload_date: existingResume.upload_date || '',
              file_size: existingResume.file_size || 0,
              file_name: existingResume.file_name || '',
              version: existingResume.version || 1,
              version_count: existingResume.version_count || existingResume.version || 1,
            },
            contentDifferences,
            isDuplicate: isExactDuplicate,
          }
        };
      }

      return {
        success: false,
        error: 'This resume already exists in the system.',
      };
    }

    // Handle 400 validation errors
    if (error?.response?.status === 400) {
      const detail = error?.response?.data?.detail;

      if (detail?.error === 'INVALID_RESUME') {
        return {
          success: false,
          error: detail?.message || 'The uploaded file does not appear to be a valid resume. It may be a scorecard, invoice, or other document type.',
        };
      }

      if (detail?.error === 'NO_CONTENT') {
        return {
          success: false,
          error: detail?.message || 'The resume file has no readable content. The file may be blank, image-only, or heavily formatted.',
        };
      }

      return {
        success: false,
        error: detail?.message || `Failed to upload ${files[0]?.name || 'file'}`,
      };
    }

    // Handle 403 — read-only mode, quota exhausted, or permission denied
    if (error?.response?.status === 403) {
      const detail = error?.response?.data?.detail;

      if (detail?.error === 'READ_ONLY_MODE') {
        return {
          success: false,
          error: 'Uploads are disabled because your account is in read-only mode. Please contact your administrator.',
        };
      }

      if (detail?.error === 'QUOTA_EXHAUSTED') {
        return {
          success: false,
          error: detail?.message || 'Resume upload quota exhausted. Please upgrade your plan to upload more resumes.',
        };
      }

      return {
        success: false,
        error: 'You do not have permission to upload resumes. Please contact your administrator.',
      };
    }

    // Handle 503 — AI parsing service unavailable (e.g. RU_OPENAI_API_KEY not configured)
    if (error?.response?.status === 503) {
      const detail = error?.response?.data?.detail;
      return {
        success: false,
        error: detail?.message || 'Resume upload is temporarily unavailable. Please try again later or contact your administrator.',
      };
    }

    // Fall back to whatever reason the backend gave, even for status codes
    // not explicitly handled above, instead of a generic message that hides
    // why the upload actually failed.
    {
      const detail = error?.response?.data?.detail;
      const backendMessage = typeof detail === 'string' ? detail : detail?.message;
      return {
        success: false,
        error: backendMessage || `Failed to upload ${files[0]?.name || 'file'}`,
      };
    }
  }
}
