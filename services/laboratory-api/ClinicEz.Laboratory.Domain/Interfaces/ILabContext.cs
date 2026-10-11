using System;
using System.Collections.Generic;

namespace ClinicEz.Laboratory.Domain.Interfaces;

/// <summary>How the data of the current unit of work is scoped (see <see cref="ILabContext.ScopeKind"/>).</summary>
public enum LabScopeKind
{
    /// <summary>No facility is known (anonymous request, or background code that has not set a scope): matches no row.</summary>
    None,

    /// <summary>Restricted to exactly one tenant AND one laboratory.</summary>
    Facility,

    /// <summary>Explicitly unrestricted. Reserved for named administrative jobs; never reachable from a request or a message handler.</summary>
    System
}

/// <summary>
/// Per-request laboratory scope. Authenticated staff get tenant, laboratory, staff id and permissions ONLY from the
/// validated session token; client headers are never trusted. Interop handlers have no HTTP principal and must enter
/// the facility their message is addressed to with <see cref="BeginFacilityScope"/>; code that has not done so sees no data.
/// </summary>
public interface ILabContext
{
    /// <summary>
    /// Tenant of the active <see cref="LabScopeKind.Facility"/> scope, <c>null</c> for <see cref="LabScopeKind.None"/> and
    /// <see cref="LabScopeKind.System"/>. For an authenticated principal this is never null: a missing claim yields an
    /// empty string that matches no row.
    /// </summary>
    string? TenantId { get; }

    /// <summary>Laboratory of the active facility scope; <see cref="Guid.Empty"/> when the principal carries none (matches no row).</summary>
    Guid? LaboratoryId { get; }

    Guid? StaffId { get; }

    /// <summary>True for an authenticated staff session (as opposed to anonymous, internal-service or message-handler scope).</summary>
    bool IsStaff { get; }

    /// <summary>Which rows the current unit of work may see and write.</summary>
    LabScopeKind ScopeKind { get; }

    IReadOnlyList<string> Permissions { get; }

    bool HasPermission(string permission);

    /// <summary>
    /// Restricts the current unit of work to one tenant and laboratory (taken from an envelope's <c>To</c>). Dispose to restore
    /// the previous scope.
    /// </summary>
    IDisposable BeginFacilityScope(string tenantId, Guid laboratoryId);

    /// <summary>Unrestricted access for named administrative jobs only. Dispose to restore the previous scope.</summary>
    IDisposable BeginSystemScope();
}
