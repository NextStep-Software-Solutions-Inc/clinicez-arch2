using ClinicEz.Shared.Exceptions;
using FluentValidation;
using ValidationException = ClinicEz.Shared.Exceptions.ValidationException;
using MediatR;
using ClinicEz.Patient.Domain.Entities;
using ClinicEz.Patient.Domain.Enums;
using ClinicEz.Patient.Domain.Interfaces;
using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;

namespace ClinicEz.Patient.Application.Features.Clinics.Commands.UnlockClinicAccess;

public sealed record UnlockClinicAccessCommand(
    Guid ClinicId,
    Guid PatientId,
    string? JoinCode = null,
    Guid? OrganizationId = null,
    bool ConsentPrivacyPolicy = true,
    bool ConsentTermsAndConditions = true,
    bool ConsentDataSharing = true) : IRequest<UnlockClinicResultDto>;

public sealed record UnlockClinicResultDto(
    bool Success,
    bool IsUnlocked,
    Guid? MembershipId = null,
    string? Message = null);

public sealed class UnlockClinicAccessCommandValidator : AbstractValidator<UnlockClinicAccessCommand>
{
    public UnlockClinicAccessCommandValidator()
    {
        RuleFor(x => x.ClinicId).NotEmpty().WithMessage("Clinic ID is required.");
        RuleFor(x => x.PatientId).NotEmpty().WithMessage("Patient ID is required.");

        When(x => !string.IsNullOrWhiteSpace(x.JoinCode), () =>
        {
            RuleFor(x => x.JoinCode!.Trim())
                .Length(6).WithMessage("Join code must be exactly 6 alphanumeric characters.")
                .Matches(@"^[a-zA-Z0-9]{6}$").WithMessage("Join code must contain only alphanumeric characters.");
        });

        When(x => !x.OrganizationId.HasValue, () =>
        {
            RuleFor(x => x.JoinCode)
                .NotEmpty().WithMessage("Either JoinCode or OrganizationId must be provided.");
        });
    }
}

public sealed class UnlockClinicAccessCommandHandler 
    : IRequestHandler<UnlockClinicAccessCommand, UnlockClinicResultDto>
{
    private readonly IPatientRepository _patientRepo;
    private readonly IClinicRepository _clinicRepo;
    private readonly IClinicMembershipRepository _membershipRepo;
    private readonly IOrganizationMembershipRepository _orgMembershipRepo;
    private readonly IUnitOfWork _uow;

    public UnlockClinicAccessCommandHandler(
        IPatientRepository patientRepo,
        IClinicRepository clinicRepo,
        IClinicMembershipRepository membershipRepo,
        IOrganizationMembershipRepository orgMembershipRepo,
        IUnitOfWork uow)
    {
        _patientRepo = patientRepo;
        _clinicRepo = clinicRepo;
        _membershipRepo = membershipRepo;
        _orgMembershipRepo = orgMembershipRepo;
        _uow = uow;
    }

    public async Task<UnlockClinicResultDto> Handle(
        UnlockClinicAccessCommand request, CancellationToken cancellationToken)
    {
        var patient = await _patientRepo.GetByIdAsync(request.PatientId, cancellationToken)
            ?? throw new NotFoundException($"Patient '{request.PatientId}' was not found.");

        var clinic = await _clinicRepo.GetByIdAsync(request.ClinicId, cancellationToken)
            ?? throw new NotFoundException($"Clinic '{request.ClinicId}' was not found.");

        // If clinic is not gated, access is already open
        if (!clinic.IsGated)
        {
            return new UnlockClinicResultDto(true, true, null, "Clinic is open; gated unlock is not required.");
        }

        bool isAuthorized = false;
        string unlockMethod = "join_code";

        // Verification Path 1: Join Code
        if (!string.IsNullOrWhiteSpace(request.JoinCode))
        {
            var code = request.JoinCode.Trim();

            if (clinic.JoinCodeExpiresAt.HasValue && clinic.JoinCodeExpiresAt.Value < DateTime.UtcNow)
            {
                throw new ValidationException("The join code for this clinic has expired.");
            }

            if (!string.Equals(clinic.JoinCode?.Trim(), code, StringComparison.OrdinalIgnoreCase))
            {
                throw new ValidationException("Invalid clinic join code.");
            }

            isAuthorized = true;
            unlockMethod = "join_code";
        }
        // Verification Path 2: Linked Partner Organization Membership
        else if (request.OrganizationId.HasValue)
        {
            var isLinked = clinic.OrganizationLinks.Any(
                l => l.OrganizationId == request.OrganizationId.Value && l.IsActive);
            if (!isLinked)
            {
                throw new ValidationException("The specified organization is not linked to this clinic.");
            }

            var orgMembership = await _orgMembershipRepo.GetByPatientAndOrgAsync(
                patient.Id, request.OrganizationId.Value, cancellationToken);
            if (orgMembership is null || orgMembership.Status != ClinicMembershipStatus.Active)
            {
                throw new ValidationException("Patient does not have an active membership in the linked organization.");
            }

            isAuthorized = true;
            unlockMethod = "organization_link";
        }

        if (!isAuthorized)
        {
            throw new ValidationException("Could not verify authorization to unlock this clinic.");
        }

        // Create or Reactivate ClinicMembership as Active
        var existing = await _membershipRepo.GetByPatientAndClinicWithDeletedAsync(
            patient.Id, clinic.Id, cancellationToken);

        Guid membershipId;
        var now = DateTime.UtcNow;

        if (existing is not null)
        {
            existing.IsDeleted = false;
            existing.Status = ClinicMembershipStatus.Active;
            existing.ConsentPrivacyPolicy = request.ConsentPrivacyPolicy;
            existing.ConsentTermsAndConditions = request.ConsentTermsAndConditions;
            existing.ConsentDataSharing = request.ConsentDataSharing;
            existing.ConsentedAt = now;
            existing.UpdatedAt = now;

            _membershipRepo.Update(existing);
            membershipId = existing.Id;
        }
        else
        {
            var membership = new ClinicMembership
            {
                ClientId = Guid.NewGuid(),
                PatientId = patient.Id,
                ClinicId = clinic.Id,
                Status = ClinicMembershipStatus.Active,
                ConsentPrivacyPolicy = request.ConsentPrivacyPolicy,
                ConsentTermsAndConditions = request.ConsentTermsAndConditions,
                ConsentDataSharing = request.ConsentDataSharing,
                ConsentedAt = now,
                CreatedAt = now,
                UpdatedAt = now
            };

            await _membershipRepo.AddAsync(membership, cancellationToken);
            membershipId = membership.Id;
            clinic.ActiveMemberCount++;
            _clinicRepo.Update(clinic);
        }

        await _uow.SaveChangesAsync(cancellationToken);

        return new UnlockClinicResultDto(
            Success: true,
            IsUnlocked: true,
            MembershipId: membershipId,
            Message: unlockMethod == "join_code"
                ? "Clinic unlocked successfully via join code."
                : "Clinic unlocked successfully via partner organization membership.");
    }
}
