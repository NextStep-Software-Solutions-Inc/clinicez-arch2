using System.Text.Json;
using PatientApp.Application.Common.Constants;
using PatientApp.Domain.Entities;
using PatientApp.Domain.Enums;
using PatientApp.Domain.Interfaces;
using PatientApp.Infrastructure.Services.Jobs;

namespace PatientApp.Infrastructure.Services.Jobs.Processors;

public sealed class FileFolderSyncProcessor : ISyncEntityProcessor
{
    private readonly IFileFolderRepository _folderRepository;

    private static readonly JsonSerializerOptions JsonOptions =
        new() { PropertyNameCaseInsensitive = true };

    public FileFolderSyncProcessor(IFileFolderRepository folderRepository)
        => _folderRepository = folderRepository;

    public string EntityType => SyncableEntityTypes.FileFolder;

    public async Task<SyncProcessResult> ProcessAsync(SyncLog log, CancellationToken ct)
    {
        if (log.Operation == SyncOperation.Delete)
        {
            if (!log.EntityId.HasValue)
                return SyncProcessResult.Rejected("EntityId is required for Delete operations.");

            var toDelete = await _folderRepository.GetByIdAsync(log.EntityId.Value, ct);
            if (toDelete is null) return SyncProcessResult.Success(); // Idempotent

            _folderRepository.Delete(toDelete);
            return SyncProcessResult.Success();
        }

        if (string.IsNullOrWhiteSpace(log.PayloadJson))
            return SyncProcessResult.Rejected("PayloadJson is required for Create and Update operations.");

        var payload = JsonSerializer.Deserialize<FileFolderSyncPayload>(log.PayloadJson, JsonOptions);
        if (payload is null)
            return SyncProcessResult.Rejected("Failed to deserialize FileFolder payload.");

        if (log.Operation == SyncOperation.Create)
        {
            if (!log.EntityId.HasValue)
                return SyncProcessResult.Rejected("EntityId is required for FileFolder Create operations.");

            var existing = await _folderRepository.GetByIdAsync(log.EntityId.Value, ct);
            if (existing is not null)
                return SyncProcessResult.Success();

            var folder = new FileFolder
            {
                Id = log.EntityId.Value,
                PatientId = log.PatientId,
                ClientId = payload.ClientId,
                ParentId = payload.ParentId,
                Name = payload.Name,
                SyncStatus = FileSyncStatus.Synced
            };

            await _folderRepository.AddAsync(folder, ct);
            return SyncProcessResult.Success();
        }

        if (log.Operation == SyncOperation.Update)
        {
            if (!log.EntityId.HasValue)
                return SyncProcessResult.Rejected("EntityId is required for FileFolder Update operations.");

            var folder = await _folderRepository.GetByIdAsync(log.EntityId.Value, ct);

            if (folder is null)
                return SyncProcessResult.Conflict("FileFolder no longer exists on the server.");

            var serverTimestamp = folder.UpdatedAt ?? folder.CreatedAt;
            if (payload.UpdatedAt < serverTimestamp)
            {
                return SyncProcessResult.Conflict(
                    $"Server version is newer. Client={payload.UpdatedAt:O}, Server={serverTimestamp:O}. Server version retained.");
            }

            folder.Name = payload.Name;
            folder.ParentId = payload.ParentId;
            folder.SyncStatus = FileSyncStatus.Synced;
            
            _folderRepository.Update(folder);
            return SyncProcessResult.Success();
        }

        return SyncProcessResult.Rejected($"Unsupported operation: {log.Operation}");
    }
}
