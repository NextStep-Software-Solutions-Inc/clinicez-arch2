using ClinicEz.Patient.Application.Common.DTOs;
using ClinicEz.Patient.Application.Features.Documents;
using ClinicEz.Patient.Application.Features.Patients.Queries.GetPatientFullRecord;
using ClinicEz.Patient.Application.Features.Sharing.Queries.GetAccessGrants;
using ClinicEz.Patient.Domain.Interfaces;
using MediatR;

namespace ClinicEz.Patient.Application.Features.Sharing.Queries.ExportPatientData;

public sealed record ExportedAppointmentDto(Guid Id, Guid ClinicId, string? Subject, string? ServiceType, DateTime ScheduledAt, string Status);

/// <summary>Everything ClinicEZ holds about the patient, in one document the patient can keep (right of access and portability).</summary>
public sealed record PatientDataExportDto(
    DateTime ExportedAt,
    string ClinicEzId,
    PatientFullRecordDto Patient,
    IReadOnlyList<ExportedAppointmentDto> Appointments,
    IReadOnlyList<LabRequestDto> LabRequests,
    IReadOnlyList<PrescriptionDto> Prescriptions,
    IReadOnlyList<LabResultDto> LabResults,
    IReadOnlyList<MedicalCertificateDto> MedicalCertificates,
    IReadOnlyList<AccessGrantDto> Grants,
    IReadOnlyList<AccessLogDto> AccessLog);

public sealed record ExportPatientDataQuery(Guid PatientId) : IRequest<PatientDataExportDto>;

public sealed class ExportPatientDataQueryHandler : IRequestHandler<ExportPatientDataQuery, PatientDataExportDto>
{
    private readonly ISender _sender;
    private readonly IAppointmentRepository _appointments;
    private readonly IPatientDocumentRepository _documents;
    private readonly IPatientAccessRepository _access;
    private readonly IClinicRepository _clinics;
    private readonly PatientDocumentMapper _mapper;
    private readonly TimeProvider _clock;

    public ExportPatientDataQueryHandler(
        ISender sender,
        IAppointmentRepository appointments,
        IPatientDocumentRepository documents,
        IPatientAccessRepository access,
        IClinicRepository clinics,
        PatientDocumentMapper mapper,
        TimeProvider clock)
    {
        _sender = sender;
        _appointments = appointments;
        _documents = documents;
        _access = access;
        _clinics = clinics;
        _mapper = mapper;
        _clock = clock;
    }

    public async Task<PatientDataExportDto> Handle(ExportPatientDataQuery request, CancellationToken cancellationToken)
    {
        var record = await _sender.Send(new GetPatientFullRecordQuery(request.PatientId), cancellationToken);
        var now = _clock.GetUtcNow().UtcDateTime;

        var appointments = await _appointments.GetByPatientAsync(request.PatientId, cancellationToken);
        var slips = await _documents.GetLabSlipsAsync(request.PatientId, cancellationToken);
        var prescriptions = await _documents.GetPrescriptionsAsync(request.PatientId, cancellationToken);
        var reports = await _documents.GetLabReportsAsync(request.PatientId, cancellationToken);
        var certificates = await _documents.GetCertificatesAsync(request.PatientId, cancellationToken);
        var grants = await _access.GetGrantsAsync(request.PatientId, cancellationToken);
        var (logs, _) = await _access.GetLogAsync(request.PatientId, null, 0, int.MaxValue, cancellationToken);

        var names = await FacilityNames.ForAsync(_clinics, grants.Select(g => g.FacilityId), cancellationToken);
        var facilityByGrant = grants.ToDictionary(g => g.Id, g => g.FacilityId);

        var labResults = new List<LabResultDto>(reports.Count);
        foreach (var report in reports)
            labResults.Add(await _mapper.ToDtoAsync(report, cancellationToken));

        return new PatientDataExportDto(
            now,
            record.Demographics.ClinicEzId,
            record,
            appointments.Select(a => new ExportedAppointmentDto(a.Id, a.ClinicId, a.Subject, a.ServiceType, a.ScheduledAt, a.Status.ToString())).ToList(),
            slips.Select(PatientDocumentMapper.ToDto).ToList(),
            prescriptions.Select(PatientDocumentMapper.ToDto).ToList(),
            labResults,
            certificates.Select(PatientDocumentMapper.ToDto).ToList(),
            grants.Select(g => AccessGrantMapper.ToDto(g, names.GetValueOrDefault(g.FacilityId), now)).ToList(),
            logs.Select(l => new AccessLogDto(
                l.Id, l.GrantId,
                facilityByGrant.TryGetValue(l.GrantId, out var facilityId) ? names.GetValueOrDefault(facilityId) : null,
                l.Actor, l.Action, l.Detail, l.CreatedAt)).ToList());
    }
}
