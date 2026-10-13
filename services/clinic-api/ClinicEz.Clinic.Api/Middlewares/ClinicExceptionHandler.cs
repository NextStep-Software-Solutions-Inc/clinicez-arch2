using System.Net;
using ClinicEz.Clinic.Application.Common.Exceptions;
using ClinicEz.Shared.Common;
using Microsoft.AspNetCore.Diagnostics;

namespace ClinicEz.Clinic.Api.Middlewares;

/// <summary>
/// Clinic-specific failures that carry a machine-readable error code the apps react to:
/// <c>paid_at_billing_counter</c> for a local payment on an invoice the shared billing counter collects. Registered before
/// the shared handler, which maps everything else.
/// </summary>
public sealed class ClinicExceptionHandler : IExceptionHandler
{
    public async ValueTask<bool> TryHandleAsync(HttpContext httpContext, Exception exception, CancellationToken cancellationToken)
    {
        if (exception is ActiveQueueTicketConflictException conflictEx)
        {
            httpContext.Response.StatusCode = (int)HttpStatusCode.Conflict;
            var response = new ApiResponse<ActiveQueueTicketConflictData>
            {
                Succeeded = false,
                Message = conflictEx.Message,
                ErrorCode = ActiveQueueTicketConflictException.ErrorCode,
                Data = new ActiveQueueTicketConflictData(
                    conflictEx.TicketId,
                    conflictEx.QueueNumber,
                    conflictEx.Status,
                    conflictEx.PatientName),
                Errors = [new ApiFieldError(null, ActiveQueueTicketConflictException.ErrorCode, conflictEx.Message)]
            };
            await httpContext.Response.WriteAsJsonAsync(response, cancellationToken);
            return true;
        }

        if (exception is PaidAtBillingCounterException)
        {
            httpContext.Response.StatusCode = (int)HttpStatusCode.Conflict;
            await httpContext.Response.WriteAsJsonAsync(
                ApiResponse<object>.Fail(exception.Message, [new ApiFieldError(null, PaidAtBillingCounterException.ErrorCode, exception.Message)]),
                cancellationToken);
            return true;
        }

        return false;
    }
}
