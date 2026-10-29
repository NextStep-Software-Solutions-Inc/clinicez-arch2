namespace ClinicEz.Clinic.Infrastructure.PhilHealth.Auditing;

using System;
using System.Security.Claims;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Audit;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Domain.Constants;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;

/// <summary>
/// Audit decorator for IPhilHealthSequenceGenerator ensuring statutory audit capture
/// when PhilHealth eKAS patient journey numbers (pHciCaseNo, pHciTransNo, pSoapTransNo)
/// are allocated (yakap.ekas.created).
/// </summary>
public sealed class AuditablePhilHealthSequenceGenerator : ClinicEz.Clinic.Domain.Interfaces.IPhilHealthSequenceGenerator
{
    private static readonly JsonSerializerOptions JsonOptions = new() { PropertyNamingPolicy = JsonNamingPolicy.CamelCase };

    private readonly ClinicEz.Clinic.Domain.Interfaces.IPhilHealthSequenceGenerator _inner;
    private readonly IAuditLogQueue _auditQueue;
    private readonly IClinicContext _clinicContext;
    private readonly IHttpContextAccessor _httpContextAccessor;
    private readonly ILogger<AuditablePhilHealthSequenceGenerator> _logger;

    public AuditablePhilHealthSequenceGenerator(
        ClinicEz.Clinic.Domain.Interfaces.IPhilHealthSequenceGenerator inner,
        IAuditLogQueue auditQueue,
        IClinicContext clinicContext,
        IHttpContextAccessor httpContextAccessor,
        ILogger<AuditablePhilHealthSequenceGenerator> logger)
    {
        _inner = inner ?? throw new ArgumentNullException(nameof(inner));
        _auditQueue = auditQueue ?? throw new ArgumentNullException(nameof(auditQueue));
        _clinicContext = clinicContext ?? throw new ArgumentNullException(nameof(clinicContext));
        _httpContextAccessor = httpContextAccessor ?? throw new ArgumentNullException(nameof(httpContextAccessor));
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
    }

    public Task<string> GenerateCaseNumberAsync(
        string tenantId,
        Guid clinicId,
        string accreditationNumber,
        string effectiveYear,
        CancellationToken ct = default) =>
        _inner.GenerateCaseNumberAsync(tenantId, clinicId, accreditationNumber, effectiveYear, ct);

    public Task<string> GenerateTransactionNumberAsync(
        string tenantId,
        Guid clinicId,
        PhilHealthSequenceType type,
        string accreditationNumber,
        string effectiveYear,
        CancellationToken ct = default) =>
        _inner.GenerateTransactionNumberAsync(tenantId, clinicId, type, accreditationNumber, effectiveYear, ct);

    public Task<string> GenerateTransmittalNumberAsync(
        string tenantId,
        Guid clinicId,
        string accreditationNumber,
        string effectiveYear,
        CancellationToken ct = default) =>
        _inner.GenerateTransmittalNumberAsync(tenantId, clinicId, accreditationNumber, effectiveYear, ct);

    public Task<PhilHealthPatientJourneyNumbers> AssignPatientJourneyNumbersAsync(
        string tenantId,
        Guid clinicId,
        Guid patientId,
        Guid? encounterId,
        string accreditationNumber,
        string effectiveYear,
        CancellationToken ct) =>
        AssignPatientJourneyNumbersAsync(tenantId, clinicId, patientId, encounterId, accreditationNumber, effectiveYear, referenceDate: null, ct);

    public async Task<PhilHealthPatientJourneyNumbers> AssignPatientJourneyNumbersAsync(
        string tenantId,
        Guid clinicId,
        Guid patientId,
        Guid? encounterId,
        string accreditationNumber,
        string effectiveYear,
        DateTime? referenceDate = null,
        CancellationToken ct = default)
    {
        var journeyNumbers = referenceDate.HasValue
            ? await _inner.AssignPatientJourneyNumbersAsync(tenantId, clinicId, patientId, encounterId, accreditationNumber, effectiveYear, referenceDate, ct)
            : await _inner.AssignPatientJourneyNumbersAsync(tenantId, clinicId, patientId, encounterId, accreditationNumber, effectiveYear, ct);

        try
        {
            var httpContext = _httpContextAccessor.HttpContext;
            var user = httpContext?.User;

            var resolvedTenant = !string.IsNullOrWhiteSpace(tenantId) && tenantId != "tenant_default"
                ? tenantId
                : (!string.IsNullOrWhiteSpace(_clinicContext.TenantId) ? _clinicContext.TenantId : "tenant_default");

            var resolvedClinicId = clinicId != Guid.Empty
                ? clinicId
                : _clinicContext.ClinicId;

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

            var userAgent = httpContext?.Request.Headers.UserAgent.ToString() ?? "Internal/SequenceGenerator";

            var metadata = new
            {
                PatientId = patientId,
                EncounterId = encounterId,
                AccreditationNumber = accreditationNumber,
                EffectiveYear = effectiveYear,
                CaseNumber = journeyNumbers.CaseNumber,
                EnlistmentTransactionNumber = journeyNumbers.EnlistmentTransactionNumber,
                ProfilingTransactionNumber = journeyNumbers.ProfilingTransactionNumber,
                SoapTransactionNumber = journeyNumbers.SoapTransactionNumber,
                AssignedAtUtc = DateTime.UtcNow
            };

            var message = new AuditLogMessage
            {
                Id = Guid.NewGuid(),
                TenantId = resolvedTenant,
                ClinicId = resolvedClinicId,
                Timestamp = DateTime.UtcNow,
                Category = ClinicAuditCategories.PhilHealth,
                Severity = ClinicAuditSeverities.Routine,
                Action = PhilHealthAuditEvents.EkasCreated,
                ActorStaffId = actorStaffId,
                ActorName = actorName,
                ActorRole = actorRole,
                ClientIpAddress = clientIp,
                UserAgent = userAgent,
                TargetEntityType = "PhilHealthEkasAvailment",
                TargetEntityId = encounterId?.ToString() ?? patientId.ToString(),
                PatientId = patientId,
                Outcome = ClinicAuditOutcomes.Success,
                Description = $"PhilHealth eKAS numbers generated for patient '{patientId}' (Case: {journeyNumbers.CaseNumber}, Enlistment: {journeyNumbers.EnlistmentTransactionNumber}).",
                MetadataJson = JsonSerializer.Serialize(metadata, JsonOptions)
            };

            _auditQueue.TryEnqueue(message);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "[AuditablePhilHealthSequenceGenerator] Error enqueuing eKAS creation audit event.");
        }

        return journeyNumbers;
    }
}
