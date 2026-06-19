using Microsoft.EntityFrameworkCore;
using PatientApp.Application.Common.Constants;
using PatientApp.Domain.Entities;
using PatientApp.Infrastructure.Persistence;

namespace PatientApp.Infrastructure.Services.Jobs.Processors;

internal sealed class FileFolderPayload
{
    public Guid ClientId { get; set; }
    public Guid PatientId { get; set; }
    public Guid? ParentId { get; set; }
    public string Name { get; set; } = string.Empty;
    public DateTime UpdatedAt { get; set; }
}

internal sealed class FileFolderSyncProcessor
    : SimpleListSyncProcessor<FileFolder, FileFolderPayload>
{
    public FileFolderSyncProcessor(ApplicationDbContext ctx) : base(ctx) { }
    public override string EntityType => SyncableEntityTypes.FileFolder;

    protected override async Task<FileFolder?> FindExistingAsync(FileFolderPayload p, Guid? id, CancellationToken ct)
        => id.HasValue ? await Context.FileFolders.FindAsync([id.Value], ct)
            : await Context.FileFolders.FirstOrDefaultAsync(e => e.ClientId == p.ClientId, ct);

    protected override FileFolder CreateFromPayload(FileFolderPayload p) => new()
        { ClientId = p.ClientId, PatientId = p.PatientId, ParentId = p.ParentId, Name = p.Name };

    protected override void ApplyUpdate(FileFolder e, FileFolderPayload p)
        { e.ParentId = p.ParentId; e.Name = p.Name; }

    protected override DateTime GetPayloadTimestamp(FileFolderPayload p) => p.UpdatedAt;
    protected override void SetEntityId(SyncLog log, FileFolder e) => log.EntityId = e.Id;
}
