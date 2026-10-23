using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Common;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.Extensions.DependencyInjection;

namespace ClinicEz.Clinic.Api.Authorization;

[AttributeUsage(AttributeTargets.Class | AttributeTargets.Method, AllowMultiple = true)]
public sealed class HasPermissionAttribute : Attribute, IAsyncActionFilter, ClinicEz.Shared.LocalAuth.IPermissionGuarded
{
    public string Permission { get; }
    public IReadOnlyList<string> Permissions { get; }

    public HasPermissionAttribute(string permission)
    {
        Permission = permission ?? throw new ArgumentNullException(nameof(permission));
        Permissions = new[] { Permission };
    }

    public HasPermissionAttribute(params string[] permissions)
    {
        if (permissions == null || permissions.Length == 0 || permissions.Any(string.IsNullOrWhiteSpace))
        {
            throw new ArgumentException("At least one valid permission must be specified.", nameof(permissions));
        }

        Permissions = permissions;
        Permission = string.Join(" && ", permissions);
    }

    public async Task OnActionExecutionAsync(ActionExecutingContext context, ActionExecutionDelegate next)
    {
        var clinicContext = context.HttpContext.RequestServices.GetRequiredService<IClinicContext>();

        // Strict AND semantics: every required permission must be explicitly granted to the caller's role
        foreach (var requiredPermission in Permissions)
        {
            if (!clinicContext.HasPermission(requiredPermission))
            {
                context.Result = new ObjectResult(ApiResponse<object>.Fail(
                    $"Forbidden: Insufficient permissions. Required permission '{requiredPermission}' is not granted for this clinic role.",
                    new[] { new ApiFieldError("Permission", "FORBIDDEN", $"Missing required permission: {requiredPermission}") }))
                {
                    StatusCode = StatusCodes.Status403Forbidden
                };
                return;
            }
        }

        await next();
    }
}
