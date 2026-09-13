namespace PatientAppBE.Infrastructure.Services.Jobs;

public sealed record SyncProcessResult(bool Applied, bool IsConflict = false, string? ConflictDetail = null)
{
    public static SyncProcessResult Success() => new(Applied: true);

    public static SyncProcessResult Conflict(string detail) =>
        new(Applied: false, IsConflict: true, ConflictDetail: detail);

    public static SyncProcessResult Rejected(string detail) =>
        new(Applied: false, IsConflict: false, ConflictDetail: detail);
}
