using System;
using System.Collections.Generic;
using System.Linq;
using System.Security.Claims;
using ClinicEz.Laboratory.Domain.Constants;
using ClinicEz.Laboratory.Domain.Interfaces;
using ClinicEz.Shared.LocalAuth;
using Microsoft.AspNetCore.Http;

namespace ClinicEz.Laboratory.Infrastructure.Context;

/// <summary>
/// Per-request laboratory scope. Fails closed:
/// <list type="bullet">
///   <item>An explicit scope entered with <see cref="BeginFacilityScope"/> (interop handlers, addressed by the envelope
///   <c>To</c>) or <see cref="BeginSystemScope"/> (named administrative jobs) wins over everything else.</item>
///   <item>Authenticated staff (Facility scheme): tenant, laboratory, staff and permissions come ONLY from validated token
///   claims. Client headers (X-Tenant-Id, X-Facility-Id, X-Permissions, ...) are ignored.</item>
///   <item>Trusted internal services (Internal scheme): tenant from <c>X-Tenant-Id</c> and laboratory from <c>X-Facility-Id</c>
///   (a missing one matches nothing), with a minimal service permission set.</item>
///   <item>Anonymous requests (public endpoints only) and background code that never entered a scope: no permissions and
///   no data. Public endpoints do their own explicit workspace resolution.</item>
/// </list>
/// </summary>
public sealed class LabContext : ILabContext
{
    private readonly IHttpContextAccessor _httpContextAccessor;
    private ExplicitScope? _explicitScope;

    public LabContext(IHttpContextAccessor httpContextAccessor)
    {
        _httpContextAccessor = httpContextAccessor;
    }

    private HttpContext? Http => _httpContextAccessor.HttpContext;

    private static bool IsInternal(ClaimsPrincipal user) =>
        user.Identity?.IsAuthenticated == true && user.HasClaim(FacilityAuthSchemes.InternalClaim, "true");

    private static bool IsAuthenticatedStaff(ClaimsPrincipal user) =>
        user.Identity?.IsAuthenticated == true && !IsInternal(user);

    public bool IsStaff => Http is { } http && IsAuthenticatedStaff(http.User);

    public LabScopeKind ScopeKind
    {
        get
        {
            if (_explicitScope is { } scope) return scope.Kind;

            var http = Http;
            if (http is null) return LabScopeKind.None;
            return http.User.Identity?.IsAuthenticated == true ? LabScopeKind.Facility : LabScopeKind.None;
        }
    }

    public string? TenantId
    {
        get
        {
            if (_explicitScope is { } scope) return scope.TenantId;

            var http = Http;
            if (http is null) return null;

            if (IsAuthenticatedStaff(http.User))
            {
                return http.User.FindFirst(LabClaimTypes.TenantId)?.Value ?? string.Empty;
            }

            if (IsInternal(http.User))
            {
                return http.Request.Headers.TryGetValue("X-Tenant-Id", out var value) && !string.IsNullOrWhiteSpace(value)
                    ? value.ToString()
                    : string.Empty;
            }

            return null;
        }
    }

    public Guid? LaboratoryId
    {
        get
        {
            if (_explicitScope is { } scope) return scope.LaboratoryId;

            var http = Http;
            if (http is null) return null;

            if (IsAuthenticatedStaff(http.User))
            {
                return Guid.TryParse(http.User.FindFirst(LabClaimTypes.LaboratoryId)?.Value, out var id) ? id : Guid.Empty;
            }

            if (IsInternal(http.User))
            {
                return http.Request.Headers.TryGetValue("X-Facility-Id", out var value) && Guid.TryParse(value.ToString(), out var facilityId)
                    ? facilityId
                    : Guid.Empty;
            }

            return null;
        }
    }

    public Guid? StaffId
    {
        get
        {
            var http = Http;
            if (http is null || !IsAuthenticatedStaff(http.User)) return null;
            return Guid.TryParse(http.User.FindFirst(LabClaimTypes.Subject)?.Value, out var id) ? id : null;
        }
    }

    public IReadOnlyList<string> Permissions
    {
        get
        {
            var http = Http;
            if (http is null)
            {
                // Background/system scope (consumers, seeders) is trusted code, not a client.
                return LabPermissions.All;
            }

            if (IsInternal(http.User)) return LabPermissions.InternalService;

            if (IsAuthenticatedStaff(http.User))
            {
                return http.User.FindAll(LabClaimTypes.Permission).Select(c => c.Value).ToList();
            }

            return Array.Empty<string>();
        }
    }

    public bool HasPermission(string permission)
    {
        if (string.IsNullOrWhiteSpace(permission)) return true;
        return Permissions.Contains(permission, StringComparer.OrdinalIgnoreCase);
    }

    public IDisposable BeginFacilityScope(string tenantId, Guid laboratoryId)
    {
        if (string.IsNullOrWhiteSpace(tenantId) || laboratoryId == Guid.Empty)
        {
            throw new ArgumentException("A facility scope needs both a tenant id and a laboratory id.");
        }

        return Enter(new ExplicitScope(LabScopeKind.Facility, tenantId, laboratoryId));
    }

    public IDisposable BeginSystemScope() => Enter(new ExplicitScope(LabScopeKind.System, null, null));

    private ScopeHandle Enter(ExplicitScope scope)
    {
        var handle = new ScopeHandle(this, _explicitScope);
        _explicitScope = scope;
        return handle;
    }

    private sealed record ExplicitScope(LabScopeKind Kind, string? TenantId, Guid? LaboratoryId);

    private sealed class ScopeHandle : IDisposable
    {
        private readonly LabContext _owner;
        private readonly ExplicitScope? _previous;
        private bool _disposed;

        public ScopeHandle(LabContext owner, ExplicitScope? previous)
        {
            _owner = owner;
            _previous = previous;
        }

        public void Dispose()
        {
            if (_disposed) return;
            _disposed = true;
            _owner._explicitScope = _previous;
        }
    }
}
