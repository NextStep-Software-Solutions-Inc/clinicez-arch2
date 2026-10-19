using System.Globalization;
using ClinicEz.Patient.Application.Features.Documents;
using ClinicEz.Patient.Application.Features.Sharing;
using ClinicEz.Patient.Application.Features.Sharing.Queries.GetAccessGrants;
using ClinicEz.Patient.Domain.Interfaces;
using ClinicEz.Shared.Exceptions;
using MediatR;

namespace ClinicEz.Patient.Application.Features.Sync.Queries.GetSyncChanges;

/// <summary>Incremental pull of the read-only clinical rows written by facilities, so any of the patient's devices can hydrate.</summary>
public sealed record GetSyncChangesQuery(Guid PatientId, string? Since, int Take) : IRequest<SyncChangesDto>;

public sealed class GetSyncChangesQueryHandler : IRequestHandler<GetSyncChangesQuery, SyncChangesDto>
{
    public const int DefaultPageSize = 200;
    public const int MaxPageSize = 500;

    private readonly IPatientDocumentRepository _documents;
    private readonly IClinicRepository _clinics;
    private readonly PatientDocumentMapper _mapper;
    private readonly TimeProvider _clock;

    public GetSyncChangesQueryHandler(
        IPatientDocumentRepository documents, IClinicRepository clinics, PatientDocumentMapper mapper, TimeProvider clock)
    {
        _documents = documents;
        _clinics = clinics;
        _mapper = mapper;
        _clock = clock;
    }

    public async Task<SyncChangesDto> Handle(GetSyncChangesQuery request, CancellationToken cancellationToken)
    {
        var since = ParseCursor(request.Since);
        var take = request.Take <= 0 ? DefaultPageSize : Math.Min(request.Take, MaxPageSize);

        var changes = await _documents.GetChangesAsync(request.PatientId, since, take, cancellationToken);

        var names = await FacilityNames.ForAsync(_clinics, changes.Grants.Select(g => g.FacilityId), cancellationToken);
        var now = _clock.GetUtcNow().UtcDateTime;

        var results = new List<LabResultDto>(changes.Reports.Count);
        foreach (var report in changes.Reports)
            results.Add(await _mapper.ToDtoAsync(report, cancellationToken));

        return new SyncChangesDto(
            changes.Cursor.Ticks.ToString(CultureInfo.InvariantCulture),
            changes.HasMore,
            changes.LabSlips.Select(PatientDocumentMapper.ToDto).ToList(),
            changes.Prescriptions.Select(PatientDocumentMapper.ToDto).ToList(),
            results,
            changes.Certificates.Select(PatientDocumentMapper.ToDto).ToList(),
            changes.Grants.Select(g => AccessGrantMapper.ToDto(g, names.GetValueOrDefault(g.FacilityId), now)).ToList(),
            changes.Notifications.Select(PatientDocumentMapper.ToDto).ToList());
    }

    private static DateTime? ParseCursor(string? cursor)
    {
        if (string.IsNullOrWhiteSpace(cursor))
            return null;

        if (!long.TryParse(cursor, NumberStyles.None, CultureInfo.InvariantCulture, out var ticks)
            || ticks < DateTime.MinValue.Ticks || ticks > DateTime.MaxValue.Ticks)
            throw new BadRequestException("The 'since' cursor is not valid.");

        return new DateTime(ticks, DateTimeKind.Utc);
    }
}