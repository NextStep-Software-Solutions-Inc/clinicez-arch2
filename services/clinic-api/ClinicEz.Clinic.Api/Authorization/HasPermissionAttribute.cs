using System;
using System.Threading.Tasks;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Common;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.Extensions.DependencyInjection;

namespace ClinicEz.Clinic.Api.Authorization;

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
        var clinicContext = context.HttpContext.RequestServices.GetRequiredService<IClinicContext>();

        if (!clinicContext.HasPermission(Permission))
        {
            context.Result = new ObjectResult(ApiResponse<object>.Fail(
                $"Forbidden: Insufficient permissions. Required permission '{Permission}' is not granted for this clinic role.",
                new[] { new ApiFieldError("Permission", "FORBIDDEN", $"Missing required permission: {Permission}") }))
            {
                StatusCode = StatusCodes.Status403Forbidden
            };
            return;
        }

        await next();
    }
}
