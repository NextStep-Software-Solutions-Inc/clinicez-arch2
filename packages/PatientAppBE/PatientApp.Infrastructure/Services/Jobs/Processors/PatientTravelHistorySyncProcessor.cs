using Microsoft.EntityFrameworkCore;
using PatientApp.Application.Common.Constants;
using PatientApp.Domain.Entities;
using PatientApp.Domain.Enums;
using PatientApp.Infrastructure.Persistence;

namespace PatientApp.Infrastructure.Services.Jobs.Processors;

internal sealed class TravelHistoryPayload
{
    public Guid ClientId { get; set; }
    public Guid PatientId { get; set; }
    public string Destination { get; set; } = string.Empty;
    public string? CityProvince { get; set; }
    public DateOnly? DepartureDate { get; set; }
    public DateOnly? ReturnDate { get; set; }
    public string? Purpose { get; set; }
    public string? IllnessDuringAfterTravel { get; set; }
    public DateTime UpdatedAt { get; set; }
}

internal sealed class PatientTravelHistorySyncProcessor
    : SimpleListSyncProcessor<PatientTravelHistory, TravelHistoryPayload>
{
    public PatientTravelHistorySyncProcessor(ApplicationDbContext ctx) : base(ctx) { }
    public override string EntityType => SyncableEntityTypes.PatientTravelHistory;

    protected override async Task<PatientTravelHistory?> FindExistingAsync(TravelHistoryPayload p, Guid? id, CancellationToken ct)
        => id.HasValue ? await Context.PatientTravelHistories.FindAsync([id.Value], ct)
            : await Context.PatientTravelHistories.FirstOrDefaultAsync(e => e.ClientId == p.ClientId, ct);

    protected override PatientTravelHistory CreateFromPayload(TravelHistoryPayload p) => new()
    {
        ClientId = p.ClientId, PatientId = p.PatientId, Destination = p.Destination, CityProvince = p.CityProvince,
        DepartureDate = p.DepartureDate, ReturnDate = p.ReturnDate,
        Purpose = Enum.TryParse<TravelPurpose>(p.Purpose, true, out var tp) ? tp : null,
        IllnessDuringAfterTravel = p.IllnessDuringAfterTravel,
    };

    protected override void ApplyUpdate(PatientTravelHistory e, TravelHistoryPayload p)
    {
        e.Destination = p.Destination; e.CityProvince = p.CityProvince; e.DepartureDate = p.DepartureDate;
        e.ReturnDate = p.ReturnDate;
        e.Purpose = Enum.TryParse<TravelPurpose>(p.Purpose, true, out var tp) ? tp : e.Purpose;
        e.IllnessDuringAfterTravel = p.IllnessDuringAfterTravel;
    }

    protected override DateTime GetPayloadTimestamp(TravelHistoryPayload p) => p.UpdatedAt;
    protected override void SetEntityId(SyncLog log, PatientTravelHistory e) => log.EntityId = e.Id;
}
