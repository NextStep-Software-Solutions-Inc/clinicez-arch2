using ClinicEz.Patient.Application.Common.Helpers;
using ClinicEz.Patient.Domain.Entities;
using ClinicEz.Patient.Domain.Enums;
using ClinicEz.Patient.Domain.Interfaces;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Patient.Application.Features.Patients.Commands.CreatePatient;

public sealed class CreatePatientCommandHandler : IRequestHandler<CreatePatientCommand, Guid>
{
    private readonly IPatientRepository _patientRepository;
    private readonly IUnitOfWork _unitOfWork;

    public CreatePatientCommandHandler(IPatientRepository patientRepository, IUnitOfWork unitOfWork)
    {
        _patientRepository = patientRepository;
        _unitOfWork = unitOfWork;
    }

    public async Task<Guid> Handle(CreatePatientCommand request, CancellationToken cancellationToken)
    {
        var existing = await _patientRepository.GetByClerkUserIdAsync(request.ClerkUserId, cancellationToken);
        if (existing is not null)
            return existing.Id;

        if (request.VerifiedEmails is { Count: > 0 })
        {
            var unlinked = await _patientRepository.GetSingleUnlinkedByVerifiedEmailsAsync(
                request.VerifiedEmails, cancellationToken);
            if (unlinked is not null)
            {
                unlinked.ClerkUserId = request.ClerkUserId;
                if (string.IsNullOrWhiteSpace(unlinked.FirstName) && !string.IsNullOrWhiteSpace(request.FirstName))
                    unlinked.FirstName = request.FirstName.Trim();
                if (string.IsNullOrWhiteSpace(unlinked.LastName) && !string.IsNullOrWhiteSpace(request.LastName))
                    unlinked.LastName = request.LastName.Trim();
                if (unlinked.DateOfBirth is null && request.DateOfBirth.HasValue)
                    unlinked.DateOfBirth = request.DateOfBirth;
                if (!unlinked.Sex.HasValue && Enum.TryParse<SexType>(request.Sex, true, out var parsedSex))
                    unlinked.Sex = parsedSex;
                unlinked.UpdatedAt = DateTime.UtcNow;
                unlinked.UpdatedBy = "System:ClerkEmailReclaim";
                _patientRepository.Update(unlinked);
                try
                {
                    await _unitOfWork.SaveChangesAsync(cancellationToken);
                    return unlinked.Id;
                }
                catch (DbUpdateException ex) when (ClerkReclaimConcurrencyHelper.IsUniqueOrConcurrencyConflict(ex))
                {
                    _unitOfWork.ClearChangeTracker();
                    var raced = await _patientRepository.GetByClerkUserIdAsync(request.ClerkUserId, cancellationToken);
                    if (raced is not null)
                        return raced.Id;
                    throw;
                }
            }
        }

        var patient = new Domain.Entities.Patient
        {
            ClientId = Guid.NewGuid(),
            ClerkUserId = request.ClerkUserId,
            FirstName = request.FirstName,
            MiddleName = request.MiddleName,
            LastName = request.LastName,
            Suffix = request.Suffix,
            Sex = Enum.TryParse<SexType>(request.Sex, true, out var sex) ? sex : null,
            DateOfBirth = request.DateOfBirth,
            Nationality = request.Nationality ?? "Filipino",
        };

        await _patientRepository.AddAsync(patient, cancellationToken);
        try
        {
            await _unitOfWork.SaveChangesAsync(cancellationToken);
            return patient.Id;
        }
        catch (DbUpdateException ex) when (ClerkReclaimConcurrencyHelper.IsUniqueOrConcurrencyConflict(ex))
        {
            _unitOfWork.ClearChangeTracker();
            var raced = await _patientRepository.GetByClerkUserIdAsync(request.ClerkUserId, cancellationToken);
            if (raced is not null)
                return raced.Id;
            throw;
        }
    }
}
