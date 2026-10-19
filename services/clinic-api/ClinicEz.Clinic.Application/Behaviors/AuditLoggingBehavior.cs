namespace ClinicEz.Clinic.Application.Behaviors;

using System;
using System.Diagnostics;
using System.Security.Claims;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Audit;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using MediatR;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;

/// <summary>
/// Pipeline behavior intercepting state-modifying commands and auditable queries across ClinicEZ.
/// Asynchronously enqueues sanitized audit messages to IAuditLogQueue without blocking request
/// execution or failing business transactions.
/// </summary>
public sealed class AuditLoggingBehavior<TRequest, TResponse> : IPipelineBehavior<TRequest, TResponse>
    where TRequest : notnull
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        WriteIndented = false,
        ReferenceHandler = ReferenceHandler.IgnoreCycles,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
    };

    private readonly IAuditLogQueue _auditQueue;
    private readonly IClinicContext _clinicContext;
    private readonly IHttpContextAccessor _httpContextAccessor;
    private readonly ILogger<AuditLoggingBehavior<TRequest, TResponse>> _logger;

    public AuditLoggingBehavior(
        IAuditLogQueue auditQueue,
        IClinicContext clinicContext,
        IHttpContextAccessor httpContextAccessor,
        ILogger<AuditLoggingBehavior<TRequest, TResponse>> logger)
    {
        _auditQueue = auditQueue ?? throw new ArgumentNullException(nameof(auditQueue));
        _clinicContext = clinicContext ?? throw new ArgumentNullException(nameof(clinicContext));
        _httpContextAccessor = httpContextAccessor ?? throw new ArgumentNullException(nameof(httpContextAccessor));
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
    }

    public async Task<TResponse> Handle(
        TRequest request,
        RequestHandlerDelegate<TResponse> next,
        CancellationToken cancellationToken)
    {
        var descriptor = AuditRequestMetadataRegistry.GetDescriptor<TRequest>();
        if (!descriptor.IsAuditable)
        {
            return await next();
        }

        var stopwatch = Stopwatch.StartNew();
        TResponse response;

        try
        {
            response = await next();
            stopwatch.Stop();

            TryEnqueueAuditMessage(request, descriptor, response, outcome: ClinicAuditOutcomes.Success, exception: null, stopwatch.ElapsedMilliseconds);
            return response;
        }
        catch (Exception ex)
        {
            stopwatch.Stop();
            TryEnqueueAuditMessage(request, descriptor, default, outcome: ClinicAuditOutcomes.Failure, exception: ex, stopwatch.ElapsedMilliseconds);
            throw; // Re-throw to allow upstream exception handlers to format HTTP response codes
        }
    }

    private void TryEnqueueAuditMessage(
        TRequest request,
        AuditRequestDescriptor descriptor,
        TResponse? response,
        string outcome,
        Exception? exception,
        long elapsedMs)
    {
        try
        {
            var httpContext = _httpContextAccessor.HttpContext;
            var user = httpContext?.User;

            // 1. Resolve Tenant and Clinic Scope
            var tenantId = !string.IsNullOrWhiteSpace(_clinicContext.TenantId) && _clinicContext.TenantId != "tenant_default"
                ? _clinicContext.TenantId
                : user?.FindFirst("tenant_id")?.Value ?? (!string.IsNullOrWhiteSpace(_clinicContext.TenantId) ? _clinicContext.TenantId : "tenant_default");

            var clinicId = _clinicContext.ClinicId != Guid.Empty
                ? _clinicContext.ClinicId
                : (Guid.TryParse(user?.FindFirst("clinic_id")?.Value, out var cid) ? cid : Guid.Empty);

            // 2. Resolve Actor Credentials
            Guid? actorStaffId = _clinicContext.StaffId;
            if (!actorStaffId.HasValue && user != null)
            {
                if (Guid.TryParse(user.FindFirst("sub")?.Value, out var sid))
                    actorStaffId = sid;
            }

            var actorName = user?.FindFirst("name")?.Value
                ?? user?.Identity?.Name
                ?? (actorStaffId.HasValue ? $"Staff:{actorStaffId.Value:N}" : "System");

            var actorRole = user?.FindFirst("staff_role")?.Value
                ?? user?.FindFirst(ClaimTypes.Role)?.Value
                ?? (user?.Identity?.IsAuthenticated == true ? "Staff" : "System");

            // 3. Resolve Client Network Details
            string? clientIp = null;
            if (httpContext != null)
            {
                if (httpContext.Request.Headers.TryGetValue("X-Forwarded-For", out var forwarded) && !string.IsNullOrWhiteSpace(forwarded))
                {
                    clientIp = forwarded.ToString().Split(',')[0].Trim();
                }
                clientIp ??= httpContext.Connection.RemoteIpAddress?.ToString();
            }
            clientIp ??= "127.0.0.1";

            var userAgent = httpContext?.Request.Headers.UserAgent.ToString();
            if (string.IsNullOrWhiteSpace(userAgent)) userAgent = "Internal/MediatR";

            // 4. Resolve Target Entity and Patient Identifiers
            var targetEntityId = descriptor.TargetEntityIdGetter(request);
            if (string.IsNullOrWhiteSpace(targetEntityId) && response != null)
            {
                targetEntityId = descriptor.ResponseIdGetter?.Invoke(response);
            }

            var patientId = descriptor.PatientIdGetter(request);
            var patientName = descriptor.PatientNameGetter(request);
            var patientPin = descriptor.PatientPinGetter(request);

            // 5. Determine Action, Category, and Severity
            var action = descriptor.Action;
            var category = descriptor.Category;
            var severity = outcome == ClinicAuditOutcomes.Failure && descriptor.Severity == ClinicAuditSeverities.Routine
                ? ClinicAuditSeverities.Urgent
                : descriptor.Severity;

            // 6. Format Forensic Description
            string description;
            if (outcome == ClinicAuditOutcomes.Success)
            {
                description = descriptor.DescriptionFormatter(request, targetEntityId, patientName);
            }
            else
            {
                var cleanError = exception?.Message ?? "Operation failed with unhandled error.";
                description = $"Failed executing {action}: {cleanError}";
            }

            // 7. Serialize Sanitized Metadata
            string metadataJson;
            if (outcome == ClinicAuditOutcomes.Success)
            {
                metadataJson = JsonSerializer.Serialize(request, JsonOptions);
            }
            else
            {
                var errObj = new
                {
                    ExceptionType = exception?.GetType().Name,
                    Message = exception?.Message,
                    ElapsedMs = elapsedMs,
                    RequestPayload = JsonSerializer.Serialize(request, JsonOptions)
                };
                metadataJson = JsonSerializer.Serialize(errObj, JsonOptions);
            }

            // 8. Construct AuditLogMessage
            var auditMessage = new AuditLogMessage
            {
                Id = Guid.NewGuid(),
                TenantId = tenantId,
                ClinicId = clinicId,
                Timestamp = DateTime.UtcNow,
                Category = category,
                Severity = severity,
                Action = action,
                ActorStaffId = actorStaffId,
                ActorName = actorName,
                ActorRole = actorRole,
                ClientIpAddress = clientIp,
                UserAgent = userAgent,
                TargetEntityType = descriptor.TargetEntityType,
                TargetEntityId = targetEntityId,
                PatientId = patientId,
                PatientName = patientName,
                PatientPin = patientPin,
                Outcome = outcome,
                Description = description,
                MetadataJson = metadataJson
            };

            // 9. Asynchronous Non-Blocking Enqueue
            if (!_auditQueue.TryEnqueue(auditMessage))
            {
                // Channel capacity reached (10,000 items). Run background fallback without delaying the caller.
                _ = Task.Run(async () =>
                {
                    try
                    {
                        using var timeoutCts = new CancellationTokenSource(TimeSpan.FromSeconds(2));
                        await _auditQueue.EnqueueAsync(auditMessage, timeoutCts.Token);
                    }
                    catch (Exception ex)
                    {
                        _logger.LogWarning(ex, "Audit log channel capacity exceeded; dropped audit message {Action} for clinic {ClinicId}",
                            auditMessage.Action, auditMessage.ClinicId);
                    }
                });
            }
        }
        catch (Exception ex)
        {
            // Defensive guarantee: Auditing errors must NEVER fail the business transaction
            _logger.LogError(ex, "Unexpected error in AuditLoggingBehavior while intercepting {RequestType}", typeof(TRequest).Name);
        }
    }
}
