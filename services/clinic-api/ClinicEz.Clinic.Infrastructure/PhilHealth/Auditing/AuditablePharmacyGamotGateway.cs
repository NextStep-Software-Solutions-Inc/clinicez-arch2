namespace ClinicEz.Clinic.Infrastructure.PhilHealth.Auditing;

using System;
using System.Security.Claims;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Audit;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Common.Privacy;
using ClinicEz.Clinic.Domain.Constants;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;

/// <summary>
/// Audit decorator for IPharmacyGamotGateway ensuring statutory interception of GAMOT medicine
/// dispensations (yakap.gamot.dispensed) and transaction reversals (yakap.claim.voided).
/// </summary>
public sealed class AuditablePharmacyGamotGateway : IPharmacyGamotGateway
{
    private static readonly JsonSerializerOptions JsonOptions = new() { PropertyNamingPolicy = JsonNamingPolicy.CamelCase };

    private readonly IPharmacyGamotGateway _inner;
    private readonly IAuditLogQueue _auditQueue;
    private readonly IClinicContext _clinicContext;
    private readonly IPhiRedactionService _redactionService;
    private readonly IHttpContextAccessor _httpContextAccessor;
    private readonly ILogger<AuditablePharmacyGamotGateway> _logger;

    public AuditablePharmacyGamotGateway(
        IPharmacyGamotGateway inner,
        IAuditLogQueue auditQueue,
        IClinicContext clinicContext,
        IPhiRedactionService redactionService,
        IHttpContextAccessor httpContextAccessor,
        ILogger<AuditablePharmacyGamotGateway> logger)
    {
        _inner = inner ?? throw new ArgumentNullException(nameof(inner));
        _auditQueue = auditQueue ?? throw new ArgumentNullException(nameof(auditQueue));
        _clinicContext = clinicContext ?? throw new ArgumentNullException(nameof(clinicContext));
        _redactionService = redactionService ?? throw new ArgumentNullException(nameof(redactionService));
        _httpContextAccessor = httpContextAccessor ?? throw new ArgumentNullException(nameof(httpContextAccessor));
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
    }

    public async Task<GamotGatewayResult> SendAsync(
        string method,
        string relativePath,
        string queryString,
        string? jsonBody,
        CancellationToken ct)
    {
        var result = await _inner.SendAsync(method, relativePath, queryString, jsonBody, ct);

        var normalizedPath = relativePath.TrimStart('/');
        var isPost = string.Equals(method, "POST", StringComparison.OrdinalIgnoreCase);

        // Intercept 1: GAMOT Transaction Reversal / Void (yakap.claim.voided)
        if (isPost && normalizedPath.Contains("reverse", StringComparison.OrdinalIgnoreCase))
        {
            HandleReverseAudit(normalizedPath, jsonBody, result);
        }
        // Intercept 2: GAMOT Medicine Dispensation (yakap.gamot.dispensed)
        else if (isPost && normalizedPath.StartsWith("dispense", StringComparison.OrdinalIgnoreCase))
        {
            HandleDispenseAudit(jsonBody, result);
        }

        return result;
    }

    private void HandleDispenseAudit(string? jsonBody, GamotGatewayResult result)
    {
        try
        {
            var isSuccess = result.StatusCode >= 200 && result.StatusCode < 300;
            string? rawPin = null;
            string? drugCode = null;
            int? quantity = null;
            string? transactionId = null;

            if (!string.IsNullOrWhiteSpace(jsonBody))
            {
                var doc = JsonNode.Parse(jsonBody);
                rawPin = doc?["pin"]?.ToString() ?? doc?["patientPin"]?.ToString();
                drugCode = doc?["philHealthDrugCode"]?.ToString() ?? doc?["drugCode"]?.ToString();
                if (doc?["quantity"] != null && int.TryParse(doc["quantity"]!.ToString(), out var qty))
                {
                    quantity = qty;
                }
            }

            if (!string.IsNullOrWhiteSpace(result.Body))
            {
                var resDoc = JsonNode.Parse(result.Body);
                transactionId = resDoc?["transactionId"]?.ToString() ?? resDoc?["id"]?.ToString();
            }

            var maskedPin = _redactionService.MaskPhilHealthPin(rawPin);

            var metadata = new
            {
                PhilHealthDrugCode = drugCode,
                QuantityDispensed = quantity,
                PatientPinMasked = maskedPin,
                PharmacyTransactionId = transactionId,
                StatusCode = result.StatusCode
            };

            var (tenantId, clinicId, actorStaffId, actorName, actorRole, clientIp, userAgent) = ResolveContext();

            var message = new AuditLogMessage
            {
                Id = Guid.NewGuid(),
                TenantId = tenantId,
                ClinicId = clinicId,
                Timestamp = DateTime.UtcNow,
                Category = ClinicAuditCategories.PhilHealth,
                Severity = isSuccess ? ClinicAuditSeverities.Routine : ClinicAuditSeverities.Urgent,
                Action = PhilHealthAuditEvents.GamotDispensed,
                ActorStaffId = actorStaffId,
                ActorName = actorName,
                ActorRole = actorRole,
                ClientIpAddress = clientIp,
                UserAgent = userAgent,
                TargetEntityType = "PhilHealthGamotDispensation",
                TargetEntityId = transactionId ?? drugCode,
                PatientId = null,
                PatientName = null,
                PatientPin = rawPin,
                Outcome = isSuccess ? "Success" : "Failure",
                Description = isSuccess
                    ? $"PhilHealth GAMOT medicine '{drugCode}' (qty: {quantity}) dispensed to patient '{maskedPin}'."
                    : $"Failed to dispense PhilHealth GAMOT medicine '{drugCode}': HTTP {result.StatusCode}",
                MetadataJson = JsonSerializer.Serialize(metadata, JsonOptions)
            };

            _auditQueue.TryEnqueue(message);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "[AuditablePharmacyGamotGateway] Error logging GAMOT dispense audit.");
        }
    }

    private void HandleReverseAudit(string path, string? jsonBody, GamotGatewayResult result)
    {
        try
        {
            var isSuccess = result.StatusCode >= 200 && result.StatusCode < 300;
            string? reason = null;

            if (!string.IsNullOrWhiteSpace(jsonBody))
            {
                var doc = JsonNode.Parse(jsonBody);
                reason = doc?["reason"]?.ToString() ?? doc?["voidReason"]?.ToString();
            }

            var metadata = new
            {
                Path = path,
                VoidReason = reason ?? "GAMOT Dispense Reversal",
                StatusCode = result.StatusCode
            };

            var (tenantId, clinicId, actorStaffId, actorName, actorRole, clientIp, userAgent) = ResolveContext();

            var message = new AuditLogMessage
            {
                Id = Guid.NewGuid(),
                TenantId = tenantId,
                ClinicId = clinicId,
                Timestamp = DateTime.UtcNow,
                Category = ClinicAuditCategories.PhilHealth,
                Severity = ClinicAuditSeverities.Emergency,
                Action = PhilHealthAuditEvents.ClaimVoided,
                ActorStaffId = actorStaffId,
                ActorName = actorName,
                ActorRole = actorRole,
                ClientIpAddress = clientIp,
                UserAgent = userAgent,
                TargetEntityType = "PhilHealthGamotDispensation",
                TargetEntityId = path,
                PatientId = null,
                Outcome = isSuccess ? "Success" : "Failure",
                Description = $"PhilHealth GAMOT transaction reversed / voided. Reason: {reason ?? "Dispense reversal"}",
                MetadataJson = JsonSerializer.Serialize(metadata, JsonOptions)
            };

            _auditQueue.TryEnqueue(message);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "[AuditablePharmacyGamotGateway] Error logging GAMOT reversal audit.");
        }
    }

    private (string TenantId, Guid ClinicId, Guid? ActorStaffId, string ActorName, string ActorRole, string ClientIp, string UserAgent) ResolveContext()
    {
        var httpContext = _httpContextAccessor.HttpContext;
        var user = httpContext?.User;

        var tenantId = !string.IsNullOrWhiteSpace(_clinicContext.TenantId) && _clinicContext.TenantId != "tenant_default"
            ? _clinicContext.TenantId
            : user?.FindFirst("tenant_id")?.Value ?? (!string.IsNullOrWhiteSpace(_clinicContext.TenantId) ? _clinicContext.TenantId : "tenant_default");

        var clinicId = _clinicContext.ClinicId != Guid.Empty
            ? _clinicContext.ClinicId
            : (Guid.TryParse(user?.FindFirst("clinic_id")?.Value, out var cid) ? cid : Guid.Empty);

        Guid? actorStaffId = _clinicContext.StaffId;
        if (!actorStaffId.HasValue && user != null)
        {
            if (Guid.TryParse(user.FindFirst("sub")?.Value, out var sid))
                actorStaffId = sid;
        }

        var actorName = user?.FindFirst("name")?.Value
            ?? user?.Identity?.Name
            ?? (actorStaffId.HasValue ? $"Staff:{actorStaffId.Value:N}" : "DispensingStaff");

        var actorRole = user?.FindFirst("staff_role")?.Value
            ?? user?.FindFirst(ClaimTypes.Role)?.Value
            ?? (user?.Identity?.IsAuthenticated == true ? "Pharmacist" : "System");

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

        var userAgent = httpContext?.Request.Headers.UserAgent.ToString() ?? "Internal/GAMOT";

        return (tenantId, clinicId, actorStaffId, actorName, actorRole, clientIp, userAgent);
    }
}
