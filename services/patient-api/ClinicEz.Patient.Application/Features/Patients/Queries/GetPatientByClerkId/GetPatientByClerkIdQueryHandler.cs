using ClinicEz.Patient.Application.Common.DTOs;
using ClinicEz.Patient.Application.Common.Helpers;
using ClinicEz.Patient.Domain.Interfaces;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Patient.Application.Features.Patients.Queries.GetPatientByClerkId;

public sealed class GetPatientByClerkIdQueryHandler : IRequestHandler<GetPatientByClerkIdQuery, PatientSummaryDto?>
{
    private readonly IPatientRepository _patientRepository;
    private readonly IUnitOfWork? _unitOfWork;

    public GetPatientByClerkIdQueryHandler(IPatientRepository patientRepository, IUnitOfWork? unitOfWork = null)
    {
        _patientRepository = patientRepository;
        _unitOfWork = unitOfWork;
    }

    public async Task<PatientSummaryDto?> Handle(GetPatientByClerkIdQuery request, CancellationToken cancellationToken)
    {
        var reclaimedNow = false;
        var patient = await _patientRepository.GetByClerkUserIdAsync(request.ClerkUserId, cancellationToken);
        if (patient is null && _unitOfWork is not null && request.VerifiedEmails is { Count: > 0 })
        {
            var unlinked = await _patientRepository.GetSingleUnlinkedByVerifiedEmailsAsync(
                request.VerifiedEmails, cancellationToken);
            if (unlinked is not null)
            {
                unlinked.ClerkUserId = request.ClerkUserId;
                unlinked.UpdatedAt = DateTime.UtcNow;
                unlinked.UpdatedBy = "System:ClerkEmailReclaim";
                _patientRepository.Update(unlinked);
                try
                {
                    await _unitOfWork.SaveChangesAsync(cancellationToken);
                    patient = unlinked;
                    reclaimedNow = true;
                }
                catch (DbUpdateException ex) when (ClerkReclaimConcurrencyHelper.IsUniqueOrConcurrencyConflict(ex))
                {
                    _unitOfWork.ClearChangeTracker();
                    patient = await _patientRepository.GetByClerkUserIdAsync(request.ClerkUserId, cancellationToken);
                    if (patient is null)
                        throw;
                }
            }
        }

        return patient is null ? null : new PatientSummaryDto(
            patient.Id,
            patient.FirstName, patient.MiddleName, patient.LastName, patient.Suffix,
            patient.Sex?.ToString(), patient.DateOfBirth, patient.PlaceOfBirth,
            patient.BloodType?.ToString(), patient.CivilStatus?.ToString(),
            patient.Nationality, patient.Ethnicity, patient.Religion, patient.PrimaryLanguage,
            patient.EducationLevel?.ToString(),
            patient.Mobile, patient.AltPhone, patient.Email, patient.MessengerHandle,
            patient.AvatarUrl,
            patient.ConsentToShareInfo,
            patient.ClinicEzId,
            reclaimedNow || string.Equals(patient.UpdatedBy, "System:ClerkEmailReclaim", StringComparison.Ordinal));
    }
}
