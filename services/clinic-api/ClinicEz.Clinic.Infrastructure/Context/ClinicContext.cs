using System;
using System.Collections.Generic;
using System.Linq;
using System.Security.Claims;
using ClinicEz.Clinic.Domain.Constants;
using ClinicEz.Clinic.Domain.Interfaces;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Configuration;

namespace ClinicEz.Clinic.Infrastructure.Context;

public sealed class ClinicContext : IClinicContext
{
    private readonly IHttpContextAccessor _httpContextAccessor;
    private readonly IConfiguration _configuration;

    public ClinicContext(IHttpContextAccessor httpContextAccessor, IConfiguration configuration)
    {
        _httpContextAccessor = httpContextAccessor;
        _configuration = configuration;
    }

    public string TenantId
    {
        get
        {
            var httpContext = _httpContextAccessor.HttpContext;
            if (httpContext != null)
            {
                if (httpContext.Request.Headers.TryGetValue("X-Tenant-Id", out var tenantHeader) && !string.IsNullOrWhiteSpace(tenantHeader))
                {
                    return tenantHeader.ToString();
                }

                var claimTenant = httpContext.User.FindFirst("tenant_id")?.Value
                                  ?? httpContext.User.FindFirst("org_id")?.Value;
                if (!string.IsNullOrWhiteSpace(claimTenant))
                {
                    return claimTenant;
                }
            }

            return _configuration["ClinicSettings:TenantId"] ?? "tenant_default";
        }
    }

    public Guid ClinicId
    {
        get
        {
            var httpContext = _httpContextAccessor.HttpContext;
            if (httpContext != null)
            {
                if (httpContext.Request.Headers.TryGetValue("X-Clinic-Id", out var clinicHeader) &&
                    Guid.TryParse(clinicHeader.ToString(), out var clinicGuid))
                {
                    return clinicGuid;
                }

                var claimClinic = httpContext.User.FindFirst("clinic_id")?.Value;
                if (!string.IsNullOrWhiteSpace(claimClinic) && Guid.TryParse(claimClinic, out var claimGuid))
                {
                    return claimGuid;
                }
            }

            if (Guid.TryParse(_configuration["ClinicSettings:ClinicId"], out var configGuid))
            {
                return configGuid;
            }

            // Fallback for single-clinic local hospital deployments
            return Guid.Parse("11111111-1111-1111-1111-111111111111");
        }
    }

    public Guid? BranchId
    {
        get
        {
            var httpContext = _httpContextAccessor.HttpContext;
            if (httpContext != null)
            {
                if (httpContext.Request.Headers.TryGetValue("X-Branch-Id", out var branchHeader) &&
                    Guid.TryParse(branchHeader.ToString(), out var branchGuid))
                {
                    return branchGuid;
                }

                var claimBranch = httpContext.User.FindFirst("branch_id")?.Value;
                if (!string.IsNullOrWhiteSpace(claimBranch) && Guid.TryParse(claimBranch, out var claimGuid))
                {
                    return claimGuid;
                }
            }

            if (Guid.TryParse(_configuration["ClinicSettings:BranchId"], out var configBranchGuid))
            {
                return configBranchGuid;
            }

            return null;
        }
    }

    public Guid? StaffId
    {
        get
        {
            var httpContext = _httpContextAccessor.HttpContext;
            if (httpContext != null)
            {
                if (httpContext.Request.Headers.TryGetValue("X-Staff-Id", out var staffHeader) &&
                    Guid.TryParse(staffHeader.ToString(), out var staffGuid))
                {
                    return staffGuid;
                }

                var claimStaff = httpContext.User.FindFirst("staff_id")?.Value
                                 ?? httpContext.User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
                if (!string.IsNullOrWhiteSpace(claimStaff) && Guid.TryParse(claimStaff, out var staffClaimGuid))
                {
                    return staffClaimGuid;
                }
            }

            return null;
        }
    }

    public IReadOnlyList<string> Permissions
    {
        get
        {
            var httpContext = _httpContextAccessor.HttpContext;
            if (httpContext != null)
            {
                if (httpContext.Request.Headers.TryGetValue("X-Permissions", out var permHeader))
                {
                    return permHeader.ToString().Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
                }

                var claimPerms = httpContext.User.FindAll("permission").Select(c => c.Value).ToList();
                if (claimPerms.Count > 0)
                {
                    return claimPerms;
                }

                // If user is Admin role claim
                var roleClaim = httpContext.User.FindFirst(ClaimTypes.Role)?.Value ?? httpContext.User.FindFirst("role")?.Value;
                if (string.Equals(roleClaim, "Admin", StringComparison.OrdinalIgnoreCase) ||
                    string.Equals(roleClaim, "ClinicAdmin", StringComparison.OrdinalIgnoreCase))
                {
                    return ClinicPermissions.All;
                }
            }

            // Default dev/local fallback: full permissions
            return ClinicPermissions.All;
        }
    }

    public bool HasPermission(string permission)
    {
        if (string.IsNullOrWhiteSpace(permission)) return true;
        var perms = Permissions;
        return perms.Contains("*") || perms.Contains(permission, StringComparer.OrdinalIgnoreCase);
    }
}
