using System;
using System.Collections.Generic;

namespace ClinicEz.Laboratory.Domain.Interfaces;

/// <summary>
/// Per-request laboratory scope. Authenticated staff get tenant, laboratory, staff id and permissions ONLY from the
/// validated session token; client headers are never trusted. Background work (interop handlers, Hangfire)
/// has no HTTP principal and runs in system scope (<see cref="TenantId"/> is null → no tenant filter).
/// </summary>
public interface ILabContext
{
    /// <summary>
    /// Tenant of the current principal. <c>null</c> means "no scope restriction" (no HTTP request, or an anonymous
    /// request to a public endpoint). For an authenticated principal this is never null: a missing claim yields an
    /// empty string that matches no row.
    /// </summary>
    string? TenantId { get; }

    Guid? LaboratoryId { get; }

    Guid? StaffId { get; }

    /// <summary>True for an authenticated staff session (as opposed to anonymous, internal-service or system scope).</summary>
    bool IsStaff { get; }

    IReadOnlyList<string> Permissions { get; }

    bool HasPermission(string permission);
}
