using System;
using System.IO;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Helpers;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Infrastructure.Persistence;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Handling;
using ClinicEz.Shared.Interop.Requests;
using ClinicEz.Shared.Interoperability;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Clinic.Infrastructure.Messaging.Responders;

/// <summary>
/// Handles <c>verification.evidence.requested</c> messages arriving over the Interop Hub from <c>Party.Portal</c>.
/// Verifies that the requested object key belongs strictly to the addressed clinic's verification evidence,
/// decrypts the stored document, and replies with <c>verification.evidence.responded</c>.
/// </summary>
public sealed class VerificationEvidenceResponder
    : IInteropResponder<VerificationEvidenceRequestedPayload, VerificationEvidenceRespondedPayload>
{
    private readonly ApplicationDbContext _db;
    private readonly IClinicStorageService _storageService;
    private readonly ClinicRecipientResolver _recipient;
    private readonly ILogger<VerificationEvidenceResponder> _logger;
    private readonly IClinicEncryptionService? _encryptionService;

    public VerificationEvidenceResponder(
        ApplicationDbContext db,
        IClinicStorageService storageService,
        ClinicRecipientResolver recipient,
        ILogger<VerificationEvidenceResponder> logger,
        IClinicEncryptionService? encryptionService = null)
    {
        _db = db;
        _storageService = storageService;
        _recipient = recipient;
        _logger = logger;
        _encryptionService = encryptionService;
    }

    public async Task<VerificationEvidenceRespondedPayload> RespondAsync(
        VerificationEvidenceRequestedPayload request,
        InteropMessageContext context,
        CancellationToken ct)
    {
        if (context.From.Kind != PartyKind.ControlPlane)
        {
            _logger.LogWarning(
                "[VerificationEvidenceResponder] Refusing request {MessageId}: sender {From} is not a control plane party.",
                context.MessageId, context.From.Address);
            return new VerificationEvidenceRespondedPayload
            {
                Found = false,
                Error = "Forbidden: only the portal control plane may request verification evidence."
            };
        }

        var clinic = await _recipient.ResolveAsync(context, ct);
        if (clinic == null)
        {
            return new VerificationEvidenceRespondedPayload
            {
                Found = false,
                Error = "Addressed clinic facility was not found on this server."
            };
        }

        var objectKey = (request.ObjectKey ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(objectKey) ||
            objectKey.Length > 512 ||
            objectKey.Contains("..", StringComparison.Ordinal) ||
            objectKey.Contains('\\') ||
            objectKey.Contains('\0'))
        {
            return new VerificationEvidenceRespondedPayload
            {
                Found = false,
                Error = "Invalid verification evidence object key."
            };
        }

        var isAuthorized = await IsAuthorizedClinicEvidenceKeyAsync(clinic.TenantId, clinic.ClinicId, objectKey, ct);
        if (!isAuthorized)
        {
            _logger.LogWarning(
                "[VerificationEvidenceResponder] Refusing unauthorized evidence key '{ObjectKey}' for clinic {ClinicId}.",
                objectKey, clinic.ClinicId);
            return new VerificationEvidenceRespondedPayload
            {
                Found = false,
                Error = "Evidence object key is not authorized for this clinic."
            };
        }

        try
        {
            var result = await VerificationEvidenceHelper.ReadDecryptedEvidenceAsync(
                _storageService,
                _encryptionService,
                clinic.TenantId,
                clinic.ClinicId,
                objectKey,
                ct);

            if (result == null)
            {
                return new VerificationEvidenceRespondedPayload
                {
                    Found = false,
                    Error = "Verification evidence file was not found in clinic storage."
                };
            }

            return new VerificationEvidenceRespondedPayload
            {
                Found = true,
                ContentType = result.ContentType,
                FileName = result.FileName,
                Base64Content = Convert.ToBase64String(result.Bytes)
            };
        }
        catch (Exception ex)
        {
            _logger.LogError(
                ex,
                "[VerificationEvidenceResponder] Failed reading verification evidence '{ObjectKey}' for clinic {ClinicId}.",
                objectKey, clinic.ClinicId);
            return new VerificationEvidenceRespondedPayload
            {
                Found = false,
                Error = "Unable to read verification evidence from clinic storage."
            };
        }
    }

    private async Task<bool> IsAuthorizedClinicEvidenceKeyAsync(
        string tenantId,
        Guid clinicId,
        string objectKey,
        CancellationToken ct)
    {
        var ext = Path.GetExtension(objectKey);
        var isAllowedExtension =
            string.Equals(ext, ".pdf", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(ext, ".jpg", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(ext, ".jpeg", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(ext, ".png", StringComparison.OrdinalIgnoreCase);

        if (isAllowedExtension)
        {
            var expectedPrefix = $"tenants/{tenantId}/clinics/{clinicId:D}/verification/";
            if (objectKey.StartsWith(expectedPrefix, StringComparison.OrdinalIgnoreCase))
            {
                return true;
            }
        }

        var matchesSettings = await _db.Settings
            .IgnoreQueryFilters()
            .AsNoTracking()
            .AnyAsync(s => s.TenantId == tenantId && s.ClinicId == clinicId && s.LtoEvidenceObjectKey == objectKey, ct);
        if (matchesSettings) return true;

        return await _db.StaffMembers
            .IgnoreQueryFilters()
            .AsNoTracking()
            .AnyAsync(s => s.TenantId == tenantId && s.ClinicId == clinicId && s.PrcEvidenceObjectKey == objectKey, ct);
    }
}
