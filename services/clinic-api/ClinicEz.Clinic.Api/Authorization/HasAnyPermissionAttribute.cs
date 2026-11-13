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
public sealed class HasAnyPermissionAttribute : Attribute, IAsyncActionFilter, ClinicEz.Shared.LocalAuth.IPermissionGuarded
{
    public string Permission { get; }
    public IReadOnlyList<string> Permissions { get; }

    public HasAnyPermissionAttribute(params string[] permissions)
    {
        if (permissions == null || permissions.Length == 0 || permissions.Any(string.IsNullOrWhiteSpace))
        {
            throw new ArgumentException("At least one valid permission must be specified.", nameof(permissions));
        }

        Permissions = permissions;
        Permission = string.Join(" || ", permissions);
    }

    public async Task OnActionExecutionAsync(ActionExecutingContext context, ActionExecutionDelegate next)
    {
        var clinicContext = context.HttpContext.RequestServices.GetRequiredService<IClinicContext>();

        // OR semantics: caller must have at least one of the specified permissions
        if (!Permissions.Any(clinicContext.HasPermission))
        {
            context.Result = new ObjectResult(ApiResponse<object>.Fail(
                $"Forbidden: Insufficient permissions. At least one of the following permissions is required: [{string.Join(", ", Permissions)}].",
                new[] { new ApiFieldError("Permission", "FORBIDDEN", $"Missing required permission (any of: {string.Join(", ", Permissions)})") }))
            {
                StatusCode = StatusCodes.Status403Forbidden
            };
            return;
        }

        await next();
    }
}
