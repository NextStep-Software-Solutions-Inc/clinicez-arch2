using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Domain.Constants;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Exceptions;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Common.Helpers;

public static class GovernanceSafetyChecker
{
    public const string SystemAdminRoleName = "Clinic Administrator";

    public static readonly IReadOnlyList<string> CriticalGovernancePermissions = new List<string>
    {
        ClinicPermissions.RolesManage,
        ClinicPermissions.StaffManage,
        ClinicPermissions.SettingsManage
    }.AsReadOnly();

    public static IReadOnlyList<string> ResolveEffectivePermissions(StaffMember staff)
    {
        if (staff.ClinicRole is { } role)
        {
            return role.Permissions;
        }

        return staff.Role == StaffRole.Admin ? ClinicPermissions.All : Array.Empty<string>();
    }

    public static bool IsSystemAdministrator(StaffMember staff)
    {
        if (staff.ClinicRole != null)
        {
            return staff.ClinicRole.IsSystem && staff.ClinicRole.Name == SystemAdminRoleName;
        }

        return staff.Role == StaffRole.Admin;
    }

    public static async Task EnsureActiveSystemAdminRemainsAsync(
        IRepository<StaffMember> staffRepository,
        Guid clinicId,
        Guid targetStaffId,
        bool targetWillLoseSystemAdmin,
        CancellationToken ct = default)
    {
        if (!targetWillLoseSystemAdmin) return;

        var hasOtherActiveSystemAdmin = await staffRepository.Query(s =>
            s.ClinicId == clinicId &&
            s.IsActive &&
            s.Id != targetStaffId)
            .Include(s => s.ClinicRole)
            .AnyAsync(s => 
                (s.ClinicRole != null && s.ClinicRole.IsSystem && s.ClinicRole.Name == SystemAdminRoleName) ||
                (s.ClinicRole == null && s.Role == StaffRole.Admin), ct);

        if (!hasOtherActiveSystemAdmin)
        {
            throw new ValidationException("Cannot reassign or deactivate the only active staff member assigned to the built-in Clinic Administrator role.");
        }
    }

    public static async Task EnsureGovernancePermissionsRemainOnStaffChangeAsync(
        IRepository<StaffMember> staffRepository,
        IRepository<ClinicRole> roleRepository,
        Guid clinicId,
        StaffMember currentStaff,
        bool newIsActive,
        StaffRole newStaffRole,
        Guid? newClinicRoleId,
        CancellationToken ct = default)
    {
        var currentPerms = ResolveEffectivePermissions(currentStaff);
        var currentlyHeldCritical = CriticalGovernancePermissions
            .Where(p => currentPerms.Contains(p, StringComparer.OrdinalIgnoreCase))
            .ToList();

        if (currentlyHeldCritical.Count == 0) return;

        IReadOnlyList<string> newPerms;
        if (!newIsActive)
        {
            newPerms = Array.Empty<string>();
        }
        else if (newClinicRoleId.HasValue && newClinicRoleId.Value != currentStaff.ClinicRoleId)
        {
            var newRole = await roleRepository.Query(r => r.Id == newClinicRoleId.Value && r.ClinicId == clinicId)
                .FirstOrDefaultAsync(ct);
            newPerms = newRole?.Permissions != null ? newRole.Permissions : Array.Empty<string>();
        }
        else if (newClinicRoleId == null && currentStaff.ClinicRoleId != null)
        {
            newPerms = newStaffRole == StaffRole.Admin ? ClinicPermissions.All : Array.Empty<string>();
        }
        else
        {
            newPerms = currentPerms;
        }

        var lostCriticalPerms = currentlyHeldCritical
            .Where(p => !newPerms.Contains(p, StringComparer.OrdinalIgnoreCase))
            .ToList();

        if (lostCriticalPerms.Count == 0) return;

        var otherActiveStaff = await staffRepository.Query(s =>
            s.ClinicId == clinicId &&
            s.IsActive &&
            s.Id != currentStaff.Id)
            .Include(s => s.ClinicRole)
            .ToListAsync(ct);

        foreach (var lostPerm in lostCriticalPerms)
        {
            var anotherUserHasPerm = otherActiveStaff.Any(s =>
                ResolveEffectivePermissions(s).Contains(lostPerm, StringComparer.OrdinalIgnoreCase));

            if (!anotherUserHasPerm)
            {
                throw new ValidationException(
                    $"Cannot reassign or deactivate the last active user with '{lostPerm}' permission in this clinic.");
            }
        }
    }

    public static async Task EnsureGovernancePermissionsRemainOnRoleUpdateAsync(
        IRepository<StaffMember> staffRepository,
        Guid clinicId,
        ClinicRole existingRole,
        IReadOnlyList<string> updatedPermissions,
        CancellationToken ct = default)
    {
        var removedCriticalPerms = CriticalGovernancePermissions
            .Where(p => existingRole.Permissions.Contains(p, StringComparer.OrdinalIgnoreCase) &&
                        !updatedPermissions.Contains(p, StringComparer.OrdinalIgnoreCase))
            .ToList();

        if (removedCriticalPerms.Count == 0) return;

        var hasAssignedActiveStaff = await staffRepository.Query(s =>
            s.ClinicId == clinicId &&
            s.IsActive &&
            s.ClinicRoleId == existingRole.Id)
            .AnyAsync(ct);

        if (!hasAssignedActiveStaff) return;

        var otherActiveStaff = await staffRepository.Query(s =>
            s.ClinicId == clinicId &&
            s.IsActive &&
            s.ClinicRoleId != existingRole.Id)
            .Include(s => s.ClinicRole)
            .ToListAsync(ct);

        foreach (var removedPerm in removedCriticalPerms)
        {
            var anotherUserHasPerm = otherActiveStaff.Any(s =>
                ResolveEffectivePermissions(s).Contains(removedPerm, StringComparer.OrdinalIgnoreCase));

            if (!anotherUserHasPerm)
            {
                throw new ValidationException(
                    $"Cannot remove '{removedPerm}' from this role because it would leave the clinic without any active user possessing this permission.");
            }
        }
    }
}
