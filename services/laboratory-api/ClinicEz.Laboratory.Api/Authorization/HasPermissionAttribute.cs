using System;
using System.Threading.Tasks;
using ClinicEz.Laboratory.Domain.Interfaces;
using ClinicEz.Shared.Common;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.Extensions.DependencyInjection;

namespace ClinicEz.Laboratory.Api.Authorization;

/// <summary>
/// Requires the caller's session to carry the given permission (granted by the staff member's laboratory role).
/// Authentication itself is enforced earlier by the secure-by-default fallback policy.
/// </summary>
[AttributeUsage(AttributeTargets.Class | AttributeTargets.Method, AllowMultiple = true)]
public sealed class HasPermissionAttribute : Attribute, IAsyncActionFilter
{
    public string Permission { get; }

    public HasPermissionAttribute(string permission)
    {
        Permission = permission ?? throw new ArgumentNullException(nameof(permission));
    }

    public async Task OnActionExecutionAsync(ActionExecutingContext context, ActionExecutionDelegate next)
    {
        var labContext = context.HttpContext.RequestServices.GetRequiredService<ILabContext>();

        if (!labContext.HasPermission(Permission))
        {
            context.Result = new ObjectResult(ApiResponse<object>.Fail(
                $"Forbidden: Insufficient permissions. Required permission '{Permission}' is not granted for your laboratory role.",
                new[] { new ApiFieldError("Permission", "FORBIDDEN", $"Missing required permission: {Permission}") }))
            {
                StatusCode = StatusCodes.Status403Forbidden
            };
            return;
        }

        await next();
    }
}
