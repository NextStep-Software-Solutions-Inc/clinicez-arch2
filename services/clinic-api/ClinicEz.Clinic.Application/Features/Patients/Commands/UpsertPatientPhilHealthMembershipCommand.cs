using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.Patients.DTOs;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Exceptions;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Features.Patients.Commands;

public sealed record UpsertPatientPhilHealthMembershipCommand(
    Guid PatientId,
    string MemberType,
    string? DependentRelationship = null,
    string? PhilHealthPin = null,
    string? PrincipalMemberPin = null,
    string? PrincipalLastName = null,
    string? PrincipalFirstName = null,
    string? PrincipalMiddleName = null,
    string? PrincipalSuffix = null,
    DateOnly? PrincipalDateOfBirth = null,
    string? PrincipalSex = null,
    string? MembershipCategoryCode = null,
    string? MembershipCategoryDesc = null,
    string? EmployerPin = null,
    string? EmployerName = null,
    string? DefaultWalkInAtc = null,
    string? PrincipalMemberLandlineNumber = null,
    string? PrincipalMemberMobileNumber = null,
    string? PrincipalMemberEmail = null) : IRequest<PatientPhilHealthMembershipDto>;

public sealed class UpsertPatientPhilHealthMembershipCommandHandler
    : IRequestHandler<UpsertPatientPhilHealthMembershipCommand, PatientPhilHealthMembershipDto>
{
    private readonly IRepository<Patient> _patientRepo;
    private readonly IRepository<PatientPhilHealthMembership> _membershipRepo;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClinicContext _clinicContext;

    public UpsertPatientPhilHealthMembershipCommandHandler(
        IRepository<Patient> patientRepo,
        IRepository<PatientPhilHealthMembership> membershipRepo,
        IUnitOfWork unitOfWork,
        IClinicContext clinicContext)
    {
        _patientRepo = patientRepo;
        _membershipRepo = membershipRepo;
        _unitOfWork = unitOfWork;
        _clinicContext = clinicContext;
    }

    public async Task<PatientPhilHealthMembershipDto> Handle(
        UpsertPatientPhilHealthMembershipCommand request,
        CancellationToken cancellationToken)
    {
        var patient = await _patientRepo
            .Query(p => p.Id == request.PatientId && p.ClinicId == _clinicContext.ClinicId)
            .FirstOrDefaultAsync(cancellationToken);

        if (patient == null)
        {
            throw new NotFoundException($"Patient '{request.PatientId}' was not found in this clinic.");
        }

        var memberType = Enum.Parse<PhilHealthMemberType>(request.MemberType.Trim(), ignoreCase: true);
        var isDependent = memberType == PhilHealthMemberType.DD;
        var actor = _clinicContext.StaffId?.ToString() ?? _clinicContext.StaffName ?? "ClinicStaff";
        var now = DateTime.UtcNow;

        var formattedPatientPin = FormatPinIfPresent(request.PhilHealthPin);
        var formattedPrincipalPin = FormatPinIfPresent(request.PrincipalMemberPin);

        if (isDependent
            && !string.IsNullOrWhiteSpace(formattedPatientPin)
            && !string.IsNullOrWhiteSpace(formattedPrincipalPin)
            && PhilHealthPinNormalizer.Normalize(formattedPatientPin) == PhilHealthPinNormalizer.Normalize(formattedPrincipalPin))
        {
            throw new BadRequestException("Principal Member PIN cannot be the same as the patient's own PhilHealth PIN.");
        }

        if (!string.IsNullOrWhiteSpace(formattedPatientPin))
        {
            var conflict = await ClinicEz.Clinic.Application.Features.Yakap.Common.YakapWorkflowHelpers.FindExistingPinOwnerAsync(
                _patientRepo,
                _membershipRepo,
                _clinicContext.ClinicId,
                formattedPatientPin,
                request.PatientId,
                cancellationToken);

            if (conflict != null)
            {
                var codeSuffix = string.IsNullOrWhiteSpace(conflict.PatientCode) ? string.Empty : $" ({conflict.PatientCode})";
                throw new ConflictException($"PhilHealth PIN '{formattedPatientPin}' is already assigned to another patient: {conflict.FullName}{codeSuffix}.");
            }
        }

        // Sync Patient.PhilHealthNumber (clear to null when DD without personal PIN)
        patient.PhilHealthNumber = formattedPatientPin;
        patient.UpdatedAt = now;
        patient.UpdatedBy = actor;
        _patientRepo.Update(patient);

        var membership = await _membershipRepo
            .Query(m => m.PatientId == request.PatientId && m.ClinicId == _clinicContext.ClinicId)
            .FirstOrDefaultAsync(cancellationToken);

        bool isNew = membership == null;
        if (membership == null)
        {
            membership = new PatientPhilHealthMembership
            {
                Id = Guid.NewGuid(),
                TenantId = patient.TenantId ?? _clinicContext.TenantId,
                ClinicId = _clinicContext.ClinicId,
                PatientId = patient.Id,
                CreatedAt = now,
                CreatedBy = actor
            };
        }

        membership.MemberType = memberType;
        // DB column MemberPin is NOT NULL (MaxLength 20): store string.Empty when DD without personal PIN.
        membership.MemberPin = formattedPatientPin ?? string.Empty;

        if (isDependent)
        {
            membership.DependentRelationship = !string.IsNullOrWhiteSpace(request.DependentRelationship)
                && Enum.TryParse<PhilHealthDependentRelationship>(request.DependentRelationship.Trim(), ignoreCase: true, out var rel)
                    ? rel
                    : null;
            membership.PrincipalMemberPin = formattedPrincipalPin;
            membership.PrincipalLastName = NullIfWhiteSpace(request.PrincipalLastName);
            membership.PrincipalFirstName = NullIfWhiteSpace(request.PrincipalFirstName);
            membership.PrincipalMiddleName = NullIfWhiteSpace(request.PrincipalMiddleName);
            membership.PrincipalSuffix = NullIfWhiteSpace(request.PrincipalSuffix);
            membership.PrincipalDateOfBirth = request.PrincipalDateOfBirth;
            membership.PrincipalSex = !string.IsNullOrWhiteSpace(request.PrincipalSex)
                ? RegisterClinicPatientCommandHandler.ParseBiologicalSex(request.PrincipalSex)
                : null;
            membership.PrincipalMemberLandlineNumber = NullIfWhiteSpace(request.PrincipalMemberLandlineNumber);
            membership.PrincipalMemberMobileNumber = NullIfWhiteSpace(request.PrincipalMemberMobileNumber);
            membership.PrincipalMemberEmail = NullIfWhiteSpace(request.PrincipalMemberEmail);
        }
        else
        {
            membership.DependentRelationship = null;
            membership.PrincipalMemberPin = null;
            membership.PrincipalLastName = null;
            membership.PrincipalFirstName = null;
            membership.PrincipalMiddleName = null;
            membership.PrincipalSuffix = null;
            membership.PrincipalDateOfBirth = null;
            membership.PrincipalSex = null;
            membership.PrincipalMemberLandlineNumber = null;
            membership.PrincipalMemberMobileNumber = null;
            membership.PrincipalMemberEmail = null;
        }

        membership.MembershipCategoryCode = NullIfWhiteSpace(request.MembershipCategoryCode);
        membership.MembershipCategoryDesc = NullIfWhiteSpace(request.MembershipCategoryDesc);
        membership.EmployerPin = FormatPinIfPresent(request.EmployerPin) ?? NullIfWhiteSpace(request.EmployerPin);
        membership.EmployerName = NullIfWhiteSpace(request.EmployerName);
        membership.DefaultWalkInAtc = NullIfWhiteSpace(request.DefaultWalkInAtc);
        membership.UpdatedAt = now;
        membership.UpdatedBy = actor;

        if (isNew)
        {
            await _membershipRepo.AddAsync(membership, cancellationToken);
        }
        else
        {
            _membershipRepo.Update(membership);
        }

        await _unitOfWork.SaveChangesAsync(cancellationToken);

        var dtoPin = string.IsNullOrWhiteSpace(membership.MemberPin) ? null : membership.MemberPin;
        return new PatientPhilHealthMembershipDto(
            Id: membership.Id,
            MemberType: membership.MemberType.ToString(),
            DependentRelationship: membership.DependentRelationship?.ToString(),
            PhilHealthPin: dtoPin,
            PrincipalMemberPin: membership.PrincipalMemberPin,
            PrincipalLastName: membership.PrincipalLastName,
            PrincipalFirstName: membership.PrincipalFirstName,
            PrincipalMiddleName: membership.PrincipalMiddleName,
            PrincipalSuffix: membership.PrincipalSuffix,
            PrincipalDateOfBirth: membership.PrincipalDateOfBirth,
            PrincipalSex: membership.PrincipalSex?.ToString(),
            MembershipCategoryCode: membership.MembershipCategoryCode,
            MembershipCategoryDesc: membership.MembershipCategoryDesc,
            EmployerPin: membership.EmployerPin,
            EmployerName: membership.EmployerName,
            DefaultWalkInAtc: membership.DefaultWalkInAtc,
            PatientId: membership.PatientId,
            MemberPin: dtoPin,
            PrincipalMemberLandlineNumber: membership.PrincipalMemberLandlineNumber,
            PrincipalMemberMobileNumber: membership.PrincipalMemberMobileNumber,
            PrincipalMemberEmail: membership.PrincipalMemberEmail,
            UpdatedAtUtc: membership.UpdatedAt ?? membership.CreatedAt);
    }

    private static string? NullIfWhiteSpace(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private static string? FormatPinIfPresent(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw)) return null;
        var digits = new string(raw.Where(char.IsDigit).ToArray());
        if (digits.Length == 12)
        {
            return $"{digits[..2]}-{digits[2..11]}-{digits[11..12]}";
        }
        return raw.Trim();
    }
}
