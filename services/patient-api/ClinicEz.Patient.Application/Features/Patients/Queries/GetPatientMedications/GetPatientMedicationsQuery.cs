using ClinicEz.Patient.Application.Common.DTOs;
using ClinicEz.Patient.Domain.Interfaces;
using MediatR;

namespace ClinicEz.Patient.Application.Features.Patients.Queries.GetPatientMedications;

public sealed record GetPatientMedicationsQuery(Guid PatientId) : IRequest<IReadOnlyList<PatientMedicationDto>>;

public sealed class GetPatientMedicationsQueryHandler : IRequestHandler<GetPatientMedicationsQuery, IReadOnlyList<PatientMedicationDto>>
{
    private readonly IPatientRepository _patientRepository;

    public GetPatientMedicationsQueryHandler(IPatientRepository patientRepository)
        => _patientRepository = patientRepository;

    public async Task<IReadOnlyList<PatientMedicationDto>> Handle(
        GetPatientMedicationsQuery request, CancellationToken cancellationToken)
    {
        var meds = await _patientRepository.GetMedicationsAsync(request.PatientId, cancellationToken);
        return meds.Select(m => new PatientMedicationDto(
            m.Id,
            m.ClientId,
            m.MedicationName,
            m.GenericName,
            m.Dosage,
            m.Frequency,
            m.Route,
            m.StartDate,
            m.EndDate,
            m.IsCurrentlyTaking,
            m.PrescribedBy,
            m.Purpose,
            m.Notes,
            m.UpdatedAt
        )).ToList();
    }
}
