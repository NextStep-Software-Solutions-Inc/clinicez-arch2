using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using MediatR;
using Microsoft.Extensions.Logging;
using ClinicEz.Shared.Exceptions;
using ClinicEz.Shared.Security.ClaimTokens;
using ClinicEz.Patient.Application.Common.DTOs;
using ClinicEz.Patient.Application.Common.Exceptions;
using ClinicEz.Patient.Domain.Entities;
using ClinicEz.Patient.Domain.Enums;
using ClinicEz.Patient.Domain.Interfaces;

namespace ClinicEz.Patient.Application.Features.Patients.Commands.ClaimIntake;

public sealed class ClaimIntakeCommandHandler : IRequestHandler<ClaimIntakeCommand, ClaimIntakeResultDto>
{
    private readonly IPatientRepository _patientRepository;
    private readonly IClinicRepository _clinicRepository;
    private readonly IClinicMembershipRepository _clinicMembershipRepository;
    private readonly IClaimTokenService _claimTokenService;
    private readonly IPatientClaimConflictResolver _conflictResolver;
    private readonly IUnitOfWork _unitOfWork;
    private readonly ILogger<ClaimIntakeCommandHandler> _logger;

    public ClaimIntakeCommandHandler(
        IPatientRepository patientRepository,
        IClinicRepository clinicRepository,
        IClinicMembershipRepository clinicMembershipRepository,
        IClaimTokenService claimTokenService,
        IPatientClaimConflictResolver conflictResolver,
        IUnitOfWork unitOfWork,
        ILogger<ClaimIntakeCommandHandler> logger)
    {
        _patientRepository = patientRepository;
        _clinicRepository = clinicRepository;
        _clinicMembershipRepository = clinicMembershipRepository;
        _claimTokenService = claimTokenService;
        _conflictResolver = conflictResolver;
        _unitOfWork = unitOfWork;
        _logger = logger;
    }

    public async Task<ClaimIntakeResultDto> Handle(ClaimIntakeCommand request, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);

        // ── 1. Cryptographic Claim Token Validation ───────────────────────────
        var validation = _claimTokenService.ValidateToken(request.ClaimToken);
        if (!validation.IsValid || validation.Claims == null)
        {
            var errorMessage = validation.ErrorMessage ?? "Claim token is invalid or has expired.";
            if (validation.Status == ClaimTokenValidationStatus.Expired)
            {
                throw new ValidationException(errorMessage);
            }
            if (validation.Status == ClaimTokenValidationStatus.BadSignature)
            {
                throw new ValidationException("Tampered token. HMAC signature mismatch.");
            }
            throw new ValidationException(errorMessage);
        }

        var claims = validation.Claims;

        // ── 2. Resolve Claimant & Evaluate Conflict Engine (R3) ───────────────
        var claimant = await _patientRepository.GetByClerkUserIdWithDetailsAsync(request.ClerkUserId, cancellationToken);
        var isDependent = request.IsDependent || string.Equals(request.PreferredRelationship, "Dependent", StringComparison.OrdinalIgnoreCase);

        var resolution = _conflictResolver.Resolve(
            claimant,
            claims,
            isDependent,
            request.RelationshipToDependent);

        if (resolution.Outcome == ClaimConflictOutcome.MedicalPrivacyBlocked)
        {
            _logger.LogWarning(
                "Medical privacy guardrail blocked claim intake for Clerk user {UserId}. Record does not match (RA 10173).",
                request.ClerkUserId);
            throw new MedicalPrivacyGuardrailException();
        }

        // ── 3. Resolve Target Patient Entity ──────────────────────────────────
        Domain.Entities.Patient targetPatient;

        if (resolution.Outcome == ClaimConflictOutcome.NewSelf)
        {
            targetPatient = new Domain.Entities.Patient
            {
                ClientId = Guid.NewGuid(),
                ClerkUserId = request.ClerkUserId,
                FirstName = claims.FirstName.Trim(),
                MiddleName = request.MiddleName?.Trim(),
                LastName = claims.LastName.Trim(),
                Suffix = request.Suffix?.Trim(),
                Sex = Enum.TryParse<SexType>(request.Sex, true, out var s) ? s : null,
                DateOfBirth = claims.DateOfBirth,
                CivilStatus = Enum.TryParse<CivilStatus>(request.CivilStatus, true, out var cs) ? cs : null,
                Mobile = request.ContactNumber?.Trim(),
                Email = claims.Email?.Trim(),
                Nationality = "Filipino",
                ConsentToShareInfo = true,
                CreatedBy = request.ClerkUserId
            };

            await _patientRepository.AddAsync(targetPatient, cancellationToken);
        }
        else if (resolution.Outcome == ClaimConflictOutcome.ExistingSelf)
        {
            targetPatient = claimant!;

            if (targetPatient.MiddleName == null && !string.IsNullOrWhiteSpace(request.MiddleName))
                targetPatient.MiddleName = request.MiddleName.Trim();
            if (targetPatient.Suffix == null && !string.IsNullOrWhiteSpace(request.Suffix))
                targetPatient.Suffix = request.Suffix.Trim();
            if (!targetPatient.Sex.HasValue && Enum.TryParse<SexType>(request.Sex, true, out var es))
                targetPatient.Sex = es;
            if (!targetPatient.CivilStatus.HasValue && Enum.TryParse<CivilStatus>(request.CivilStatus, true, out var ecs))
                targetPatient.CivilStatus = ecs;
            if (string.IsNullOrWhiteSpace(targetPatient.Mobile) && !string.IsNullOrWhiteSpace(request.ContactNumber))
                targetPatient.Mobile = request.ContactNumber.Trim();
            if (string.IsNullOrWhiteSpace(targetPatient.Email) && !string.IsNullOrWhiteSpace(claims.Email))
                targetPatient.Email = claims.Email.Trim();

            targetPatient.ConsentToShareInfo = true;
            targetPatient.UpdatedAt = DateTime.UtcNow;
            targetPatient.UpdatedBy = request.ClerkUserId;

            _patientRepository.Update(targetPatient);
        }
        else // ManagedDependentProxy
        {
            // If claimant has no primary profile yet, provision one as guardian/parent
            if (claimant == null)
            {
                var parentFirstName = !string.IsNullOrWhiteSpace(request.PrincipalFullName)
                    ? ExtractFirstName(request.PrincipalFullName)
                    : "Parent";
                var parentLastName = !string.IsNullOrWhiteSpace(request.PrincipalFullName)
                    ? ExtractLastName(request.PrincipalFullName)
                    : claims.LastName;

                claimant = new Domain.Entities.Patient
                {
                    ClientId = Guid.NewGuid(),
                    ClerkUserId = request.ClerkUserId,
                    FirstName = parentFirstName ?? "Parent",
                    LastName = parentLastName ?? claims.LastName,
                    DateOfBirth = request.PrincipalDateOfBirth ?? claims.DateOfBirth.AddYears(-25),
                    Email = claims.Email,
                    ConsentToShareInfo = true,
                    Nationality = "Filipino",
                    CreatedBy = request.ClerkUserId
                };

                await _patientRepository.AddAsync(claimant, cancellationToken);
            }

            // Look for existing managed dependent with matching name & birthdate
            var existingDep = claimant.ManagedDependents.FirstOrDefault(d =>
                !d.IsDeleted &&
                string.Equals(d.FirstName.Trim(), claims.FirstName.Trim(), StringComparison.OrdinalIgnoreCase) &&
                string.Equals(d.LastName.Trim(), claims.LastName.Trim(), StringComparison.OrdinalIgnoreCase) &&
                d.DateOfBirth == claims.DateOfBirth);

            if (existingDep != null)
            {
                targetPatient = existingDep;

                if (targetPatient.MiddleName == null && !string.IsNullOrWhiteSpace(request.MiddleName))
                    targetPatient.MiddleName = request.MiddleName.Trim();
                if (targetPatient.Suffix == null && !string.IsNullOrWhiteSpace(request.Suffix))
                    targetPatient.Suffix = request.Suffix.Trim();
                if (!targetPatient.Sex.HasValue && Enum.TryParse<SexType>(request.Sex, true, out var ds))
                    targetPatient.Sex = ds;
                if (!targetPatient.CivilStatus.HasValue && Enum.TryParse<CivilStatus>(request.CivilStatus, true, out var dcs))
                    targetPatient.CivilStatus = dcs;
                if (string.IsNullOrWhiteSpace(targetPatient.Mobile) && !string.IsNullOrWhiteSpace(request.ContactNumber))
                    targetPatient.Mobile = request.ContactNumber.Trim();

                targetPatient.ConsentToShareInfo = true;
                targetPatient.UpdatedAt = DateTime.UtcNow;
                targetPatient.UpdatedBy = request.ClerkUserId;

                _patientRepository.Update(targetPatient);
            }
            else
            {
                var isMinor = claims.DateOfBirth > DateOnly.FromDateTime(DateTime.UtcNow.AddYears(-18));
                var relationship = request.RelationshipToDependent?.Trim()
                    ?? request.PrincipalRelationship?.Trim()
                    ?? (isMinor ? "Child" : "Dependent");

                targetPatient = new Domain.Entities.Patient
                {
                    ClientId = Guid.NewGuid(),
                    ClerkUserId = null, // Strictly null for managed dependents per R3
                    ManagedByPatientId = claimant.Id,
                    RelationshipToManager = relationship,
                    FirstName = claims.FirstName.Trim(),
                    MiddleName = request.MiddleName?.Trim(),
                    LastName = claims.LastName.Trim(),
                    Suffix = request.Suffix?.Trim(),
                    Sex = Enum.TryParse<SexType>(request.Sex, true, out var ns) ? ns : null,
                    DateOfBirth = claims.DateOfBirth,
                    CivilStatus = Enum.TryParse<CivilStatus>(request.CivilStatus, true, out var ncs) ? ncs : null,
                    Mobile = request.ContactNumber?.Trim(),
                    Email = claims.Email?.Trim(),
                    Nationality = "Filipino",
                    ConsentToShareInfo = true,
                    CreatedBy = request.ClerkUserId
                };

                await _patientRepository.AddAsync(targetPatient, cancellationToken);
                claimant.ManagedDependents.Add(targetPatient);
            }
        }

        // ── 4. Hydrate PhilHealth PIN & Statutory Dependent Data ──────────────
        var philHealthPin = request.PhilHealthPin?.Trim();
        var memberType = request.PhilhealthCategory?.Trim() ?? claims.MemberType?.Trim();

        if (!string.IsNullOrWhiteSpace(philHealthPin))
        {
            var existingPhic = targetPatient.GovernmentIds.FirstOrDefault(g =>
                !g.IsDeleted && g.IdType == GovernmentIdType.PhilHealth);

            if (existingPhic == null)
            {
                var phic = new PatientGovernmentId
                {
                    Id = Guid.Empty,
                    ClientId = Guid.NewGuid(),
                    PatientId = targetPatient.Id,
                    IdType = GovernmentIdType.PhilHealth,
                    IdNumber = philHealthPin,
                    PhilhealthCategory = memberType ?? "MM",
                    SponsorPin = request.PrincipalMemberPin?.Trim(),
                    SponsorFirstName = ExtractFirstName(request.PrincipalFullName),
                    SponsorLastName = ExtractLastName(request.PrincipalFullName),
                    SponsorRelationship = request.PrincipalRelationship?.Trim(),
                    SponsorDob = request.PrincipalDateOfBirth,
                    CreatedBy = request.ClerkUserId
                };

                targetPatient.GovernmentIds.Add(phic);
            }
            else
            {
                existingPhic.IdNumber = philHealthPin;
                if (!string.IsNullOrWhiteSpace(memberType))
                    existingPhic.PhilhealthCategory = memberType;

                if (string.Equals(memberType, "DD", StringComparison.OrdinalIgnoreCase))
                {
                    if (!string.IsNullOrWhiteSpace(request.PrincipalMemberPin))
                        existingPhic.SponsorPin = request.PrincipalMemberPin.Trim();
                    if (!string.IsNullOrWhiteSpace(request.PrincipalRelationship))
                        existingPhic.SponsorRelationship = request.PrincipalRelationship.Trim();
                    if (request.PrincipalDateOfBirth.HasValue)
                        existingPhic.SponsorDob = request.PrincipalDateOfBirth;
                    if (!string.IsNullOrWhiteSpace(request.PrincipalFullName))
                    {
                        existingPhic.SponsorFirstName = ExtractFirstName(request.PrincipalFullName);
                        existingPhic.SponsorLastName = ExtractLastName(request.PrincipalFullName);
                    }
                }

                existingPhic.UpdatedAt = DateTime.UtcNow;
                existingPhic.UpdatedBy = request.ClerkUserId;
            }
        }

        // ── 5. Hydrate Structured PatientAllergy Entities (Deduplicated) ───────
        if (request.Allergies != null && request.Allergies.Count > 0)
        {
            foreach (var item in request.Allergies)
            {
                if (string.IsNullOrWhiteSpace(item.Allergen)) continue;

                var allergenName = item.Allergen.Trim();
                var exists = targetPatient.Allergies.Any(a =>
                    !a.IsDeleted &&
                    string.Equals(a.AllergenName.Trim(), allergenName, StringComparison.OrdinalIgnoreCase));

                if (!exists)
                {
                    var allergyType = item.Category?.Trim().ToLowerInvariant() switch
                    {
                        "food" => AllergyType.Food,
                        "environmental" => AllergyType.Environmental,
                        "contact" => AllergyType.Contact,
                        _ => AllergyType.Drug
                    };

                    var severity = item.IsAnaphylactic
                        ? AllergySeverity.LifeThreatening
                        : Enum.TryParse<AllergySeverity>(item.Severity, true, out var sev) ? sev : AllergySeverity.Moderate;

                    var allergy = new PatientAllergy
                    {
                        Id = Guid.Empty,
                        ClientId = Guid.NewGuid(),
                        PatientId = targetPatient.Id,
                        AllergenName = allergenName,
                        AllergyType = allergyType,
                        Severity = severity,
                        Reaction = item.ReactionManifestation ?? item.Reaction,
                        OnsetDate = item.OnsetDate,
                        Notes = item.Notes,
                        CreatedBy = request.ClerkUserId
                    };

                    targetPatient.Allergies.Add(allergy);
                }
            }
        }

        // ── 6. Resolve Clinic Facility Catalog Record ─────────────────────────
        Clinic? clinic = null;
        if (Guid.TryParse(claims.FacilitySlug, out var parsedClinicId))
        {
            clinic = await _clinicRepository.GetByIdAsync(parsedClinicId, cancellationToken);
        }

        if (clinic == null)
        {
            var allClinics = await _clinicRepository.GetAllAsync(cancellationToken);
            clinic = allClinics.FirstOrDefault(c =>
                string.Equals(c.Name, claims.FacilitySlug, StringComparison.OrdinalIgnoreCase) ||
                string.Equals(c.TenantId, claims.TenantSlug, StringComparison.OrdinalIgnoreCase));
        }

        if (clinic == null)
        {
            // Auto-provision minimal clinic catalog entry to satisfy FK constraint
            clinic = new Clinic
            {
                Id = Guid.TryParse(claims.FacilitySlug, out var fGuid) ? fGuid : Guid.NewGuid(),
                TenantId = claims.TenantSlug,
                Name = claims.FacilitySlug,
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow
            };

            await _clinicRepository.AddAsync(clinic, cancellationToken);
        }

        // ── 7. Transactionally Create or Activate ClinicMembership ────────────
        var membership = await _clinicMembershipRepository.GetByPatientAndClinicWithDeletedAsync(
            targetPatient.Id,
            clinic.Id,
            cancellationToken);

        if (membership != null)
        {
            if (membership.IsDeleted)
            {
                membership.IsDeleted = false;
                membership.DeletedAt = null;
                membership.DeletedBy = null;
            }

            membership.Status = ClinicMembershipStatus.Active;
            membership.ConsentPrivacyPolicy = true;
            membership.ConsentTermsAndConditions = true;
            membership.ConsentDataSharing = true;
            membership.ConsentedAt = DateTime.UtcNow;
            membership.UpdatedBy = request.ClerkUserId;
            membership.UpdatedAt = DateTime.UtcNow;

            _clinicMembershipRepository.Update(membership);
        }
        else
        {
            membership = new ClinicMembership
            {
                ClientId = Guid.NewGuid(),
                PatientId = targetPatient.Id,
                ClinicId = clinic.Id,
                Status = ClinicMembershipStatus.Active,
                ConsentPrivacyPolicy = true,
                ConsentTermsAndConditions = true,
                ConsentDataSharing = true,
                ConsentedAt = DateTime.UtcNow,
                CreatedBy = request.ClerkUserId
            };

            await _clinicMembershipRepository.AddAsync(membership, cancellationToken);
        }

        // ── 8. Persist All Hydrations Transactionally ─────────────────────────
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        // ── 9. Construct Response DTO ─────────────────────────────────────────
        var summaryDto = MapToPatientSummaryDto(targetPatient);

        return new ClaimIntakeResultDto(
            targetPatient.Id,
            targetPatient.ClinicEzId,
            targetPatient.FirstName,
            targetPatient.LastName,
            resolution.RelationshipType,
            "Active",
            summaryDto,
            membership.Id);
    }

    private static PatientSummaryDto MapToPatientSummaryDto(Domain.Entities.Patient patient) => new(
        patient.Id,
        patient.FirstName,
        patient.MiddleName,
        patient.LastName,
        patient.Suffix,
        patient.Sex?.ToString(),
        patient.DateOfBirth,
        patient.PlaceOfBirth,
        patient.BloodType?.ToString(),
        patient.CivilStatus?.ToString(),
        patient.Nationality,
        patient.Ethnicity,
        patient.Religion,
        patient.PrimaryLanguage,
        patient.EducationLevel?.ToString(),
        patient.Mobile,
        patient.AltPhone,
        patient.Email,
        patient.MessengerHandle,
        patient.AvatarUrl,
        patient.ConsentToShareInfo,
        patient.ClinicEzId);

    private static string? ExtractFirstName(string? fullName)
    {
        if (string.IsNullOrWhiteSpace(fullName)) return null;
        var parts = fullName.Trim().Split(' ', StringSplitOptions.RemoveEmptyEntries);
        return parts.Length > 1 ? string.Join(" ", parts[..^1]) : parts[0];
    }

    private static string? ExtractLastName(string? fullName)
    {
        if (string.IsNullOrWhiteSpace(fullName)) return null;
        var parts = fullName.Trim().Split(' ', StringSplitOptions.RemoveEmptyEntries);
        return parts.Length > 1 ? parts[^1] : parts[0];
    }
}
