using Clinic EZ.Shared.Exceptions;
using MediatR;
using PatientAppBE.Domain.Entities;
using PatientAppBE.Domain.Interfaces;
using PatientAppBE.Domain.Enums;

namespace PatientAppBE.Application.Features.Clinics.Commands.JoinClinic;

public sealed class JoinClinicCommandHandler : IRequestHandler<JoinClinicCommand, Guid>
{
    private readonly IPatientRepository _patientRepo;
    private readonly IClinicRepository _clinicRepo;
    private readonly IClinicMembershipRepository _membershipRepo;
    private readonly IUnitOfWork _uow;

    public JoinClinicCommandHandler(
        IPatientRepository patientRepo, IClinicRepository clinicRepo,
        IClinicMembershipRepository membershipRepo, IUnitOfWork uow)
    {
        _patientRepo = patientRepo; _clinicRepo = clinicRepo;
        _membershipRepo = membershipRepo; _uow = uow;
    }

    public async Task<Guid> Handle(JoinClinicCommand request, CancellationToken cancellationToken)
    {
        _ = await _patientRepo.GetByIdAsync(request.PatientId, cancellationToken)
            ?? throw new NotFoundException($"Patient '{request.PatientId}' was not found.");

        _ = await _clinicRepo.GetByIdAsync(request.ClinicId, cancellationToken)
            ?? throw new NotFoundException($"Clinic '{request.ClinicId}' was not found.");

        var existing = await _membershipRepo.GetByPatientAndClinicWithDeletedAsync(request.PatientId, request.ClinicId, cancellationToken);
        if (existing is not null)
        {
            if (!existing.IsDeleted && (existing.Status == ClinicMembershipStatus.Active || existing.Status == ClinicMembershipStatus.Pending))
            {
                throw new ConflictException($"Already a member of this clinic.");
            }

            if (existing.IsDeleted)
            {
                existing.IsDeleted = false;
                existing.DeletedAt = null;
                existing.DeletedBy = null;
            }

            existing.Status = ClinicMembershipStatus.Pending;
            existing.ConsentPrivacyPolicy = request.ConsentPrivacyPolicy;
            existing.ConsentTermsAndConditions = request.ConsentTermsAndConditions;
            existing.ConsentDataSharing = request.ConsentDataSharing;
            existing.ConsentedAt = DateTime.UtcNow;

            _membershipRepo.Update(existing);
            await _uow.SaveChangesAsync(cancellationToken);
            return existing.Id;
        }

        var membership = new ClinicMembership
        {
            ClientId = Guid.NewGuid(),
            PatientId = request.PatientId,
            ClinicId = request.ClinicId,
            ConsentPrivacyPolicy = request.ConsentPrivacyPolicy,
            ConsentTermsAndConditions = request.ConsentTermsAndConditions,
            ConsentDataSharing = request.ConsentDataSharing,
            ConsentedAt = DateTime.UtcNow,
        };

        await _membershipRepo.AddAsync(membership, cancellationToken);
        await _uow.SaveChangesAsync(cancellationToken);
        return membership.Id;
    }
}
