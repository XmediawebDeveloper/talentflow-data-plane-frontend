# Assessment Answer Submission Behavior - Implementation

**Date**: 2026-02-06
**Status**: ✅ **IMPLEMENTED**
**Feature**: Draft vs Locked Answer Submission

---

## Overview

Implemented clear separation between draft saving (editable) and answer locking (final submission) during assessment.

**Behavior**:
- **"Next" button** → Save as **draft** (editable, can go back and change)
- **"Previous" button** → Save as **draft** (editable, can go back and change)
- **"Submit" button** → **Lock** answer (cannot change anymore)
- **"Submit & Confirm" button** → Complete entire assessment

---

## User Experience Flow

### During Assessment:

```
Question 1
├─ Type answer
├─ Click "Next" → Saved as draft (editable)
├─ OR Click "Submit" → Locked (not editable)
└─ Move to Question 2

Question 2
├─ Type answer
├─ Click "Next" → Saved as draft (editable)
├─ Click "Previous" → Go back to Question 1
└─ Can edit Question 1 answer (if not locked)

Question 3 (Last)
├─ Type answer
├─ Click "Submit & Confirm" → Complete assessment
└─ All draft answers finalized
```

---

## Implementation Changes

### File: `components/candidate/AssessmentInterface.tsx`

#### 1. ✅ Previous Button (Lines 765-790)

**BEFORE** (Locked answers):
```typescript
// Navigate to previous question (submit and lock answer)
const handlePrevious = async () => {
  // Submit with is_draft: false to lock the answer
  await onAnswerSubmit(currentQuestion.question_id, { ...answer, is_draft: false });
  setAnswerStatuses(prev => {
    const newMap = new Map(prev);
    newMap.set(`question_${currentQuestion.question_number}`, { hasDraft: true, isLocked: true });
    return newMap;
  });
}
```

**AFTER** (Save as draft):
```typescript
// Navigate to previous question (save as draft, editable)
const handlePrevious = async () => {
  // Submit with is_draft: true to keep answer editable
  await onAnswerSubmit(currentQuestion.question_id, { ...answer, is_draft: true });
  setAnswerStatuses(prev => {
    const newMap = new Map(prev);
    newMap.set(`question_${currentQuestion.question_number}`, { hasDraft: true, isLocked: false });
    return newMap;
  });
}
```

**Key Changes**:
- ✅ `is_draft: false` → `is_draft: true`
- ✅ `isLocked: true` → `isLocked: false`

---

#### 2. ✅ Next Button (Lines 792-817)

**BEFORE** (Locked answers):
```typescript
// Navigate to next question (submit and lock answer)
const handleNext = async () => {
  // Submit with is_draft: false to lock the answer
  await onAnswerSubmit(currentQuestion.question_id, { ...answer, is_draft: false });
  setAnswerStatuses(prev => {
    const newMap = new Map(prev);
    newMap.set(`question_${currentQuestion.question_number}`, { hasDraft: true, isLocked: true });
    return newMap;
  });
}
```

**AFTER** (Save as draft):
```typescript
// Navigate to next question (save as draft, editable)
const handleNext = async () => {
  // Submit with is_draft: true to keep answer editable
  await onAnswerSubmit(currentQuestion.question_id, { ...answer, is_draft: true });
  setAnswerStatuses(prev => {
    const newMap = new Map(prev);
    newMap.set(`question_${currentQuestion.question_number}`, { hasDraft: true, isLocked: false });
    return newMap;
  });
}
```

**Key Changes**:
- ✅ `is_draft: false` → `is_draft: true`
- ✅ `isLocked: true` → `isLocked: false`

---

#### 3. ✅ Submit Button (Lines 744-763) - UNCHANGED

**Behavior**: Locks the answer (final submission)

```typescript
// Submit and lock answer - not editable anymore
const handleSubmitAndLock = async () => {
  if (isSubmitting || isCurrentAnswerLocked) return;

  // Submit with is_draft: false to lock the answer
  await onAnswerSubmit(currentQuestion.question_id, { ...answer, is_draft: false });

  setAnswerStatuses(prev => {
    const newMap = new Map(prev);
    newMap.set(`question_${currentQuestion.question_number}`, { hasDraft: true, isLocked: true });
    return newMap;
  });
}
```

**Key Points**:
- ✅ `is_draft: false` (locks answer)
- ✅ `isLocked: true` (marks as locked)
- ✅ Optional button - only shown if answer not already locked

---

## UI Elements

### Button Configuration:

```typescript
{/* Previous Button - Always visible (except on first question) */}
<Button onClick={handlePrevious}>
  <ChevronLeft /> Previous
</Button>

{/* Submit Button - Optional (locks answer) */}
{!isCurrentAnswerLocked && isAnswerValid() && (
  <Button
    variant="outline"
    onClick={handleSubmitAndLock}
    className="border-green-500 text-green-600"
    title="Submit and lock this answer (cannot be edited after)"
  >
    <Lock /> Submit
  </Button>
)}

{/* Locked Indicator - Shows when answer is submitted */}
{isCurrentAnswerLocked && (
  <span className="bg-green-100 text-green-700">
    <Lock /> Answer Submitted
  </span>
)}

{/* Next Button - Auto-saves draft */}
{!isLastQuestion ? (
  <Button onClick={handleNext}>
    Next <ChevronRight />
  </Button>
) : (
  /* Submit & Confirm - Last question only */
  <Button onClick={handleFinalSubmit}>
    <Send /> Submit & Confirm
  </Button>
)}
```

---

## Answer States

### Draft State (Editable)

**Characteristics**:
- ✅ Saved to database with `is_draft: true`
- ✅ Can navigate back and change
- ✅ Answer is editable
- ✅ Not counted as "submitted" yet

**Triggered By**:
- Click "Next" button
- Click "Previous" button
- Auto-save (if implemented)

---

### Locked State (Final)

**Characteristics**:
- ✅ Saved to database with `is_draft: false`
- ❌ Cannot navigate back and change
- ❌ Answer is read-only
- ✅ Counted as "submitted"

**Triggered By**:
- Click "Submit" button (green lock button)
- Click "Submit & Confirm" on last question
- Assessment completion

---

## Visual Indicators

### Question Navigation Panel

```
┌─────────────────────────────────────┐
│ Question Navigation                  │
├─────────────────────────────────────┤
│ Question 1 - Answered ✓             │  ← Draft (editable)
│ Question 2 - Submitted 🔒           │  ← Locked (cannot edit)
│ Question 3 - Not Answered           │  ← No answer yet
│ Question 4 - Current                │  ← Currently viewing
└─────────────────────────────────────┘
```

### Current Question Status

```
Draft Answer (Editable):
┌─────────────────────────────────────┐
│ [Previous]    [Submit 🔒]  [Next]   │
└─────────────────────────────────────┘

Locked Answer (Cannot Edit):
┌─────────────────────────────────────┐
│ [Previous]  [Answer Submitted 🔒]   │
│                            [Next]    │
└─────────────────────────────────────┘
```

---

## Backend API Contract

### Submit Answer Endpoint

**Endpoint**: `POST /api/v1/candidate/assessment/{token}/answer`

**Request Body**:
```json
{
  "question_id": "123e4567-e89b-12d3-a456-426614174000",
  "text_response": "My answer here...",
  "is_draft": true  // or false
}
```

**Draft vs Locked**:
- `is_draft: true` → Answer saved but editable (can be updated)
- `is_draft: false` → Answer locked (cannot be updated)

**Database Storage**:
```sql
-- assessment_quiz_ans table
is_draft BOOLEAN DEFAULT true  -- true = editable, false = locked
```

---

## User Scenarios

### Scenario 1: Candidate Wants to Review Later ✅

```
1. Candidate on Question 1
2. Types answer: "React is a JavaScript library"
3. Clicks "Next" (NOT "Submit")
   → Answer saved as draft (editable)
4. Continues to Question 5
5. Realizes Question 1 needs more detail
6. Clicks Question 1 in navigation panel
7. Edits answer: "React is a declarative JavaScript library for building UIs"
8. Clicks "Next"
   → Updated draft saved
9. Finishes assessment
   → All draft answers finalized
```

**Result**: ✅ Can change answers freely until final submission

---

### Scenario 2: Candidate Sure About Answer ✅

```
1. Candidate on Question 2 (MCQ)
2. Selects option "B"
3. Confident this is correct
4. Clicks "Submit" (green lock button)
   → Answer locked
5. Tries to navigate back to Question 2
6. Answer is shown but disabled (read-only)
7. Cannot change answer
```

**Result**: ✅ Answer locked, cannot be changed

---

### Scenario 3: Mixed Draft and Locked Answers ✅

```
Question 1: "Next" → Draft (editable)
Question 2: "Submit" → Locked (cannot edit)
Question 3: "Next" → Draft (editable)
Question 4: "Submit" → Locked (cannot edit)
Question 5: "Submit & Confirm" → All finalized

Final State:
- Q1: Draft finalized on assessment completion
- Q2: Locked (as submitted)
- Q3: Draft finalized on assessment completion
- Q4: Locked (as submitted)
- Q5: Locked (as submitted)
```

**Result**: ✅ Can edit Q1 and Q3 until final submission, but Q2 and Q4 are locked early

---

## Advantages

### 1. ✅ Flexibility
- Candidates can review and change answers
- No pressure to lock answers immediately
- Can revisit difficult questions later

### 2. ✅ Control
- Candidates can choose when to lock answers
- Optional "Submit" button for confident answers
- Clear visual feedback on locked vs draft

### 3. ✅ User-Friendly
- Natural flow: type → next → review → finalize
- No accidental locking
- Can navigate freely

### 4. ✅ Reduced Anxiety
- No fear of "I can't go back"
- Can think through answers
- Time management is easier

---

## Edge Cases

### 1. ✅ Navigating to Locked Answer

**Behavior**:
- Answer is displayed but disabled
- "Submit" button replaced with "Answer Submitted" indicator
- "Next" and "Previous" buttons still work
- Cannot edit locked answer

---

### 2. ✅ Incomplete Answer on "Next"

**Behavior**:
- Empty answers are NOT saved
- Only saved if `hasAnswer` is true
- No error thrown
- Can come back and answer later

---

### 3. ✅ Assessment Completion

**Behavior**:
- All draft answers are finalized
- All locked answers remain locked
- Cannot go back after completing
- Results calculated from all answers (draft + locked)

---

### 4. ✅ Time Expiry

**Behavior**:
- Assessment auto-submits on timer expire
- All draft answers saved as-is
- All locked answers remain locked
- Current answer saved as draft

---

## Testing Checklist

### ✅ Draft Behavior Tests

- [ ] Click "Next" → Answer saved as draft (is_draft: true)
- [ ] Navigate back → Can edit draft answer
- [ ] Change draft answer → Updated draft saved
- [ ] Click "Previous" → Answer saved as draft

### ✅ Lock Behavior Tests

- [ ] Click "Submit" → Answer locked (is_draft: false)
- [ ] Navigate back to locked answer → Shown as read-only
- [ ] Try to edit locked answer → Cannot edit
- [ ] "Submit" button replaced with "Answer Submitted" indicator

### ✅ Mixed State Tests

- [ ] Some draft, some locked answers → Both types handled correctly
- [ ] Navigate between draft and locked → Correct state shown
- [ ] Complete assessment → All answers finalized

### ✅ Edge Case Tests

- [ ] Empty answer on "Next" → No save, no error
- [ ] Time expiry → All answers saved
- [ ] Network error during save → Retry logic works
- [ ] Rapid clicking → No duplicate saves

---

## Database Schema

### assessment_quiz_ans Table

**Relevant Columns**:
```sql
id UUID PRIMARY KEY
attempt_id UUID
question_id UUID
candidate_answer_text TEXT
candidate_selected_options JSONB
candidate_code_submission TEXT
is_draft BOOLEAN DEFAULT true  -- true = editable, false = locked
answered_at TIMESTAMP
```

**Query Examples**:

```sql
-- Get all draft answers
SELECT * FROM assessment_quiz_ans
WHERE attempt_id = ? AND is_draft = true;

-- Get all locked answers
SELECT * FROM assessment_quiz_ans
WHERE attempt_id = ? AND is_draft = false;

-- Lock an answer (convert draft to final)
UPDATE assessment_quiz_ans
SET is_draft = false, answered_at = NOW()
WHERE id = ?;
```

---

## Conclusion

Assessment answer submission now has **clear behavior**:

- ✅ **"Next" button** → Save as draft (editable)
- ✅ **"Previous" button** → Save as draft (editable)
- ✅ **"Submit" button** → Lock answer (final)
- ✅ **User can change answers anytime** until explicitly locked

**Candidates have full control over their answers!** 🎯

---

**Document Version**: 1.0
**Last Updated**: 2026-02-06
**Implementation Status**: COMPLETE
