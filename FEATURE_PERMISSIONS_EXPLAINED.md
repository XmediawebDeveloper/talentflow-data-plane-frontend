# 📋 Feature Permissions - Explained

## What is Feature Permissions?

**Feature Permissions** is a granular permission system that allows you to control which specific features a user can access within the TalentFlow platform, beyond their basic role permissions.

---

## Why Do We Need It?

While **Role-Based Access Control (RBAC)** gives users a set of base permissions based on their role (e.g., Admin, Recruiter, Viewer), **Feature Permissions** provides even finer control by allowing you to:

1. **Enable/Disable Specific Features** - Turn individual features on or off for specific users
2. **Customize Access** - Give users access to only the features they need
3. **Control Plan Features** - Restrict access to premium features based on subscription plan
4. **Manage Dependencies** - Automatically handle feature dependencies (e.g., "Resume Scoring" requires "Resume Upload")

---

## How It Works

### 1. Role Permissions (Base Level)
Every user has a **role** that gives them a set of base permissions:
- **Tenant Admin**: Full access to everything
- **Recruiter**: Standard access to recruiting features
- **Viewer**: Read-only access
- **Billing Manager**: Access to billing information only

### 2. Feature Flags (Granular Level)
On top of role permissions, each user can have **specific features** enabled or disabled:

| Feature Category | Examples |
|-----------------|----------|
| **Resume Management** | Resume Upload, Resume Database Access, Resume Scoring |
| **AI Features** | AI Talent Match, AI Interview |
| **Job Descriptions** | Create JD, Manage JD |
| **Assessment** | Create Assessments |
| **Analytics** | Reporting, Export Data |
| **Integration** | API Access |
| **Operations** | Bulk Operations |

---

## Example Scenarios

### Scenario 1: Standard Recruiter
**Role:** Recruiter
**Default Permissions:** Can create JDs, upload resumes, view candidates

**Custom Feature Permissions:**
- ✅ Enable "AI Talent Match" (premium feature)
- ✅ Enable "Resume Scoring"
- ❌ Disable "Export Data" (sensitive operation)

**Result:** This recruiter gets AI-powered features but cannot export data.

---

### Scenario 2: Junior Recruiter
**Role:** Recruiter
**Default Permissions:** Can create JDs, upload resumes, view candidates

**Custom Feature Permissions:**
- ❌ Disable "Bulk Operations" (risky for new users)
- ❌ Disable "API Access"
- ✅ Enable "Resume Database Access" (read-only database access)

**Result:** This recruiter has limited access suitable for training.

---

### Scenario 3: Data Analyst
**Role:** Viewer (read-only)
**Default Permissions:** Can only view dashboards and reports

**Custom Feature Permissions:**
- ✅ Enable "Reporting" (view detailed analytics)
- ✅ Enable "Export Data" (export reports to Excel/PDF)

**Result:** This user can analyze data and export reports, but cannot modify anything.

---

## Feature Dependencies

Some features **depend on other features** to work properly. The system automatically handles these dependencies:

### Example: AI Talent Match
To use "AI Talent Match", you need:
1. Resume Database Access (must be enabled)
2. Resume Upload (must be enabled)

**When you enable "AI Talent Match":**
- If "Resume Database Access" is disabled → System auto-enables it
- If "Resume Upload" is disabled → System auto-enables it

### Example: Resume Scoring
To use "Resume Scoring", you need:
1. Resume Upload (must be enabled)
2. Resume Database Access (must be enabled)

---

## How to Use Feature Permissions

### Step 1: Open Feature Permissions Manager
1. Go to **Users** page
2. Find the user you want to manage
3. Click the **Settings icon** (⚙️) button in the Actions column
4. This opens the **Feature Permissions Manager**

### Step 2: Review Current Features
The manager shows all available features grouped by category:
- ✅ **Green toggle** = Feature is enabled
- ⚫ **Gray toggle** = Feature is disabled
- 🔒 **Lock icon** = Feature is locked (required by another enabled feature)
- "Not in plan" badge = Feature not available in current subscription plan

### Step 3: Enable/Disable Features
1. Toggle any feature on or off
2. If a feature has dependencies, they will be auto-enabled (if "Auto-enable dependencies" is ON)
3. Review the changes summary at the bottom
4. Click **Save Changes**

### Step 4: Verify Changes
After saving, the user's permissions are updated immediately. They may need to log out and log back in to see the changes.

---

## Important Notes

### ⚠️ Viewer Role Restriction
Users with the **Viewer** role have **Permission Expansion Blocked**. This means:
- You cannot modify their feature permissions
- They are read-only by design
- If you need to give them more access, change their role first

### 🔒 Locked Features
Some features cannot be disabled if other enabled features depend on them:
- **Example:** If "AI Talent Match" is enabled, you cannot disable "Resume Database Access"
- **Reason:** Disabling it would break the AI Talent Match feature
- **Solution:** Disable dependent features first, then disable the dependency

### 📦 Plan Restrictions
Features marked as **"Not in plan"** cannot be enabled:
- These are premium features not included in your current subscription
- Contact admin to upgrade plan to access these features

---

## Use Cases

### Use Case 1: Onboarding New Users
When a new recruiter joins:
1. Create user with "Recruiter" role
2. Open Feature Permissions
3. Disable advanced features like "Bulk Operations", "API Access"
4. Enable only essential features
5. Gradually enable more features as they get trained

### Use Case 2: Temporary Access
Give a contractor temporary access:
1. Create user with "Viewer" role
2. Change role to "Standard User" (zero default permissions)
3. Enable only the specific features they need for their project
4. Disable those features when project ends

### Use Case 3: Plan-Based Access
Manage features based on subscription plan:
1. Free Plan users: Disable "AI Interview", "Export Data", "API Access"
2. Pro Plan users: Enable all AI features
3. Enterprise users: Enable everything including "API Access"

---

## Technical Details

### Backend Implementation
Feature permissions are stored in the database and checked on every API request:
- Each user has a `feature_flags` field containing enabled features
- Backend validates feature access before allowing operations
- Features are checked against both role permissions and feature flags

### Frontend Implementation
The Feature Permissions Manager:
- Fetches available features from the API (`/tenant-admin/feature-flags/available`)
- Fetches user's current features (`/tenant-admin/users/{userId}/feature-flags`)
- Groups features by category for better UX
- Handles dependency validation and auto-enabling
- Saves changes via bulk update API

### Dependency Enforcement
The system uses a **dependency matrix** to track relationships:
```
{
  "resume_scoring": ["resume_upload", "resume_database_access"],
  "ai_talent_match": ["resume_database_access"],
  "ai_interview": ["assessment"],
  "bulk_operations": ["resume_database_access"],
  "export_data": ["reporting"]
}
```

---

## Troubleshooting

### Error: "Cannot read properties of undefined (reading 'map')"
**Cause:** Backend API is not returning feature data in the expected format
**Solution:**
1. Check if backend is running
2. Verify API endpoints `/tenant-admin/feature-flags/available` and `/tenant-admin/users/{userId}/feature-flags` exist
3. Check browser console for API error messages
4. This error is now fixed with safety checks in the code

### Error: "Permission expansion is blocked for this user role"
**Cause:** User has "Viewer" role which is read-only
**Solution:** Change user's role to "Recruiter" or "Standard User" first, then modify feature permissions

### Feature Toggle is Disabled/Grayed Out
**Possible Reasons:**
1. **Locked by dependency** - Another enabled feature requires this feature
2. **Not in plan** - Feature not available in current subscription
3. **Role restriction** - User's role doesn't allow this feature

---

## Best Practices

### 1. Start with Minimal Permissions
Give users only the features they need initially. Add more as needed.

### 2. Use Auto-Enable Dependencies
Keep "Auto-enable dependencies" turned ON to avoid breaking features.

### 3. Document Custom Permissions
Keep a record of which users have custom feature permissions and why.

### 4. Review Periodically
Audit user permissions quarterly to ensure they still match job requirements.

### 5. Test Before Production
Test feature permission changes in a staging environment first.

---

## Summary

**Feature Permissions** provides granular control over what users can do in TalentFlow:
- ✅ **Flexible** - Customize access per user
- ✅ **Intelligent** - Automatic dependency management
- ✅ **Safe** - Prevents breaking changes
- ✅ **Plan-Aware** - Respects subscription limits
- ✅ **User-Friendly** - Simple toggle interface

Use it to create the perfect access configuration for each user's role and responsibilities!

---

**Questions?** Contact your system administrator or refer to the backend API documentation for more technical details.
