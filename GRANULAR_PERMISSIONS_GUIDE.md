# Granular CRUD Permissions Implementation Guide

## Overview

The system now supports **granular CRUD (Create, Read, Update, Delete) permissions** for each module. This means you can give a user permission to:
- **Read** Job Descriptions but NOT create them
- **Update** Resumes but NOT delete them
- **View** Assessments but NOT create new ones

## How It Works

### 1. Sidebar Menu Visibility

The sidebar shows a menu item if the user has **ANY** of the related permissions:

**Example - Job Descriptions Menu:**
- Shows if user has: `canReadJD` **OR** `canCreateJD` **OR** `canUpdateJD` **OR** `canDeleteJD`
- Hides if user has NONE of these permissions

### 2. Page-Level Action Controls

On each page, individual action buttons (Create, Edit, Delete) are shown/hidden based on specific permissions:

**Example - Job Descriptions Page:**
- "Create Job Description" button → Only shows if `canCreateJD = true`
- "Edit" button → Only shows if `canUpdateJD = true`
- "Delete" button → Only shows if `canDeleteJD = true`

## Implementation Example

### Step 1: Import the Hook

```typescript
import { useModulePermissions } from '@/lib/hooks/usePermissions';
```

### Step 2: Get Module Permissions

```typescript
export default function JobDescriptionsPage() {
  // Get granular permissions for Job Descriptions module
  const jdPerms = useModulePermissions('jd');

  // jdPerms now contains:
  // {
  //   canRead: boolean,
  //   canCreate: boolean,
  //   canUpdate: boolean,
  //   canDelete: boolean,
  //   hasAnyAccess: boolean
  // }
```

### Step 3: Control Button Visibility

```tsx
  return (
    <div>
      {/* Create Button - Only show if user can create */}
      {jdPerms.canCreate && (
        <button onClick={handleCreate}>
          Create Job Description
        </button>
      )}

      {/* List of Job Descriptions */}
      {jdPerms.canRead && (
        <div>
          {jobDescriptions.map(jd => (
            <div key={jd.id}>
              <h3>{jd.title}</h3>

              {/* Edit Button - Only show if user can update */}
              {jdPerms.canUpdate && (
                <button onClick={() => handleEdit(jd.id)}>
                  Edit
                </button>
              )}

              {/* Delete Button - Only show if user can delete */}
              {jdPerms.canDelete && (
                <button onClick={() => handleDelete(jd.id)}>
                  Delete
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* No Access Message */}
      {!jdPerms.hasAnyAccess && (
        <div>You don't have permission to access Job Descriptions</div>
      )}
    </div>
  );
}
```

## Available Modules

```typescript
type ModuleType = 'jd' | 'resume' | 'assessment' | 'internal_db';
```

### Module Permission Mapping

| Module | canRead | canCreate | canUpdate | canDelete |
|--------|---------|-----------|-----------|-----------|
| `jd` | `canReadJD` | `canCreateJD` | `canUpdateJD` | `canDeleteJD` |
| `resume` | `canViewResumes` | `canUploadResumes` | `canUpdateResumes` | `canDeleteResumes` |
| `assessment` | `canViewAssessments` | `canCreateAssessments` | `canUpdateAssessments` | `canDeleteAssessments` |
| `internal_db` | `canAccessInternalDB` | ❌ N/A | `canUpdateInternalDB` | `canDeleteInternalDB` |

## Permission Hierarchy

### Permission Granularity

| Permission Level | Description | Example |
|-----------------|-------------|---------|
| **Read** | View/list records | See list of JDs, view JD details |
| **Create** | Add new records | Create new Job Description |
| **Update** | Edit existing records | Modify Job Description |
| **Delete** | Remove records | Delete Job Description |

### Typical Permission Combinations

#### Read-Only User
```typescript
canReadJD: true,
canCreateJD: false,
canUpdateJD: false,
canDeleteJD: false
```
**Result:** Can view JD menu, see list of JDs, but no Create/Edit/Delete buttons

#### Editor (No Delete)
```typescript
canReadJD: true,
canCreateJD: true,
canUpdateJD: true,
canDeleteJD: false
```
**Result:** Can view, create, and edit JDs, but cannot delete

#### Creator Only
```typescript
canReadJD: false,
canCreateJD: true,
canUpdateJD: false,
canDeleteJD: false
```
**Result:** Can only create new JDs, cannot view or edit existing ones

#### Full Access
```typescript
canReadJD: true,
canCreateJD: true,
canUpdateJD: true,
canDeleteJD: true
```
**Result:** Full CRUD access (like tenant_admin or recruiter role)

## Real-World Use Cases

### Use Case 1: Junior Recruiter (Read + Create Only)

**Permissions to Grant:**
- ✅ Read Job Descriptions
- ✅ Create Job Descriptions
- ❌ Update Job Descriptions (senior approval required)
- ❌ Delete Job Descriptions (senior approval required)

**User Experience:**
- Sees "Job Descriptions" menu
- Can view all existing JDs
- Can create new JDs
- Cannot edit or delete any JDs

---

### Use Case 2: Content Manager (Read + Update Only)

**Permissions to Grant:**
- ✅ Read Job Descriptions
- ❌ Create Job Descriptions
- ✅ Update Job Descriptions
- ❌ Delete Job Descriptions

**User Experience:**
- Sees "Job Descriptions" menu
- Can view all JDs
- Can edit/update existing JDs
- Cannot create new JDs
- Cannot delete JDs

---

### Use Case 3: Auditor (Read Only)

**Permissions to Grant:**
- ✅ Read Job Descriptions
- ✅ View Resumes
- ✅ View Assessments
- ❌ All other permissions

**User Experience:**
- Sees menus for JD, Resumes, Assessments
- Can view all data
- No Create/Edit/Delete buttons appear anywhere

---

### Use Case 4: Data Entry (Create Only)

**Permissions to Grant:**
- ❌ Read Resumes
- ✅ Upload Resumes
- ❌ Update Resumes
- ❌ Delete Resumes

**User Experience:**
- Sees "My Resumes" menu
- Can only upload new resumes
- Cannot view, edit, or delete existing resumes

## Implementation Checklist

When implementing granular permissions on a new page:

- [ ] Import `useModulePermissions` hook
- [ ] Call hook with correct module type
- [ ] Wrap "Create" button with `{modulePerms.canCreate && ...}`
- [ ] Wrap "Edit" button with `{modulePerms.canUpdate && ...}`
- [ ] Wrap "Delete" button with `{modulePerms.canDelete && ...}`
- [ ] Show "No Access" message if `!modulePerms.hasAnyAccess`
- [ ] Test with different permission combinations
- [ ] Verify API endpoints also check permissions server-side

## Backend Integration

**IMPORTANT:** The backend API must also enforce these permissions!

### Expected API Permission Keys

The backend should check these permission keys:

**Job Descriptions:**
- `can_read_jd`
- `can_create_jd`
- `can_update_jd`
- `can_delete_jd`

**Resumes:**
- `can_view_resumes` (read)
- `can_upload_resumes` (create)
- `can_update_resumes`
- `can_delete_resumes`

**Assessments:**
- `can_view_assessments` (read)
- `can_create_assessments`
- `can_update_assessments`
- `can_delete_assessments`

**Internal Database:**
- `can_access_internal_db` (read)
- `can_update_internal_db`
- `can_delete_internal_db`

### API Endpoint Protection Example

```python
# Backend API endpoint example
@app.post("/api/jd/create")
@require_permission("can_create_jd")
def create_job_description():
    # Only executed if user has can_create_jd permission
    pass

@app.put("/api/jd/{jd_id}")
@require_permission("can_update_jd")
def update_job_description(jd_id: int):
    # Only executed if user has can_update_jd permission
    pass

@app.delete("/api/jd/{jd_id}")
@require_permission("can_delete_jd")
def delete_job_description(jd_id: int):
    # Only executed if user has can_delete_jd permission
    pass
```

## Testing Scenarios

### Test Scenario 1: Read-Only User
1. Grant only `canReadJD` permission
2. Login as user
3. **Expected:** See "Job Descriptions" menu
4. **Expected:** Can view JD list
5. **Expected:** NO "Create" button
6. **Expected:** NO "Edit" buttons
7. **Expected:** NO "Delete" buttons

### Test Scenario 2: Creator Only
1. Grant only `canCreateJD` permission
2. Login as user
3. **Expected:** See "Job Descriptions" menu
4. **Expected:** See "Create" button
5. **Expected:** CANNOT view existing JDs

### Test Scenario 3: No Permissions
1. Grant NO JD permissions
2. Login as user
3. **Expected:** "Job Descriptions" menu NOT visible in sidebar

## Summary

✅ **Sidebar** checks if user has ANY permission for a module
✅ **Page buttons** check specific CRUD permissions
✅ **API** must also enforce same permissions server-side
✅ **User experience** is tailored to exact permissions granted

This granular permission system provides maximum flexibility for creating custom user roles with precise access control!
