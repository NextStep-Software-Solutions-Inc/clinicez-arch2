using Microsoft.EntityFrameworkCore;
using PatientApp.Application.Common.Constants;
using PatientApp.Domain.Entities;
using PatientApp.Domain.Enums;
using PatientApp.Infrastructure.Persistence;

namespace PatientApp.Infrastructure.Services.Jobs.Processors;

internal sealed class DentalVisionPayload
{
    public Guid ClientId { get; set; }
    public Guid PatientId { get; set; }
    public string? DentistName { get; set; }
    public string? DentistClinic { get; set; }
    public string? OrthodonticDevice { get; set; }
    public string? EyeDoctorName { get; set; }
    public string? CorrectiveLenses { get; set; }
    public DateTime UpdatedAt { get; set; }
}

internal sealed class PatientDentalVisionSyncProcessor
    : SimpleListSyncProcessor<PatientDentalVision, DentalVisionPayload>
{
    public PatientDentalVisionSyncProcessor(ApplicationDbContext ctx) : base(ctx) { }
    public override string EntityType => SyncableEntityTypes.PatientDentalVision;

    protected override async Task<PatientDentalVision?> FindExistingAsync(DentalVisionPayload p, Guid? id, CancellationToken ct)
        => id.HasValue ? await Context.PatientDentalVisions.FindAsync([id.Value], ct)
            : await Context.PatientDentalVisions.FirstOrDefaultAsync(e => e.PatientId == p.PatientId || e.ClientId == p.ClientId, ct);

    protected override PatientDentalVision CreateFromPayload(DentalVisionPayload p) => new()
    {
        ClientId = p.ClientId, PatientId = p.PatientId, DentistName = p.DentistName, DentistClinic = p.DentistClinic,
        OrthodonticDevice = p.OrthodonticDevice, EyeDoctorName = p.EyeDoctorName,
        CorrectiveLenses = Enum.TryParse<CorrectiveLenses>(p.CorrectiveLenses, true, out var cl) ? cl : null,
    };

    protected override void ApplyUpdate(PatientDentalVision e, DentalVisionPayload p)
    {
        e.DentistName = p.DentistName; e.DentistClinic = p.DentistClinic; e.OrthodonticDevice = p.OrthodonticDevice;
        e.EyeDoctorName = p.EyeDoctorName;
        e.CorrectiveLenses = Enum.TryParse<CorrectiveLenses>(p.CorrectiveLenses, true, out var cl) ? cl : e.CorrectiveLenses;
    }

    protected override DateTime GetPayloadTimestamp(DentalVisionPayload p) => p.UpdatedAt;
    protected override void SetEntityId(SyncLog log, PatientDentalVision e) => log.EntityId = e.Id;
}
