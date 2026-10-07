using System;
using System.Collections.Generic;

namespace ClinicEz.Pharmacy.Domain.Interfaces;

/// <summary>
/// Per-request pharmacy scope. Staff tenant/pharmacy/permissions come only from validated token claims;
/// trusted internal services (internal key) may supply the tenant/facility via headers.
/// </summary>
public interface IPharmacyContext
{
    string TenantId { get; }

    Guid PharmacyId { get; }

    Guid? StaffId { get; }

    IReadOnlyList<string> Permissions { get; }

    /// <summary>True when the caller is a trusted internal service (e.g. clinic-api) rather than a signed-in staff member.</summary>
    bool IsInternalService { get; }

    bool HasPermission(string permission);
}