'use client';

import { Shield, Users, Check, X, Edit2, Save, Plus } from 'lucide-react';
import { useState } from 'react';

const permissions = [
  { id: 'canCreateJD', label: 'Create Job Descriptions', description: 'Create and publish job postings' },
  { id: 'canManageJD', label: 'Manage Job Descriptions', description: 'Edit and delete job postings' },
  { id: 'canUploadResumes', label: 'Upload Resumes', description: 'Upload candidate resumes' },
  { id: 'canViewResumes', label: 'View Resumes', description: 'View candidate resume details' },
  { id: 'canScoreResumes', label: 'Score Resumes', description: 'Use AI scoring features' },
  { id: 'canCreateAssessments', label: 'Create Assessments', description: 'Create new assessments' },
  { id: 'canViewAnalytics', label: 'View Analytics', description: 'Access analytics dashboard' },
  { id: 'canManageUsers', label: 'Manage Users', description: 'Add and remove team members' },
  { id: 'canAccessInternalDB', label: 'Access Internal Database', description: 'Access centralized resume database' },
];

const roles = [
  {
    id: 'tenant_admin',
    name: 'Administrator',
    description: 'Full access to all features',
    permissions: permissions.map(p => p.id),
    editable: false,
  },
  {
    id: 'recruiter',
    name: 'Recruiter',
    description: 'Standard recruiting functions',
    permissions: ['canCreateJD', 'canUploadResumes', 'canViewResumes', 'canScoreResumes', 'canCreateAssessments', 'canViewAnalytics'],
    editable: true,
  },
  {
    id: 'viewer',
    name: 'Viewer',
    description: 'Read-only access',
    permissions: ['canViewResumes', 'canViewAnalytics'],
    editable: true,
  },
];

export default function PermissionsPage() {
  const [selectedRole, setSelectedRole] = useState(roles[1]);
  const [isEditing, setIsEditing] = useState(false);
  const [editedPermissions, setEditedPermissions] = useState<string[]>([]);

  const startEditing = () => {
    setEditedPermissions([...selectedRole.permissions]);
    setIsEditing(true);
  };

  const togglePermission = (permissionId: string) => {
    setEditedPermissions(prev =>
      prev.includes(permissionId)
        ? prev.filter(p => p !== permissionId)
        : [...prev, permissionId]
    );
  };

  const saveChanges = () => {
    // Save logic here
    setIsEditing(false);
  };

  return (
    <main className="flex-1 p-8 overflow-y-auto bg-gradient-to-br from-gray-50 via-white to-blue-50">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-gradient-to-br from-purple-600 to-purple-700 rounded-xl flex items-center justify-center shadow-lg">
              <Shield className="w-7 h-7 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-gray-900">Permissions & Roles</h1>
              <p className="text-sm text-gray-600">Manage user roles and their permissions</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-6">
          {/* Roles List */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Roles</h2>
            <div className="space-y-3">
              {roles.map((role) => (
                <button
                  key={role.id}
                  onClick={() => {
                    setSelectedRole(role);
                    setIsEditing(false);
                  }}
                  className={`w-full p-4 rounded-lg text-left transition-colors ${
                    selectedRole.id === role.id
                      ? 'bg-blue-50 border-blue-200 border'
                      : 'hover:bg-gray-50 border border-gray-200'
                  }`}
                >
                  <p className="font-medium text-gray-900">{role.name}</p>
                  <p className="text-sm text-gray-500">{role.description}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Permissions Grid */}
          <div className="col-span-2 bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">{selectedRole.name} Permissions</h2>
                <p className="text-sm text-gray-500">{selectedRole.description}</p>
              </div>
              {selectedRole.editable && !isEditing && (
                <button
                  onClick={startEditing}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  <Edit2 className="w-4 h-4" />
                  Edit
                </button>
              )}
              {isEditing && (
                <div className="flex gap-2">
                  <button
                    onClick={() => setIsEditing(false)}
                    className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={saveChanges}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                  >
                    <Save className="w-4 h-4" />
                    Save
                  </button>
                </div>
              )}
            </div>

            <div className="space-y-3">
              {permissions.map((permission) => {
                const hasPermission = isEditing
                  ? editedPermissions.includes(permission.id)
                  : selectedRole.permissions.includes(permission.id);

                return (
                  <div
                    key={permission.id}
                    className={`flex items-center justify-between p-4 rounded-lg border ${
                      hasPermission ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'
                    }`}
                  >
                    <div>
                      <p className="font-medium text-gray-900">{permission.label}</p>
                      <p className="text-sm text-gray-500">{permission.description}</p>
                    </div>
                    {isEditing && selectedRole.editable ? (
                      <button
                        onClick={() => togglePermission(permission.id)}
                        className={`w-10 h-6 rounded-full transition-colors ${
                          hasPermission ? 'bg-green-600' : 'bg-gray-300'
                        }`}
                      >
                        <div
                          className={`w-5 h-5 bg-white rounded-full shadow-sm transform transition-transform ${
                            hasPermission ? 'translate-x-4' : 'translate-x-0.5'
                          }`}
                        />
                      </button>
                    ) : (
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                        hasPermission ? 'bg-green-100' : 'bg-gray-200'
                      }`}>
                        {hasPermission ? (
                          <Check className="w-4 h-4 text-green-600" />
                        ) : (
                          <X className="w-4 h-4 text-gray-400" />
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
