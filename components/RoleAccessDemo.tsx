import { Shield, CheckCircle, XCircle, Info } from 'lucide-react';
import { User } from '@/lib/types/tenant';

interface RoleAccessDemoProps {
  user: User;
}

export default function RoleAccessDemo({ user }: RoleAccessDemoProps) {
  const roleLabels = {
    tenant_admin: 'Tenant Admin',
    recruiter: 'Recruiter',
    viewer: 'Viewer',
  };

  const permissions = [
    { key: 'canCreateJD', label: 'Create & Manage Job Descriptions' },
    { key: 'canUploadResumes', label: 'Upload Resumes' },
    { key: 'canViewResumes', label: 'View Resumes' },
    { key: 'canCreateAssessments', label: 'Create Assessments' },
    { key: 'canViewAnalytics', label: 'View Analytics' },
    { key: 'canManageSettings', label: 'Manage Settings' },
    { key: 'canManageUsers', label: 'Manage Users' },
  ];

  return (
    <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
      <div className="flex items-start gap-3">
        <Shield className="w-5 h-5 text-gray-800 flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <h4 className="text-blue-900 mb-2 flex items-center gap-2">
            Role-Based Access Control
            <span className="px-2 py-0.5 bg-gray-800 text-white text-xs rounded">
              {roleLabels[user.role]}
            </span>
          </h4>
          <p className="text-sm text-blue-800 mb-3">
            Your current role determines what actions you can perform in the system.
          </p>
          
          <div className="bg-white bg-opacity-60 rounded-lg p-3 space-y-2">
            {permissions.map((permission) => {
              const hasPermission = user.permissions[permission.key as keyof typeof user.permissions];
              return (
                <div key={permission.key} className="flex items-center gap-2 text-sm">
                  {hasPermission ? (
                    <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0" />
                  ) : (
                    <XCircle className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  )}
                  <span className={hasPermission ? 'text-gray-900' : 'text-gray-500'}>
                    {permission.label}
                  </span>
                </div>
              );
            })}
          </div>
          
          <div className="mt-3 flex items-start gap-2 text-xs text-gray-900">
            <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
            <span>
              Try logging in with different demo accounts to see how permissions change. Contact your Tenant Admin to request additional permissions.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
