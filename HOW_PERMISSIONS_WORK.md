# How the Permission System Works

## Overview

The permission system has two distinct behaviors based on user role:

### 1. **tenant_admin Role** (Owner)
- ✅ **Bypasses ALL permission checks**
- ✅ **Sees ALL menus and features**
- ✅ **No permission restrictions**
- This is hardcoded in the frontend

### 2. **All Other Roles** (recruiter, viewer, billing_manager, standard_user, custom roles)
- ❌ **NO automatic permissions**
- ❌ **NO role-based defaults**
- ✅ **ONLY uses explicitly assigned permissions**
- ✅ **Menus show ONLY for granted permissions**

---

## Permission Flow

### Step 1: User Creation in User Management

When you create/edit a user:

```
1. Select a role (e.g., "recruiter")
2. Select specific permissions in the UI:
   - ✅ Read Job Descriptions
   - ✅ Create Job Descriptions
   - ❌ Update Job Descriptions
   - ❌ Delete Job Descriptions
3. Save user
```

### Step 2: Backend Stores Permissions

Backend saves to database:
```json
{
  "user_id": 123,
  "role": "recruiter",
  "permissions": {
    "can_read_jd": true,
    "can_create_jd": true,
    "can_update_jd": false,
    "can_delete_jd": false,
    "can_view_resumes": false,
    ...
  }
}
```

**IMPORTANT:** Backend should save ONLY the permissions explicitly selected, NOT role defaults.

### Step 3: User Login

When user logs in:
1. Backend sends user data with permissions
2. Frontend receives and stores in `user.permissions`
3. **Frontend does NOT add or modify permissions**
4. Frontend uses EXACTLY what backend sent

### Step 4: Permission Checking

**In Sidebar:**
```typescript
// Job Descriptions menu visibility check
permissions: ['canReadJD', 'canCreateJD', 'canUpdateJD', 'canDeleteJD']

// Shows if user has ANY of these permissions
// In this case: canReadJD OR canCreateJD is true → Menu SHOWS
```

**On JD Page:**
```typescript
const jdPerms = useModulePermissions('jd');

// jdPerms = {
//   canRead: true,    // ✅ Shows JD list
//   canCreate: true,  // ✅ Shows "Create" button
//   canUpdate: false, // ❌ Hides "Edit" buttons
//   canDelete: false  // ❌ Hides "Delete" buttons
// }
```

---

## Example Scenarios

### Scenario 1: Recruiter Role with Selected Permissions

**User Management Selection:**
- Role: Recruiter
- Permissions Selected:
  - ✅ Read Job Descriptions
  - ✅ View Resumes
  - ❌ Create Job Descriptions
  - ❌ Upload Resumes
  - ❌ All other permissions

**Backend Response:**
```json
{
  "role": "recruiter",
  "permissions": {
    "can_read_jd": true,
    "can_view_resumes": true,
    "can_create_jd": false,
    "can_upload_resumes": false,
    ...all others false...
  }
}
```

**User Experience:**
- ✅ Sees "Job Descriptions" menu (has canReadJD)
- ✅ Can view JD list
- ❌ No "Create JD" button
- ✅ Sees "Resume Scoring" menu (has canViewResumes)
- ❌ No "My Resumes" menu (missing canUploadResumes)

---

### Scenario 2: Standard User with Custom Permissions

**User Management Selection:**
- Role: Standard User
- Permissions Selected:
  - ✅ Create Job Descriptions
  - ✅ Upload Resumes
  - ❌ All other permissions

**Backend Response:**
```json
{
  "role": "standard_user",
  "permissions": {
    "can_create_jd": true,
    "can_upload_resumes": true,
    ...all others false...
  }
}
```

**User Experience:**
- ✅ Sees "Job Descriptions" menu (has canCreateJD)
- ❌ Cannot VIEW JD list (missing canReadJD)
- ✅ Can click "Create JD" button
- ✅ Sees "My Resumes" menu (has canUploadResumes)
- ❌ Cannot see resume list (missing canViewResumes)

---

### Scenario 3: Viewer Role with Read Permissions

**User Management Selection:**
- Role: Viewer
- Permissions Selected:
  - ✅ Read Job Descriptions
  - ✅ View Resumes
  - ✅ View Assessments
  - ✅ View Analytics

**Backend Response:**
```json
{
  "role": "viewer",
  "permissions": {
    "can_read_jd": true,
    "can_view_resumes": true,
    "can_view_assessments": true,
    "can_view_analytics": true,
    ...all write permissions false...
  }
}
```

**User Experience:**
- ✅ Sees "Job Descriptions" menu
- ✅ Can view JD list
- ❌ No Create/Edit/Delete buttons
- ✅ Sees "Resume Scoring" menu
- ✅ Sees "Assessments" menu
- ✅ Sees "Reports & Analytics" menu
- ❌ No operational menus

---

## Role vs Permission

### What is the "Role" field for?

The **role** field (recruiter, viewer, etc.) is just a **label** and **starting template**:
- Used for display purposes
- May provide initial permission suggestions in UI
- **Does NOT grant automatic permissions**

### What Actually Controls Access?

The **permissions** object is what controls access:
```json
"permissions": {
  "can_read_jd": true,    // ← This controls access
  "can_create_jd": false, // ← This controls access
  ...
}
```

Even if role = "recruiter", if `can_create_jd = false`, user cannot create JDs.

---

## Frontend Permission Checking Code

### Sidebar Check (Menu Visibility)
```typescript
// Shows menu if user has ANY of these permissions
permissions: ['canReadJD', 'canCreateJD', 'canUpdateJD', 'canDeleteJD']

// Logic:
if (isTenantAdmin) return true; // ← Always show for admin
return permissions.some(perm => user.permissions[perm] === true);
```

### Page-Level Check (Button Visibility)
```typescript
const jdPerms = useModulePermissions('jd');

// Logic:
if (isTenantAdmin) return { all: true }; // ← Full access for admin
return {
  canRead: user.permissions.canReadJD ?? false,
  canCreate: user.permissions.canCreateJD ?? false,
  canUpdate: user.permissions.canUpdateJD ?? false,
  canDelete: user.permissions.canDeleteJD ?? false,
};
```

---

## Backend Requirements

### ✅ What Backend Should Do:

1. **For tenant_admin:**
   - Return ALL permissions as `true`
   - Or frontend will bypass checks anyway

2. **For all other roles:**
   - Return ONLY the permissions explicitly assigned to the user
   - Do NOT apply role defaults
   - Missing permissions should be `false` or omitted

### ❌ What Backend Should NOT Do:

1. Apply role-based defaults automatically
2. Assume "recruiter" role = all recruiter permissions
3. Add permissions that weren't explicitly granted

### Example Backend Response:

**Good ✅:**
```json
{
  "id": "user123",
  "email": "user@example.com",
  "role": "recruiter",
  "permissions": {
    "can_read_jd": true,
    "can_create_jd": true,
    "can_update_jd": false,
    "can_delete_jd": false,
    "can_view_resumes": true,
    "can_upload_resumes": false,
    ...explicitly set each permission...
  }
}
```

**Bad ❌:**
```json
{
  "id": "user123",
  "role": "recruiter",
  "permissions": "use_role_defaults"  // ← DON'T DO THIS
}
```

---

## Testing Checklist

### Test 1: tenant_admin
- [ ] Login as tenant_admin
- [ ] Verify ALL menus visible
- [ ] Verify ALL buttons visible
- [ ] Permissions in DB can be anything - frontend bypasses

### Test 2: Recruiter with Limited Permissions
- [ ] Create user with role "recruiter"
- [ ] Select ONLY "Read JD" and "Create JD"
- [ ] Login as this user
- [ ] Verify "Job Descriptions" menu shows
- [ ] Verify can see JD list
- [ ] Verify "Create" button shows
- [ ] Verify "Edit" and "Delete" buttons hidden

### Test 3: Standard User with Custom Permissions
- [ ] Create user with role "standard_user"
- [ ] Select ONLY "View Resumes" and "Create Assessments"
- [ ] Login as this user
- [ ] Verify ONLY "Resume Scoring" and "Assessments" menus show
- [ ] Verify no other menus visible
- [ ] Verify correct buttons show on each page

### Test 4: No Permissions
- [ ] Create user with NO permissions selected
- [ ] Login as this user
- [ ] Verify ONLY "Dashboard" and "Support" menus show
- [ ] Verify no other menus or features visible

---

## Summary

| User Type | Permission Source | Menu Visibility |
|-----------|------------------|-----------------|
| **tenant_admin** | Bypassed (always true) | ALL menus |
| **Any other role** | ONLY explicitly assigned | ONLY granted permissions |

**Key Principle:**
> The frontend trusts the backend to send the correct permissions. It does NOT add role-based defaults. It checks ONLY what's in `user.permissions`.
