# 📊 Role Hierarchy - Explained

## Role Hierarchy in TalentFlow

### 1. Tenant Admin (Super Admin) 👑
**Highest Privilege Level**

- **Cannot be managed:** No Edit, Delete, or Feature Permissions buttons
- **Has all permissions automatically:** No need for granular feature management
- **Can create ALL roles:** Including Admin, Recruiter, Viewer, Standard User, Billing Manager
- **Can manage all users:** Edit, delete, and control feature permissions for ALL other users
- **Cannot self-manage:** Cannot edit/delete themselves (prevents lockout)

### 2. Admin (Manageable Admin Role) ⭐
**Regular manageable role created by Tenant Admin**

- **CAN be managed:** Has Edit, Delete, and Feature Permissions buttons
- **Created by Tenant Admin:** Only Tenant Admin can create Admin users
- **Has elevated permissions:** Similar to Tenant Admin but manageable
- **Feature permissions controllable:** Tenant Admin can enable/disable specific features
- **Can be deleted:** Tenant Admin can remove Admin users if needed

### 3. Regular Roles 👥
**Standard roles with limited permissions**

- **Recruiter:** Standard recruiting access
- **Viewer:** Read-only access
- **Standard User:** Minimal default permissions
- **Billing Manager:** Billing information access only

**All regular roles:**
- CAN be managed by Tenant Admin (all buttons visible)
- NEED explicit feature permission grants
- CAN be edited, deleted, and have features controlled

---

## Visual Representation

```
┌─────────────────────────────────────────────────────┐
│                   TENANT ADMIN                       │
│              (Super Admin - Level 1)                 │
│                                                      │
│  ✅ Can create ALL roles (including Admin)          │
│  ✅ Can manage ALL users                            │
│  ✅ Has ALL permissions by default                  │
│  ❌ CANNOT be managed (no buttons on their row)    │
└──────────────┬──────────────────────────────────────┘
               │ Creates & Manages
               ▼
┌──────────────────────────────────────────────────────┐
│           ADMIN (Regular Manageable Role)            │
│                    (Level 2)                         │
│                                                      │
│  ✅ Has elevated permissions                         │
│  ✅ CAN be managed by Tenant Admin                  │
│  ✅ Has Feature Permissions, Edit, Delete buttons   │
│  ✅ Feature permissions controllable                │
└──────────────┬───────────────────────────────────────┘
               │
               │ Same level as
               ▼
┌──────────────────────────────────────────────────────┐
│        REGULAR ROLES (Recruiter, Viewer, etc.)       │
│                    (Level 2)                         │
│                                                      │
│  ✅ Limited permissions by default                   │
│  ✅ CAN be managed by Tenant Admin                  │
│  ✅ Has Feature Permissions, Edit, Delete buttons   │
│  ✅ Need explicit permission grants                 │
└──────────────────────────────────────────────────────┘
```

---

## Button Visibility Matrix

| User Role | Feature Permissions (⚙️) | Edit (✏️) | Delete (🗑️) | Who Can Create |
|-----------|-------------------------|-----------|-------------|----------------|
| **Tenant Admin** | ❌ Hidden | ❌ Hidden | ❌ Hidden | System/Signup |
| **Admin** | ✅ Visible | ✅ Visible | ✅ Visible | Tenant Admin |
| Recruiter | ✅ Visible | ✅ Visible | ✅ Visible | Tenant Admin |
| Viewer | ✅ Visible | ✅ Visible | ✅ Visible | Tenant Admin |
| Standard User | ✅ Visible | ✅ Visible | ✅ Visible | Tenant Admin |
| Billing Manager | ✅ Visible | ✅ Visible | ✅ Visible | Tenant Admin |
| **Current User** | ❌ Hidden | ❌ Hidden | ❌ Hidden | N/A |

**Notes:**
- "Current User" = Any user viewing their own row (prevents self-management)
- Only **Tenant Admin** can create **Admin** users
- Tenant Admin can create ALL other roles too

---

## Permission Inheritance

### Tenant Admin
```
Tenant Admin
├── ALL Features Enabled (automatic)
├── Cannot be modified
└── No feature management needed
```

### Admin (Manageable)
```
Admin (Created by Tenant Admin)
├── Feature Permissions can be customized
├── Can be granted specific features
├── Can be restricted from certain features
└── Manageable by Tenant Admin
```

### Regular Roles
```
Recruiter / Viewer / Standard User / Billing Manager
├── Limited default permissions
├── Feature Permissions can be customized
├── Need explicit grants for additional features
└── Fully manageable by Tenant Admin
```

---

## Key Differences: Tenant Admin vs Admin

| Aspect | Tenant Admin | Admin |
|--------|-------------|-------|
| **Privilege Level** | Super Admin (Highest) | Elevated (Manageable) |
| **Can be managed?** | ❌ No | ✅ Yes |
| **Feature Permissions** | All by default | Customizable |
| **Who creates them?** | System/Signup | Tenant Admin |
| **Can edit other users?** | ✅ Yes | Depends on permissions |
| **Can delete other users?** | ✅ Yes | Depends on permissions |
| **Action buttons visible?** | ❌ No | ✅ Yes |
| **Can self-manage?** | ❌ No | ❌ No |

---

## Use Cases

### When to Use Tenant Admin
- **Organization owner/founder**
- **CTO or IT Director** managing the entire platform
- **Person who signed up** for the TalentFlow account
- **One per tenant** (or very few)

**Example:**
> John is the CEO who signed up for TalentFlow. He is the Tenant Admin with full control over everything.

### When to Use Admin Role
- **HR Director** who needs elevated access but should be manageable
- **Department Head** who needs broad permissions
- **Senior Manager** who needs admin-like access but not full control
- **Multiple per tenant** (as needed)

**Example:**
> Sarah is the HR Director. The Tenant Admin (CEO) created an Admin account for her with most features enabled, but the CEO can still manage Sarah's permissions and remove her if needed.

### When to Use Regular Roles
- **Recruiters** - Standard recruiting work
- **Hiring Managers** - Review candidates (Viewer role)
- **Finance Team** - Billing access only (Billing Manager)
- **Contractors** - Limited access (Standard User with specific features)

---

## Creating Users by Role

### Tenant Admin Can Create:
✅ **Admin** - Elevated manageable role
✅ **Recruiter** - Standard recruiting role
✅ **Viewer** - Read-only access
✅ **Standard User** - Minimal permissions
✅ **Billing Manager** - Billing information access

### Admin Can Create (if given permission):
- Depends on their feature permissions
- May be restricted from creating certain roles
- Tenant Admin controls this via Feature Permissions

---

## Security Implications

### Protection Mechanisms

1. **Tenant Admin Cannot Be Deleted**
   - No Delete button visible
   - Prevents lockout scenario
   - Protects organization ownership

2. **Tenant Admin Cannot Edit Self**
   - No Edit button on own row
   - Prevents accidental permission loss
   - Maintains system stability

3. **Admin Users Are Manageable**
   - Tenant Admin retains control
   - Can remove compromised accounts
   - Can adjust permissions as needed

4. **Current User Cannot Self-Manage**
   - Prevents users from elevating their own permissions
   - Security best practice
   - Requires another admin to make changes

---

## Role Assignment Flow

### New Organization Signup
```
1. User signs up for TalentFlow
   └─> Automatically becomes Tenant Admin

2. Tenant Admin creates team members
   ├─> Create Admin (HR Director)
   ├─> Create Recruiters (HR Team)
   ├─> Create Viewers (Hiring Managers)
   └─> Create Billing Manager (Finance)

3. Tenant Admin configures permissions
   ├─> Enable AI features for Admin
   ├─> Enable specific features for Recruiters
   ├─> Grant reporting access to Viewers
   └─> Grant billing access to Billing Manager
```

---

## Best Practices

### 1. Minimize Tenant Admins
- Keep only 1-2 Tenant Admin accounts
- Use Admin role for other elevated users
- Easier to manage and audit

### 2. Use Admin Role for Department Heads
- Create Admin accounts for senior staff
- Customize their feature permissions
- Retain control via Tenant Admin

### 3. Regular Permission Audits
- Review Admin users quarterly
- Check feature permissions
- Remove inactive accounts

### 4. Document Role Assignments
- Keep track of who has Admin role
- Document why they need elevated access
- Review when people change positions

---

## Comparison with Other Platforms

| Platform | Super Admin | Manageable Admin | Regular Users |
|----------|-------------|------------------|---------------|
| **TalentFlow** | Tenant Admin | Admin | Recruiter, Viewer, etc. |
| **Slack** | Workspace Owner | Workspace Admin | Members |
| **Microsoft 365** | Global Admin | Admin Roles | Users |
| **Salesforce** | System Administrator | Standard User (with elevated permissions) | Standard User |

---

## Frequently Asked Questions

### Q1: Can I have multiple Tenant Admins?
**A:** Yes, but it's not recommended. Keep Tenant Admins to 1-2 for better control. Use Admin role for others.

### Q2: Can Admin users create other Admins?
**A:** No. Only Tenant Admin can create Admin users. This maintains hierarchy control.

### Q3: Can Tenant Admin demote themselves?
**A:** No. Tenant Admin cannot edit themselves. This prevents lockout scenarios.

### Q4: What happens if I delete all Admin users?
**A:** Nothing critical. Tenant Admin can always create new Admin users. Only Tenant Admin is protected from deletion.

### Q5: Can Admin users manage Tenant Admins?
**A:** No. Tenant Admin rows have no action buttons. Only Tenant Admins can manage other Tenant Admins (if multiple exist).

### Q6: What's the difference between Admin and Tenant Admin permissions?
**A:**
- **Tenant Admin:** ALL permissions automatically, cannot be changed
- **Admin:** Permissions can be customized by Tenant Admin via Feature Permissions

---

## Summary

| Aspect | Tenant Admin | Admin | Regular Roles |
|--------|-------------|-------|---------------|
| **Level** | Super Admin (1) | Elevated (2) | Standard (2) |
| **Manageable?** | ❌ No | ✅ Yes | ✅ Yes |
| **Buttons Visible?** | ❌ No | ✅ Yes | ✅ Yes |
| **Who Creates?** | System/Signup | Tenant Admin | Tenant Admin |
| **Permissions** | All (fixed) | Customizable | Customizable |
| **Use Case** | Owner/CEO | HR Director | Recruiters/Staff |
| **Count per Tenant** | 1-2 | Few | Many |

**Key Takeaway:**
- **Tenant Admin** = Super Admin (untouchable, has all access)
- **Admin** = Elevated role (manageable by Tenant Admin)
- **Regular Roles** = Standard roles (managed by Tenant Admin)

---

**Last Updated:** 2026-01-22
**Status:** ✅ Complete
**Purpose:** Clarify role hierarchy and button visibility logic
