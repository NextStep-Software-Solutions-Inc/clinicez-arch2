using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Patient.Domain.Entities;
using ClinicEz.Patient.Domain.Enums;
using ClinicEz.Patient.Domain.Interfaces;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Exceptions;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Contracts;
using MediatR;

namespace ClinicEz.Patient.Application.Features.Clinics.Commands.RequestClinicLink;

/// <summary>
/// Creates or re-opens a <see cref="ClinicMembershipStatus.Pending"/> clinic membership and dispatches
/// <see cref="InteropTypes.PatientLinkRequested"/> through the Interop Hub so clinic staff can verify
/// identity and link the patient's cloud account to an existing historical clinic chart.
/// </summary>
public sealed class RequestClinicLinkCommandHandler : IRequestHandler<RequestClinicLinkCommand, Guid>
{
    private readonly IPatientRepository _patientRepo;
    private readonly IClinicRepository _clinicRepo;
    private readonly IClinicMembershipRepository _membershipRepo;
    private readonly IInteropPublisher _interopPublisher;
    private readonly IUnitOfWork _uow;

    public RequestClinicLinkCommandHandler(
        IPatientRepository patientRepo,
        IClinicRepository clinicRepo,
        IClinicMembershipRepository membershipRepo,
        IInteropPublisher interopPublisher,
        IUnitOfWork uow)
    {
        _patientRepo = patientRepo;
        _clinicRepo = clinicRepo;
        _membershipRepo = membershipRepo;
        _interopPublisher = interopPublisher;
        _uow = uow;
    }

    public async Task<Guid> Handle(RequestClinicLinkCommand request, CancellationToken cancellationToken)
    {
        if (!request.ConsentPrivacyPolicy || !request.ConsentTermsAndConditions || !request.ConsentDataSharing)
        {
            throw new ValidationException("All RA 10173 privacy, terms, and data-sharing consents are required before requesting chart linkage.");
        }

        var patient = await _patientRepo.GetByIdAsync(request.PatientId, cancellationToken)
            ?? throw new NotFoundException($"Patient '{request.PatientId}' was not found.");

        var clinic = await _clinicRepo.GetByIdAsync(request.ClinicId, cancellationToken)
            ?? throw new NotFoundException($"Clinic '{request.ClinicId}' was not found.");

        if (string.IsNullOrWhiteSpace(clinic.TenantId))
        {
            throw new BadRequestException("This clinic is not yet configured for interoperable chart linkage.");
        }

        var now = DateTime.UtcNow;
        var existing = await _membershipRepo.GetByPatientAndClinicWithDeletedAsync(request.PatientId, request.ClinicId, cancellationToken);
        Guid linkRequestId;

        if (existing is not null)
        {
            if (!existing.IsDeleted && existing.Status == ClinicMembershipStatus.Active)
            {
                throw new ConflictException("Your account is already actively linked to this clinic.");
            }

            existing.IsDeleted = false;
            existing.DeletedAt = null;
            existing.DeletedBy = null;
            existing.Status = ClinicMembershipStatus.Pending;
            existing.ConsentPrivacyPolicy = true;
            existing.ConsentTermsAndConditions = true;
            existing.ConsentDataSharing = true;
            existing.ConsentedAt = now;
            existing.UpdatedAt = now;
            _membershipRepo.Update(existing);
            linkRequestId = existing.Id;
        }
        else
        {
            var membership = new ClinicMembership
            {
                Id = Guid.NewGuid(),
                ClientId = Guid.NewGuid(),
                PatientId = request.PatientId,
                ClinicId = request.ClinicId,
                Status = ClinicMembershipStatus.Pending,
                ConsentPrivacyPolicy = true,
                ConsentTermsAndConditions = true,
                ConsentDataSharing = true,
                ConsentedAt = now
            };
            await _membershipRepo.AddAsync(membership, cancellationToken);
            linkRequestId = membership.Id;
        }

        Dictionary<string, string>? sanitizedClaims = null;
        if (request.IdentifierClaims is { Count: > 0 })
        {
            sanitizedClaims = request.IdentifierClaims
                .Where(kv => !string.IsNullOrWhiteSpace(kv.Key) && !string.IsNullOrWhiteSpace(kv.Value))
                .ToDictionary(kv => kv.Key.Trim(), kv => kv.Value.Trim(), StringComparer.OrdinalIgnoreCase);
            if (sanitizedClaims.Count == 0) sanitizedClaims = null;
        }

        _interopPublisher.Enqueue(
            InteropTypes.PatientLinkRequested,
            Party.ForPatient(patient.Id.ToString()),
            Party.ForFacility(clinic.TenantId, clinic.Id.ToString(), FacilityType.Clinic),
            linkRequestId,
            new PatientLinkRequestedPayload
            {
                LinkRequestId = linkRequestId,
                PatientId = patient.Id,
                ClinicEzId = patient.ClinicEzId,
                TenantId = clinic.TenantId,
                ClinicId = clinic.Id,
                FirstName = patient.FirstName,
                MiddleName = patient.MiddleName,
                LastName = patient.LastName,
                Suffix = patient.Suffix,
                DateOfBirth = patient.DateOfBirth,
                VerifiedEmail = string.IsNullOrWhiteSpace(request.VerifiedEmail) ? patient.Email : request.VerifiedEmail.Trim(),
                ContactNumber = patient.Mobile ?? patient.AltPhone,
                IdentifierClaims = sanitizedClaims,
                ConsentPrivacyPolicy = true,
                ConsentTermsAndConditions = true,
                ConsentDataSharing = true,
                RequestedAtUtc = now
            });

        await _uow.SaveChangesAsync(cancellationToken);
        return linkRequestId;
    }
}
