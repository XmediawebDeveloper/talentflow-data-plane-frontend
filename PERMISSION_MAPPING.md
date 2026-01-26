# Sidebar Menu Permissions Mapping

This guide shows which granular permissions need to be selected in User Management for users to see specific sidebar menu items.

## Always Visible (No Permissions Required)
- **Dashboard** - Always visible to all authenticated users
- **Support Tickets** - Always visible to all authenticated users

## RECRUITMENT Section

### Job Descriptions (`/recruitment/job-openings`)
**Required Permission:** `Create Job Descriptions` (canCreateJD)

### Resume Scoring (`/recruitment/resume-scoring`)
**Required Permission:** `View Resumes` (canViewResumes)

### AI Talent Match (`/recruitment/ai-talent-match`)
**Required Permission:** `View Resumes` (canViewResumes)

## RESUME MANAGEMENT Section

### My Resumes (`/recruitment/my-resumes`)
**Required Permission:** `Upload Resumes` (canUploadResumes)

### Internal Database (`/recruitment/resume-database`)
**Required Permission:** `Access Internal Database` (canAccessInternalDB)

## EVALUATION Section

### Assessments (`/recruitment/assessments`)
**Required Permission:** `Create Assessments` (canCreateAssessments)

### AI Interviews (`/recruitment/ai-interviews`)
**Required Permission:** `View Resumes` (canViewResumes)

## ORGANIZATION Section

### Company Profile (`/organization/company-profile`)
**Required Permission:** `Manage Settings` (canManageSettings)

### Team Management (`/organization/team-management`)
**Required Permission:** `Manage Users` (canManageUsers)

### User Management (`/organization/user-management`)
**Required Permission:** `Manage Users` (canManageUsers)

### Role Management (`/organization/role-management`)
**Required Permission:** **TENANT ADMIN ONLY** (adminOnly)
**Note:** This menu is restricted to tenant_admin role only for security. Role Management allows creating/editing roles with custom permissions, which is more powerful than User Management.

## MASTERS Section

### Experience Levels (`/masters/experience-levels`)
**Required Permission:** `Manage Settings` (canManageSettings)

### Education Levels (`/masters/education-levels`)
**Required Permission:** `Manage Settings` (canManageSettings)

### Industry Types (`/masters/industry-types`)
**Required Permission:** `Manage Settings` (canManageSettings)

## SUBSCRIPTION & BILLING Section

### Current Plan (`/subscription/current-plan`)
**Required Permission:** `View Billing` (canViewBilling)

### Usage & Quotas (`/subscription/usage-quotas`)
**Required Permission:** `View Usage` (canViewUsage)

### Payment Methods (`/subscription/payment-methods`)
**Required Permission:** `View Billing` (canViewBilling)

### Billing History (`/subscription/billing-history`)
**Required Permission:** `View Invoices` (canViewInvoices)

### Refund History (`/subscription/refund-history`)
**Required Permission:** `View Invoices` (canViewInvoices)

### Dispute History (`/subscription/dispute-history`)
**Required Permission:** `View Invoices` (canViewInvoices)

## SETTINGS Section

### General Settings (`/settings/general-settings`)
**Required Permission:** `Manage Settings` (canManageSettings)

### Permissions & Roles (`/settings/permissions`)
**Required Permission:** **TENANT ADMIN ONLY** (adminOnly)
**Note:** This menu is restricted to tenant_admin role only for security.

### API Management (`/settings/api-management`)
**Required Permission:** `Manage Settings` (canManageSettings)

### Branding & White Label (`/settings/branding`)
**Required Permission:** `Manage Settings` (canManageSettings)

### Integrations (`/settings/integrations`)
**Required Permission:** `Manage Settings` (canManageSettings)

### Security Settings (`/settings/security`)
**Required Permission:** `Manage Settings` (canManageSettings)

## REPORTS & ANALYTICS Section

### Team Usage Analytics (`/reports/team-usage`)
**Required Permission:** `View Analytics` (canViewAnalytics)

### Performance Reports (`/reports/performance-reports`)
**Required Permission:** `View Analytics` (canViewAnalytics)

## AUDITS & TRAIL Section

### Audit Trail (`/audits/trail`)
**Required Permission:** `View Analytics` (canViewAnalytics)

### Activity Logs (`/audits/activity`)
**Required Permission:** `View Analytics` (canViewAnalytics)

---

## Common Permission Combinations

### Basic Recruiter (Read Only)
Select these permissions:
- ✅ View Resumes
- ✅ View Analytics

**User will see:**
- Dashboard
- Resume Scoring
- AI Talent Match
- AI Interviews
- Team Usage Analytics
- Performance Reports
- Audit Trail
- Activity Logs
- Support Tickets

### Active Recruiter (Read + Write)
Select these permissions:
- ✅ Create Job Descriptions
- ✅ Upload Resumes
- ✅ View Resumes
- ✅ Access Internal Database
- ✅ Create Assessments
- ✅ View Analytics

**User will see:**
- Dashboard
- Job Descriptions
- Resume Scoring
- AI Talent Match
- My Resumes
- Internal Database
- Assessments
- AI Interviews
- Team Usage Analytics
- Performance Reports
- Audit Trail
- Activity Logs
- Support Tickets

### Billing Manager
Select these permissions:
- ✅ View Billing
- ✅ View Invoices
- ✅ View Usage
- ✅ View Analytics

**User will see:**
- Dashboard
- Current Plan
- Usage & Quotas
- Payment Methods
- Billing History
- Refund History
- Dispute History
- Team Usage Analytics
- Performance Reports
- Audit Trail
- Activity Logs
- Support Tickets

### Admin Assistant (User + Settings Management)
Select these permissions:
- ✅ Manage Users
- ✅ Manage Settings
- ✅ View Analytics

**User will see:**
- Dashboard
- Company Profile
- Team Management
- User Management
- Experience Levels
- Education Levels
- Industry Types
- General Settings
- API Management
- Branding & White Label
- Integrations
- Security Settings
- Team Usage Analytics
- Performance Reports
- Audit Trail
- Activity Logs
- Support Tickets

**User will NOT see (tenant_admin only):**
- ❌ Role Management
- ❌ Permissions & Roles

---

## Notes

1. **tenant_admin** bypasses all permission checks and sees everything
2. **Sections are hidden** if all items within them are filtered out
3. **Multiple permissions** can grant access to the same menu item
4. **Dashboard and Support** are always visible regardless of permissions
5. **Permission names in UI** may differ slightly from technical names, but the mapping above shows both
6. **🔐 SECURITY: Role Management and Permissions & Roles menus are tenant_admin ONLY** - These menus allow creating/editing roles with custom permissions, which is extremely powerful and should not be delegated to non-admin users

## How to Test

1. Go to **User Management**
2. Create a new user or edit existing user
3. In the **Permissions** section, select specific permissions
4. Save the user
5. Login as that user
6. Check the sidebar - only menu items matching selected permissions will appear
