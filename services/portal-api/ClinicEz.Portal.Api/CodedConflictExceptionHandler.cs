using ClinicEz.Portal.Application.Common;
using ClinicEz.Shared.Common;
using Microsoft.AspNetCore.Diagnostics;

namespace ClinicEz.Portal.Api;

/// <summary>Turns a <see cref="CodedConflictException"/> into a 409 whose error carries the machine-readable code. Runs before the shared handler.</summary>
public sealed class CodedConflictExceptionHandler : IExceptionHandler
{
    public async ValueTask<bool> TryHandleAsync(HttpContext httpContext, Exception exception, CancellationToken cancellationToken)
    {
        if (exception is not CodedConflictException conflict)
        {
            return false;
        }

        httpContext.Response.StatusCode = StatusCodes.Status409Conflict;
        await httpContext.Response.WriteAsJsonAsync(
            ApiResponse<object>.Fail(conflict.Message, [new ApiFieldError(null, conflict.Code, conflict.Message)]),
            cancellationToken);
        return true;
    }
}
