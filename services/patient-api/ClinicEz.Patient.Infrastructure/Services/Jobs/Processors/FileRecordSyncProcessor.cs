using System.Text.Json;
using ClinicEz.Patient.Application.Common.Constants;
using ClinicEz.Patient.Application.Common.Interfaces;
using ClinicEz.Patient.Domain.Entities;
using ClinicEz.Patient.Domain.Enums;
using ClinicEz.Patient.Domain.Interfaces;
using ClinicEz.Patient.Infrastructure.Services.Jobs;

namespace ClinicEz.Patient.Infrastructure.Services.Jobs.Processors;

public sealed class FileRecordSyncProcessor : ISyncEntityProcessor
{
    private readonly IFileRecordRepository _fileRepository;
    private readonly IPatientStorageProfileRepository _storageProfileRepository;
    private readonly IStorageService _storageService;

    private static readonly JsonSerializerOptions JsonOptions =
        new() { PropertyNameCaseInsensitive = true };

    public FileRecordSyncProcessor(
        IFileRecordRepository fileRepository,
        IPatientStorageProfileRepository storageProfileRepository,
        IStorageService storageService)
    {
        _fileRepository = fileRepository;
        _storageProfileRepository = storageProfileRepository;
        _storageService = storageService;
    }

    public string EntityType => SyncableEntityTypes.FileRecord;

    public async Task<SyncProcessResult> ProcessAsync(SyncLog log, CancellationToken ct)
    {
        if (log.Operation == SyncOperation.Delete)
        {
            if (!log.EntityId.HasValue)
                return SyncProcessResult.Rejected("EntityId is required for Delete operations.");

            var toDelete = await _fileRepository.GetByIdAsync(log.EntityId.Value, ct);
            if (toDelete is null) return SyncProcessResult.Success(); // Idempotent

            // Decrement Storage Quota
            var profile = await _storageProfileRepository.GetByPatientIdAsync(log.PatientId, ct);
            if (profile != null)
            {
                var bytesFreed = toDelete.EncryptedSizeBytes ?? toDelete.SizeBytes;
                profile.UsedBytes = Math.Max(0, profile.UsedBytes - bytesFreed);
                _storageProfileRepository.Update(profile);
            }

            // Physically delete from Cloudflare R2
            if (!string.IsNullOrWhiteSpace(toDelete.StorageKey))
            {
                try
                {
                    await _storageService.DeleteAsync(toDelete.StorageKey, ct);
                }
                catch (Exception ex)
                {
                    // Log but don't fail the sync log processing just because S3 threw an exception
                    Console.WriteLine($"Failed to physically delete file from R2: {ex.Message}");
                }
            }

            _fileRepository.Delete(toDelete);
            return SyncProcessResult.Success();
        }

        if (string.IsNullOrWhiteSpace(log.PayloadJson))
            return SyncProcessResult.Rejected("PayloadJson is required for Update operations.");

        var payload = JsonSerializer.Deserialize<FileRecordSyncPayload>(log.PayloadJson, JsonOptions);
        if (payload is null)
            return SyncProcessResult.Rejected("Failed to deserialize FileRecord payload.");

        if (log.Operation == SyncOperation.Create)
        {
            // Creation of binary files MUST go through GenerateUploadUrlEndpoint + CompleteFileUploadEndpoint
            // We do not support processing a 'Create' through the generic JSON SyncPayload route
            return SyncProcessResult.Rejected("FileRecord creations are not supported via Bulk Sync. Use the /files/intent API instead.");
        }

        if (log.Operation == SyncOperation.Update)
        {
            if (!log.EntityId.HasValue)
                return SyncProcessResult.Rejected("EntityId is required for FileRecord Update operations.");

            var file = await _fileRepository.GetByIdAsync(log.EntityId.Value, ct);

            if (file is null)
                return SyncProcessResult.Conflict("FileRecord no longer exists on the server.");

            var serverTimestamp = file.UpdatedAt ?? file.CreatedAt;
            if (payload.UpdatedAt < serverTimestamp)
            {
                return SyncProcessResult.Conflict(
                    $"Server version is newer. Client={payload.UpdatedAt:O}, Server={serverTimestamp:O}. Server version retained.");
            }

            file.FileName = payload.FileName;
            file.FolderId = payload.FolderId;
            file.SyncStatus = FileSyncStatus.Synced;
            
            _fileRepository.Update(file);
            return SyncProcessResult.Success();
        }

        return SyncProcessResult.Rejected($"Unsupported operation: {log.Operation}");
    }
}
