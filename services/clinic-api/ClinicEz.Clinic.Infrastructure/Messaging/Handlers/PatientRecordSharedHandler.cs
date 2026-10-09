using System;
using System.Buffers;
using System.IO;
using System.Net.Http;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Infrastructure.Persistence;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Handling;
using ClinicEz.Shared.Interoperability;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Clinic.Infrastructure.Messaging;

/// <summary>
/// Fetches a file the patient attached to a booking (<c>patient.record.shared</c>) from its short-lived download link and keeps
/// it, encrypted, on the patient's chart. The message is only trusted for a patient this clinic already knows and for a booking
/// draft that patient made at this clinic. It can arrive before the booking itself, in which case it is retried. An attachment
/// that already holds its file is left alone, and a link that has expired or cannot be fetched is logged and dropped: the
/// patient can book again.
/// </summary>
public sealed class PatientRecordSharedHandler : IInteropHandler<PatientRecordSharedPayload>
{
    internal const long MaxFileBytes = 25L * 1024 * 1024;
    internal const string HttpClientName = "patient-record-download";

    private readonly ApplicationDbContext _dbContext;
    private readonly ClinicRecipientResolver _recipient;
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly IClinicEncryptionService _encryption;
    private readonly IClinicStorageService _storage;
    private readonly ILogger<PatientRecordSharedHandler> _logger;

    public PatientRecordSharedHandler(
        ApplicationDbContext dbContext,
        ClinicRecipientResolver recipient,
        IHttpClientFactory httpClientFactory,
        IClinicEncryptionService encryption,
        IClinicStorageService storage,
        ILogger<PatientRecordSharedHandler> logger)
    {
        _dbContext = dbContext;
        _recipient = recipient;
        _httpClientFactory = httpClientFactory;
        _encryption = encryption;
        _storage = storage;
        _logger = logger;
    }

    public async Task HandleAsync(PatientRecordSharedPayload message, InteropMessageContext context, CancellationToken ct)
    {
        var clinic = await _recipient.ResolveAsync(context, ct);
        if (clinic == null) return;

        if (context.From.Kind != PartyKind.Patient
            || !string.Equals(context.From.PatientId, message.PatientId.ToString(), StringComparison.OrdinalIgnoreCase))
        {
            Ignore(context, "the sender is not the patient the file belongs to");
            return;
        }

        if (message.DraftId != context.CorrelationId || message.FileId == Guid.Empty)
        {
            Ignore(context, "the booking draft or file id is missing or does not match the correlation");
            return;
        }

        if (message.SizeBytes <= 0 || message.SizeBytes > MaxFileBytes)
        {
            Ignore(context, $"the file size {message.SizeBytes} is outside the accepted range");
            return;
        }

        if (!Uri.TryCreate(message.DownloadUrl, UriKind.Absolute, out var downloadUri)
            || (downloadUri.Scheme != Uri.UriSchemeHttps && downloadUri.Scheme != Uri.UriSchemeHttp))
        {
            Ignore(context, "the download link is not an http(s) URL");
            return;
        }

        var patient = await _dbContext.Patients
            .IgnoreQueryFilters()
            .FirstOrDefaultAsync(p => !p.IsDeleted && p.ClinicId == clinic.ClinicId && p.SyncPatientId == message.PatientId, ct);
        var bookingExists = patient != null && await _dbContext.Appointments
            .IgnoreQueryFilters()
            .AnyAsync(a => !a.IsDeleted && a.ClinicId == clinic.ClinicId && a.DraftId == message.DraftId && a.PatientId == patient.Id, ct);
        if (patient == null || !bookingExists)
        {
            throw new InvalidOperationException(
                $"Booking {message.DraftId} of patient {message.PatientId} has not reached clinic {clinic.ClinicId} yet; file {message.FileId} will be retried.");
        }

        var attachment = await _dbContext.RecordAttachments
            .IgnoreQueryFilters()
            .FirstOrDefaultAsync(a => !a.IsDeleted && a.ClinicId == clinic.ClinicId && a.Id == message.FileId, ct);
        if (attachment != null && attachment.PatientId != patient.Id)
        {
            Ignore(context, $"file {message.FileId} belongs to another patient");
            return;
        }

        if (attachment?.EncryptionIvBase64 != null)
        {
            _logger.LogInformation("[ClinicEz.Clinic] File {FileId} is already stored. Skipping.", message.FileId);
            return;
        }

        if (message.ExpiresAtUtc <= DateTime.UtcNow)
        {
            _logger.LogWarning("[ClinicEz.Clinic] The download link for file {FileId} has expired. Dropping.", message.FileId);
            return;
        }

        var content = await DownloadAsync(downloadUri, message.FileId, ct);
        if (content == null) return;

        var encrypted = await _encryption.EncryptAsync(content, clinic.TenantId, clinic.ClinicId, ct);
        var storageKey = $"tenants/{clinic.TenantId}/clinics/{clinic.ClinicId}/records/{message.FileId}.cez";
        await _storage.SaveEncryptedFileAsync(storageKey, encrypted.Ciphertext, ct);

        var now = DateTime.UtcNow;
        var fileName = string.IsNullOrWhiteSpace(message.FileName) ? "attachment.bin" : message.FileName;
        if (attachment == null)
        {
            attachment = new ClinicRecordAttachment
            {
                Id = message.FileId,
                TenantId = clinic.TenantId,
                ClinicId = clinic.ClinicId,
                PatientId = patient.Id,
                RecordType = AppointmentBookedHandler.MapRecordType(message.DocumentTypeCode),
                Title = fileName,
                FileName = fileName,
                StorageUri = storageKey,
                DocumentDate = DateOnly.FromDateTime(now),
                Notes = $"Attached by patient during booking (Draft #{message.DraftId:N})",
                UploadedByStaffName = "Patient (shared at booking)",
                VerificationStatus = "PendingVerification",
                CreatedAt = now,
                CreatedBy = "System:PatientRecordShared"
            };
            await _dbContext.RecordAttachments.AddAsync(attachment, ct);
        }

        attachment.StorageUri = storageKey;
        attachment.ContentType = string.IsNullOrWhiteSpace(message.MimeType) ? "application/octet-stream" : message.MimeType;
        attachment.FileSizeBytes = content.LongLength;
        attachment.EncryptionAlgorithm = "AES-256-GCM";
        attachment.EncryptionIvBase64 = encrypted.IvBase64;
        attachment.EncryptionTagBase64 = encrypted.TagBase64;
        attachment.WrappedKeyJson = encrypted.WrappedKeyJson;
        attachment.EncryptedHash = encrypted.EncryptedHash;
        attachment.EncryptedSizeBytes = encrypted.Ciphertext.LongLength;
        attachment.UpdatedAt = now;

        await _dbContext.SaveChangesAsync(ct);

        _logger.LogInformation("[ClinicEz.Clinic] Stored booking attachment {FileId} for clinic patient {PatientId}.", message.FileId, patient.Id);
    }

    private async Task<byte[]?> DownloadAsync(Uri url, Guid fileId, CancellationToken ct)
    {
        try
        {
            using var client = _httpClientFactory.CreateClient(HttpClientName);
            using var response = await client.GetAsync(url, HttpCompletionOption.ResponseHeadersRead, ct);
            if (!response.IsSuccessStatusCode)
            {
                _logger.LogWarning("[ClinicEz.Clinic] Download of file {FileId} failed with HTTP {Status}. Dropping.", fileId, (int)response.StatusCode);
                return null;
            }

            if (response.Content.Headers.ContentLength > MaxFileBytes)
            {
                _logger.LogWarning("[ClinicEz.Clinic] File {FileId} is larger than {Max} bytes. Dropping.", fileId, MaxFileBytes);
                return null;
            }

            await using var stream = await response.Content.ReadAsStreamAsync(ct);
            using var buffer = new MemoryStream();
            var chunk = ArrayPool<byte>.Shared.Rent(81920);
            try
            {
                int read;
                while ((read = await stream.ReadAsync(chunk, ct)) > 0)
                {
                    if (buffer.Length + read > MaxFileBytes)
                    {
                        _logger.LogWarning("[ClinicEz.Clinic] File {FileId} is larger than {Max} bytes. Dropping.", fileId, MaxFileBytes);
                        return null;
                    }

                    buffer.Write(chunk, 0, read);
                }
            }
            finally
            {
                ArrayPool<byte>.Shared.Return(chunk);
            }

            return buffer.ToArray();
        }
        catch (HttpRequestException ex)
        {
            _logger.LogWarning(ex, "[ClinicEz.Clinic] Download of file {FileId} failed. Dropping.", fileId);
            return null;
        }
    }

    private void Ignore(InteropMessageContext context, string reason) =>
        _logger.LogWarning("[ClinicEz.Clinic] Ignoring {Type} message {MessageId}: {Reason}.", context.Type, context.MessageId, reason);
}
