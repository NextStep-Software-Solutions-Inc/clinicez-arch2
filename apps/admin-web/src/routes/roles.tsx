import React, { useEffect, useState, useMemo } from 'react';
import { createRoute } from '@tanstack/react-router';
import { Route as authRoute } from './_auth';
import {
  adminService,
  AdminRoleDto,
  PermissionDefinitionDto,
} from '@/services/admin.service';
import { DEFAULT_PERMISSION_DEFINITIONS } from '@/constants/permissions';
import { toast } from 'sonner';
import {
  IconShieldCheck,
  IconRefresh,
  IconPlus,
  IconEdit,
  IconTrash,
  IconSearch,
  IconAlertCircle,
  IconLock,
  IconLoader,
  IconX,
  IconCheck,
} from '@tabler/icons-react';

function isSuperAdminRole(name: string): boolean {
  const n = name.trim().toLowerCase();
  return n === 'super admin' || n === 'superadmin' || n === 'super_admin';
}

function RolesPage() {
  const [roles, setRoles] = useState<AdminRoleDto[]>([]);
  const [permissions, setPermissions] = useState<PermissionDefinitionDto[]>(
    DEFAULT_PERMISSION_DEFINITIONS as any
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  // Role editor dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<AdminRoleDto | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  // Delete dialog state
  const [roleToDelete, setRoleToDelete] = useState<AdminRoleDto | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [r, p] = await Promise.all([
        adminService.getRoles(),
        adminService.getPermissions().catch(() => DEFAULT_PERMISSION_DEFINITIONS as any),
      ]);
      setRoles(r);
      if (p && p.length > 0) {
        setPermissions(p);
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to load roles and RBAC definitions.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleOpenCreate = () => {
    setEditingRole(null);
    setName('');
    setDescription('');
    setSelectedPermissions([]);
    setDialogOpen(true);
  };

  const handleOpenEdit = (role: AdminRoleDto) => {
    if (isSuperAdminRole(role.name)) {
      toast.error('The Super Admin system role is permanently protected and cannot be modified.');
      return;
    }
    setEditingRole(role);
    setName(role.name);
    setDescription(role.description || '');
    setSelectedPermissions(role.permissions || []);
    setDialogOpen(true);
  };

  const handleTogglePermission = (permKey: string) => {
    setSelectedPermissions((prev) =>
      prev.includes(permKey) ? prev.filter((p) => p !== permKey) : [...prev, permKey]
    );
  };

  const handleSaveRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('Role name is required.');
      return;
    }

    setSaving(true);
    try {
      const payload: Partial<AdminRoleDto> = {
        name: name.trim(),
        description: description.trim(),
        permissions: selectedPermissions,
      };

      if (editingRole) {
        await adminService.updateRole(editingRole.id, payload);
        toast.success(`Role '${name}' updated.`);
      } else {
        await adminService.createRole(payload);
        toast.success(`Role '${name}' created.`);
      }
      setDialogOpen(false);
      await loadData();
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.message || 'Failed to save role');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteRole = async () => {
    if (!roleToDelete) return;
    if (isSuperAdminRole(roleToDelete.name)) {
      toast.error('The Super Admin system role cannot be deleted.');
      setRoleToDelete(null);
      return;
    }

    setDeleting(true);
    try {
      await adminService.deleteRole(roleToDelete.id);
      toast.success(`Role '${roleToDelete.name}' deleted.`);
      setRoleToDelete(null);
      await loadData();
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.message || 'Failed to delete role');
    } finally {
      setDeleting(false);
    }
  };

  const filteredRoles = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return roles;
    return roles.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        (r.description && r.description.toLowerCase().includes(q))
    );
  }, [roles, search]);

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-text">Roles & Access Control</h1>
          <p className="text-xs text-text-muted mt-1">
            Role-based access boundaries (RBAC), administrative permissions, and SuperAdmin protection.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={loadData}
            disabled={loading}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-text-secondary bg-surface border border-border hover:bg-surface-muted rounded-xl transition-colors cursor-pointer"
          >
            <IconRefresh className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
          <button
            type="button"
            onClick={handleOpenCreate}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-primary hover:bg-primary-hover rounded-xl transition-colors cursor-pointer shadow-xs"
          >
            <IconPlus className="h-4 w-4" />
            <span>New Custom Role</span>
          </button>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-xs text-red-600 dark:text-red-400 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <IconAlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={loadData}
            className="px-3 py-1 font-semibold rounded-lg bg-red-500/20 hover:bg-red-500/30 transition-colors cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      {/* Search Bar */}
      <div className="p-4 rounded-2xl bg-surface border border-border flex items-center justify-between gap-3">
        <div className="relative w-full sm:w-80">
          <IconSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search roles by title..."
            className="w-full pl-10 pr-4 py-2 text-xs rounded-xl bg-surface-muted border border-border text-text placeholder:text-text-muted focus:outline-hidden focus:ring-1 focus:ring-primary"
          />
        </div>
        <div className="text-xs text-text-muted font-medium">
          {filteredRoles.length} {filteredRoles.length === 1 ? 'role' : 'roles'} registered
        </div>
      </div>

      {/* 4-State Roles Grid */}
      {loading ? (
        /* Skeleton Grid */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="p-5 rounded-2xl bg-surface border border-border space-y-4 animate-pulse"
            >
              <div className="flex justify-between">
                <div className="h-5 w-28 bg-surface-muted rounded-md" />
                <div className="h-4 w-16 bg-surface-muted rounded-md" />
              </div>
              <div className="h-3 w-44 bg-surface-muted rounded-md" />
              <div className="pt-3 border-t border-border flex gap-1.5">
                <div className="h-5 w-16 bg-surface-muted rounded-md" />
                <div className="h-5 w-20 bg-surface-muted rounded-md" />
              </div>
            </div>
          ))}
        </div>
      ) : filteredRoles.length === 0 ? (
        /* Empty State */
        <div className="p-12 rounded-2xl bg-surface border border-dashed border-border text-center space-y-3">
          <div className="inline-flex p-3 rounded-2xl bg-surface-muted text-text-muted">
            <IconShieldCheck className="h-8 w-8" />
          </div>
          <h3 className="font-bold text-sm text-text">No Roles Found</h3>
          <p className="text-xs text-text-muted max-w-sm mx-auto">
            {search
              ? 'No administrative roles match your search query.'
              : 'Zero custom administrative roles currently exist. Define a custom role to configure permissions.'}
          </p>
          <div className="pt-2">
            <button
              type="button"
              onClick={handleOpenCreate}
              className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-semibold text-white bg-primary hover:bg-primary-hover rounded-xl transition-colors cursor-pointer shadow-xs"
            >
              <IconPlus className="h-4 w-4" />
              <span>Create New Role</span>
            </button>
          </div>
        </div>
      ) : (
        /* Active Cards Grid */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredRoles.map((role) => {
            const isSuper = isSuperAdminRole(role.name);

            return (
              <div
                key={role.id}
                className="p-5 rounded-2xl bg-surface border border-border flex flex-col justify-between space-y-4 hover:shadow-md transition-all"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-sm text-text">{role.name}</h3>
                      {isSuper && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                          <IconLock className="h-3 w-3" />
                          SuperAdmin
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-primary-subtle text-primary border border-primary/20">
                      {role.permissions?.length ?? 0} Scopes
                    </span>
                  </div>

                  <p className="text-xs text-text-muted leading-relaxed line-clamp-2">
                    {role.description || 'Administrative platform access permissions profile.'}
                  </p>
                </div>

                <div className="space-y-3 pt-3 border-t border-border">
                  <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                    {role.permissions?.slice(0, 8).map((perm) => (
                      <span
                        key={perm}
                        className="text-[10px] px-2 py-0.5 rounded-md bg-surface-muted border border-border text-text-secondary font-mono"
                      >
                        {perm}
                      </span>
                    ))}
                    {(role.permissions?.length ?? 0) > 8 && (
                      <span className="text-[10px] text-text-muted font-mono pl-1">
                        + {(role.permissions?.length ?? 0) - 8} more
                      </span>
                    )}
                  </div>

                  <div className="pt-2 border-t border-border flex items-center justify-end gap-2">
                    {!isSuper ? (
                      <>
                        <button
                          type="button"
                          onClick={() => handleOpenEdit(role)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-text-secondary hover:text-text bg-surface-muted hover:bg-surface border border-border rounded-xl transition-colors cursor-pointer"
                        >
                          <IconEdit className="h-3.5 w-3.5" />
                          <span>Edit</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setRoleToDelete(role)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-500/10 rounded-xl transition-colors cursor-pointer"
                        >
                          <IconTrash className="h-3.5 w-3.5" />
                          <span>Delete</span>
                        </button>
                      </>
                    ) : (
                      <span className="text-[11px] text-text-muted font-medium flex items-center gap-1">
                        <IconLock className="h-3 w-3" />
                        System Protected
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Role Editor Dialog */}
      {dialogOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
          onClick={() => setDialogOpen(false)}
        >
          <div
            className="w-full max-w-2xl bg-surface border border-border rounded-2xl shadow-2xl overflow-hidden flex flex-col text-text"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-5 border-b border-border">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-primary-subtle text-primary">
                  <IconShieldCheck className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-text">
                    {editingRole ? `Edit Role: ${editingRole.name}` : 'Create New Administrative Role'}
                  </h2>
                  <p className="text-xs text-text-muted">Configure granular RBAC permissions</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDialogOpen(false)}
                className="p-1 rounded-lg text-text-muted hover:text-text cursor-pointer"
              >
                <IconX className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSaveRole} className="flex flex-col">
              <div className="p-6 max-h-[68vh] overflow-y-auto space-y-4 text-xs">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="font-semibold text-text">Role Name</label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g. Clinical Auditor"
                      className="w-full px-3 py-2 rounded-xl bg-surface-muted border border-border text-text focus:outline-hidden"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="font-semibold text-text">Description</label>
                    <input
                      type="text"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="e.g. Read-only oversight across multi-facility clinics"
                      className="w-full px-3 py-2 rounded-xl bg-surface-muted border border-border text-text focus:outline-hidden"
                    />
                  </div>
                </div>

                {/* Permissions Checkbox Matrix */}
                <div className="space-y-2 pt-2">
                  <div className="flex items-center justify-between border-b border-border pb-1">
                    <label className="font-semibold text-text">Permission Matrix ({selectedPermissions.length} selected)</label>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedPermissions(permissions.map((p) => p.name))}
                        className="text-[11px] text-primary hover:underline font-medium cursor-pointer"
                      >
                        Select All
                      </button>
                      <span className="text-text-muted">•</span>
                      <button
                        type="button"
                        onClick={() => setSelectedPermissions([])}
                        className="text-[11px] text-text-muted hover:text-text cursor-pointer"
                      >
                        Clear All
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    {permissions.map((perm) => {
                      const isSelected = selectedPermissions.includes(perm.name);

                      return (
                        <label
                          key={perm.name}
                          className={`flex items-start gap-3 p-3 rounded-xl border transition-colors cursor-pointer ${
                            isSelected
                              ? 'border-primary bg-primary-subtle/30 text-text'
                              : 'border-border bg-surface-muted/50 hover:bg-surface-muted text-text-secondary'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleTogglePermission(perm.name)}
                            className="mt-0.5 rounded text-primary focus:ring-primary h-4 w-4"
                          />
                          <div className="space-y-0.5">
                            <div className="font-mono font-semibold text-xs text-text">{perm.name}</div>
                            <div className="text-[11px] text-text-muted leading-relaxed">
                              {perm.description}
                            </div>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="p-4 bg-surface-muted border-t border-border flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setDialogOpen(false)}
                  disabled={saving}
                  className="px-4 py-2 text-xs font-medium text-text-secondary hover:text-text rounded-xl transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center gap-2 px-5 py-2 text-xs font-semibold text-white bg-primary hover:bg-primary-hover rounded-xl transition-colors cursor-pointer shadow-xs disabled:opacity-50"
                >
                  {saving && <IconLoader className="h-4 w-4 animate-spin" />}
                  <span>{editingRole ? 'Save Role Changes' : 'Create Custom Role'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {roleToDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
          onClick={() => setRoleToDelete(null)}
        >
          <div
            className="w-full max-w-md bg-surface border border-border rounded-2xl shadow-2xl p-6 text-text space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-xl bg-red-500/10 text-red-600 dark:text-red-400">
                <IconTrash className="h-6 w-6" />
              </div>
              <div>
                <h3 className="font-bold text-base text-text">Delete Custom Role</h3>
                <p className="text-xs text-text-muted">ClinicEZ Security Governance</p>
              </div>
            </div>

            <p className="text-xs text-text-secondary leading-relaxed">
              Are you sure you want to permanently delete custom role &ldquo;{roleToDelete.name}&rdquo;? Administrators currently assigned to this role will lose their granted permissions.
            </p>

            <div className="flex items-center justify-end gap-3 pt-2 border-t border-border">
              <button
                type="button"
                onClick={() => setRoleToDelete(null)}
                className="px-4 py-2 text-xs font-medium text-text-secondary hover:text-text rounded-xl transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteRole}
                disabled={deleting}
                className="inline-flex items-center gap-2 px-5 py-2 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-xl transition-colors cursor-pointer shadow-xs disabled:opacity-50"
              >
                {deleting && <IconLoader className="h-4 w-4 animate-spin" />}
                <span>Confirm Delete</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export const Route = createRoute({
  getParentRoute: () => authRoute,
  path: 'roles',
  component: RolesPage,
});
