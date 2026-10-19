using System;
using System.Collections.Generic;

namespace ClinicEz.Pharmacy.Domain.Interfaces;

/// <summary>
/// Per-request pharmacy scope. Staff tenant/pharmacy/permissions come only from validated token claims.
/// </summary>
public interface IPharmacyContext
{
    string TenantId { get; }

    Guid PharmacyId { get; }

    Guid? StaffId { get; }

    IReadOnlyList<string> Permissions { get; }

    bool HasPermission(string permission);
}