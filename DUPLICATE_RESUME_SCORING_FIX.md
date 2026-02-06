# Duplicate Resume Scoring Prevention - Implementation

## Issue Report
**Problem**: System accepting the same resume for scoring multiple times without warning

## User Requirements
1. Check if resume already exists in Internal Resume Database before scoring
2. Show alert: "This resume already exists in your Internal Resume Database. Do you still want to submit for scoring?"
3. Prevent unintentional duplicate scoring while allowing intentional rescoring

## Solution Implemented

### Architecture
The solution leverages the existing duplicate detection mechanism that was already in place for resume uploads and extends it to the scoring workflow.

### Flow
```
User uploads resume in Scoring Modal
         ↓
Backend detects duplicate (HTTP 409)
         ↓
Frontend catches 409 error
         ↓
Parse existing resume details
         ↓
Show DuplicateResumeDetectedModal
         ↓
User chooses action:
  ├─ Cancel → Close modal
  ├─ View Existing → Open resume in new tab
  └─ Proceed with Scoring → Add to selected resumes
```

## Changes Made

### Frontend: `/components/ResumeSelectionModal.tsx`

#### 1. Added Import
```tsx
import DuplicateResumeDetectedModal from './DuplicateResumeDetectedModal';
```

#### 2. Added State Variables
```tsx
// Duplicate detection modal
const [showDuplicateModal, setShowDuplicateModal] = useState(false);
const [duplicateInfo, setDuplicateInfo] = useState<{
  fileName: string;
  existingResume: any;
} | null>(null);
```

#### 3. Enhanced Error Handling
Updated the `handleFileUpload` function to parse 409 responses:

```tsx
// Handle duplicate error (409)
if (error.status === 409 || error.response?.status === 409) {
  toast.dismiss(toastId);

  // Parse the existing resume details from error response
  const errorData = error.response?.data || error.data || {};
  const existingResume = errorData.existing_resume;

  if (existingResume) {
    // Show duplicate detection modal
    setDuplicateInfo({
      fileName: file.name,
      existingResume: {
        id: existingResume.id,
        candidate_name: existingResume.candidate_name,
        email: existingResume.email,
        current_title: existingResume.current_title,
        folder_name: existingResume.folder_name,
        uploaded_at: existingResume.upload_date,
        version: existingResume.version,
      },
    });
    setShowDuplicateModal(true);
  }
}
```

#### 4. Added Handler Functions
```tsx
// Handle duplicate modal actions
const handleProceedWithScoring = async (resumeId: string) => {
  // Fetch full resume details if not already in list
  // Add to localResumes so it appears in the selection list
  // Auto-select the resume for scoring
  // Show success toast
};

const handleViewExisting = (resumeId: string) => {
  // Open resume detail in new tab
  window.open(`/recruitment/resume-view/${resumeId}`, '_blank');
};
```

#### 5. Added Modal Component
```tsx
{/* Duplicate Resume Detected Modal */}
{showDuplicateModal && duplicateInfo && (
  <DuplicateResumeDetectedModal
    isOpen={showDuplicateModal}
    onClose={() => {
      setShowDuplicateModal(false);
      setDuplicateInfo(null);
    }}
    fileName={duplicateInfo.fileName}
    existingResume={duplicateInfo.existingResume}
    jobTitle={jobTitle}
    onViewExisting={handleViewExisting}
    onProceedWithScoring={handleProceedWithScoring}
  />
)}
```

### Backend: No Changes Required
The backend already has robust duplicate detection:
- Computes SHA-256 file hash
- Checks for existing resume by email
- Returns HTTP 409 with full existing resume details
- Location: `/app/routers/resumes.py` lines 776-849

## User Experience

### Before (Issue)
```
User uploads resume → Resume uploaded successfully → User selects for scoring
Problem: User doesn't know it's a duplicate
```

### After (Fixed)
```
User uploads resume → 409 Duplicate Detected → Modal shows:

┌─────────────────────────────────────────────┐
│  ⚠️ Resume Already Exists                   │
├─────────────────────────────────────────────┤
│  This resume already exists in your         │
│  Internal Resume Database. Do you still     │
│  want to submit for scoring against         │
│  "Senior Developer"?                        │
│                                             │
│  📄 Uploaded File: john_doe_resume.pdf     │
│                                             │
│  ┌─────────────────────────────────────┐  │
│  │ Existing Record in Database         │  │
│  ├─────────────────────────────────────┤  │
│  │ 👤 John Doe (v2)                    │  │
│  │ 📧 john.doe@email.com                │  │
│  │ 💼 Senior Software Engineer          │  │
│  │ 📁 Folder: Engineering Candidates    │  │
│  │ 📅 Uploaded: Jan 15, 2026            │  │
│  └─────────────────────────────────────┘  │
│                                             │
│  [Cancel]  [View Existing]  [✓ Proceed]   │
└─────────────────────────────────────────────┘
```

### User Options
1. **Cancel** - Close the modal and don't proceed
2. **View Existing Record** - Opens resume in new tab for review
3. **Proceed with Scoring** - Adds existing resume to scoring selection

## Testing Checklist

### Test Case 1: Upload New Resume
- ✅ Upload a completely new resume
- Expected: Upload succeeds, resume added to selection

### Test Case 2: Upload Exact Duplicate
- ✅ Upload a resume that already exists (same email, same content)
- Expected: Modal shows "Resume Already Exists"
- Expected: Shows existing resume details
- Expected: Three action buttons available

### Test Case 3: Cancel on Duplicate
- ✅ Upload duplicate → Click "Cancel"
- Expected: Modal closes, resume not added to selection

### Test Case 4: View Existing on Duplicate
- ✅ Upload duplicate → Click "View Existing Record"
- Expected: Opens resume detail page in new tab
- Expected: Modal closes

### Test Case 5: Proceed with Scoring
- ✅ Upload duplicate → Click "Proceed with Scoring"
- Expected: Modal closes
- Expected: Existing resume added to selection list
- Expected: Resume auto-selected for scoring
- Expected: Success toast shows

### Test Case 6: Version Detection
- ✅ Upload updated version of existing resume
- Expected: Modal shows with version number (v2, v3, etc.)
- Expected: All three action buttons work correctly

## Edge Cases Handled

### 1. Network Error During Upload
```tsx
catch (error: any) {
  // Generic error handling for non-duplicate errors
  toast.error(error.message || 'Failed to upload resume');
}
```

### 2. Missing Existing Resume Data
```tsx
if (existingResume) {
  // Show modal with data
} else {
  // Fallback to simple error message
  toast.error('A resume with this email already exists.');
}
```

### 3. Resume Already in Selection
```tsx
setSelectedResumes(prev => {
  if (!prev.includes(resumeId)) {
    return [...prev, resumeId];  // Only add if not present
  }
  return prev;
});
```

### 4. Fetch Failure for Full Details
```tsx
try {
  const fullResume = await resumeService.getById(resumeId);
  setLocalResumes(prev => [resumeToAdd, ...prev]);
} catch (error) {
  console.error('Failed to fetch resume details:', error);
  // Continue anyway - resume will still be selected
}
```

## API Response Structure

### Backend 409 Response
```json
{
  "error": "DUPLICATE_RESUME",
  "message": "A resume for John Doe already exists.",
  "is_exact_duplicate": true,
  "existing_resume": {
    "id": "uuid",
    "candidate_name": "John Doe",
    "email": "john.doe@email.com",
    "file_name": "john_doe_resume.pdf",
    "file_size": 245678,
    "folder_id": "uuid",
    "folder_name": "Engineering Candidates",
    "folder_path": "My Resumes/Engineering Candidates",
    "upload_date": "2026-01-15T10:30:00Z",
    "version": 2,
    "version_count": 2,
    "current_title": "Senior Software Engineer",
    "skills": ["Python", "React", "AWS"]
  },
  "content_differences": []
}
```

## Benefits

### ✅ User Experience
- Clear communication when duplicate detected
- Informed decision-making
- No accidental duplicate submissions
- Quick access to view existing resume

### ✅ Data Integrity
- Prevents unintentional duplicate processing
- Maintains clean resume database
- Avoids wasted scoring units

### ✅ Flexibility
- Users can still score existing resumes if needed
- Supports intentional re-scoring scenarios
- Doesn't block legitimate workflows

## Related Features

This implementation works seamlessly with:
1. **Version Management** - Detects resume versions (v1, v2, v3)
2. **Folder Organization** - Shows which folder contains the existing resume
3. **Quota Management** - Prevents wasting RS units on duplicate uploads
4. **Resume Selection** - Existing resume can be immediately selected for scoring

## Future Enhancements (Optional)

1. **Batch Upload Duplicate Handling**
   - Extend to bulk upload scenarios
   - Show summary of duplicates detected

2. **Smart Matching**
   - Fuzzy matching for similar names
   - Content similarity detection beyond exact hash

3. **Duplicate History**
   - Track how many times user tried to upload same resume
   - Analytics on duplicate patterns

## Summary

✅ **Implementation Complete**
- Frontend modal integration
- Error parsing and handling
- User action handlers
- Resume selection integration
- Build successful with no errors

✅ **User Requirements Met**
- ✓ Checks if resume exists before scoring
- ✓ Shows alert with existing resume details
- ✓ Prevents unintentional duplicates
- ✓ Allows intentional re-scoring

✅ **Ready for Testing**
- All code changes complete
- Frontend build successful
- No breaking changes to existing functionality
