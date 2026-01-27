# Permission Quick Reference Table

| Sidebar Menu Item | Permission Required | Permission Code |
|------------------|-------------------|----------------|
| **Dashboard** | *(Always Visible)* | - |
| **RECRUITMENT** | | |
| Job Descriptions | Create Job Descriptions | `canCreateJD` |
| Resume Scoring | View Resumes | `canViewResumes` |
| AI Talent Match | View Resumes | `canViewResumes` |
| **RESUME MANAGEMENT** | | |
| My Resumes | Upload Resumes | `canUploadResumes` |
| Internal Database | Access Internal Database | `canAccessInternalDB` |
| **EVALUATION** | | |
| Assessments | Create Assessments | `canCreateAssessments` |
| AI Interviews | View Resumes | `canViewResumes` |
| **ORGANIZATION** | | |
| Company Profile | Manage Settings | `canManageSettings` |
| Team Management | Manage Users | `canManageUsers` |
| User Management | Manage Users | `canManageUsers` |
| Role Management | **TENANT ADMIN ONLY** | `adminOnly` |
| **MASTERS** | | |
| Experience Levels | Manage Settings | `canManageSettings` |
| Education Levels | Manage Settings | `canManageSettings` |
| Industry Types | Manage Settings | `canManageSettings` |
| **SUBSCRIPTION & BILLING** | | |
| Current Plan | View Billing | `canViewBilling` |
| Usage & Quotas | View Usage | `canViewUsage` |
| Payment Methods | View Billing | `canViewBilling` |
| Billing History | View Invoices | `canViewInvoices` |
| Refund History | View Invoices | `canViewInvoices` |
| Dispute History | View Invoices | `canViewInvoices` |
| **SETTINGS** | | |
| General Settings | Manage Settings | `canManageSettings` |
| Permissions & Roles | **TENANT ADMIN ONLY** | `adminOnly` |
| API Management | Manage Settings | `canManageSettings` |
| Branding & White Label | Manage Settings | `canManageSettings` |
| Integrations | Manage Settings | `canManageSettings` |
| Security Settings | Manage Settings | `canManageSettings` |
| **REPORTS & ANALYTICS** | | |
| Team Usage Analytics | View Analytics | `canViewAnalytics` |
| Performance Reports | View Analytics | `canViewAnalytics` |
| **AUDITS & TRAIL** | | |
| Audit Trail | View Analytics | `canViewAnalytics` |
| Activity Logs | View Analytics | `canViewAnalytics` |
| **SUPPORT** | | |
| Support Tickets | *(Always Visible)* | - |

---

## Permission Groups (What They Control)

### 📝 `canCreateJD` (Create Job Descriptions)
- Job Descriptions menu

### 👀 `canViewResumes` (View Resumes)
- Resume Scoring menu
- AI Talent Match menu
- AI Interviews menu

### 📤 `canUploadResumes` (Upload Resumes)
- My Resumes menu

### 🗄️ `canAccessInternalDB` (Access Internal Database)
- Internal Database menu

### ✅ `canCreateAssessments` (Create Assessments)
- Assessments menu

### 📊 `canViewAnalytics` (View Analytics)
- Team Usage Analytics menu
- Performance Reports menu
- Audit Trail menu
- Activity Logs menu

### ⚙️ `canManageSettings` (Manage Settings)
- Company Profile menu
- Experience Levels menu
- Education Levels menu
- Industry Types menu
- General Settings menu
- API Management menu
- Branding & White Label menu
- Integrations menu
- Security Settings menu

### 👥 `canManageUsers` (Manage Users)
- Team Management menu
- User Management menu

### 🔐 **Admin Only** (tenant_admin role required)
- Role Management menu
- Permissions & Roles menu

### 💳 `canViewBilling` (View Billing)
- Current Plan menu
- Payment Methods menu

### 🧾 `canViewInvoices` (View Invoices)
- Billing History menu
- Refund History menu
- Dispute History menu

### 📈 `canViewUsage` (View Usage)
- Usage & Quotas menu

---

## Example: Creating a Basic Recruiter

**Goal:** User should only see recruitment-related menus

**Permissions to Select:**
1. ✅ View Resumes
2. ✅ Upload Resumes
3. ✅ Create Job Descriptions
4. ✅ Access Internal Database
5. ✅ Create Assessments

**Result - User will see:**
- Dashboard
- Job Descriptions
- Resume Scoring
- AI Talent Match
- My Resumes
- Internal Database
- Assessments
- AI Interviews
- Support Tickets

**User will NOT see:**
- Organization section
- Masters section
- Subscription & Billing section
- Settings section
- Reports & Analytics section
- Audits & Trail section
