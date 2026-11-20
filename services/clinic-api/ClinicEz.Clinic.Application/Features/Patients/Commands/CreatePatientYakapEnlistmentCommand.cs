using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.Patients.DTOs;
using ClinicEz.Clinic.Application.Features.Patients.Queries;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Exceptions;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Features.Patients.Commands;

public sealed record CreatePatientYakapEnlistmentCommand(
    Guid PatientId,
    int EffectiveYear,
    DateOnly EnlistmentDate,
    DateOnly? ValidUntil = null,
    string? Source = null,
    string? PackageType = null,
    string? CaseNo = null,
    string? EnlistmentTransNo = null,
    string? YesReferenceNo = null,
    string? Notes = null) : IRequest<PatientYakapEnlistmentDto>;

public sealed class CreatePatientYakapEnlistmentCommandHandler
    : IRequestHandler<CreatePatientYakapEnlistmentCommand, PatientYakapEnlistmentDto>
{
    private readonly IRepository<Patient> _patientRepo;
    private readonly IRepository<PatientYakapEnlistment> _enlistmentRepo;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClinicContext _clinicContext;
    private readonly IRepository<FacilitySettings>? _settingsRepo;

    public CreatePatientYakapEnlistmentCommandHandler(
        IRepository<Patient> patientRepo,
        IRepository<PatientYakapEnlistment> enlistmentRepo,
        IUnitOfWork unitOfWork,
        IClinicContext clinicContext,
        IRepository<FacilitySettings>? settingsRepo = null)
    {
        _patientRepo = patientRepo;
        _enlistmentRepo = enlistmentRepo;
        _unitOfWork = unitOfWork;
        _clinicContext = clinicContext;
        _settingsRepo = settingsRepo;
    }

    public async Task<PatientYakapEnlistmentDto> Handle(
        CreatePatientYakapEnlistmentCommand request,
        CancellationToken cancellationToken)
    {
        var patient = await _patientRepo
            .Query(p => p.Id == request.PatientId && p.ClinicId == _clinicContext.ClinicId)
            .FirstOrDefaultAsync(cancellationToken);

        if (patient == null)
        {
            throw new NotFoundException($"Patient '{request.PatientId}' was not found in this clinic.");
        }

        var source = !string.IsNullOrWhiteSpace(request.Source) &&
                     Enum.TryParse<YakapEnlistmentSource>(request.Source.Trim(), ignoreCase: true, out var parsedSource)
            ? parsedSource
            : YakapEnlistmentSource.ClinicEnlistment;

        var packageType = !string.IsNullOrWhiteSpace(request.PackageType) &&
                          Enum.TryParse<YakapPackageType>(request.PackageType.Trim(), ignoreCase: true, out var parsedPkg)
            ? parsedPkg
            : YakapPackageType.Konsulta;

        var validUntil = request.ValidUntil ?? new DateOnly(request.EffectiveYear, 12, 31);
        var now = DateTime.UtcNow;
        var actor = _clinicContext.StaffId?.ToString() ?? _clinicContext.StaffName ?? "ClinicStaff";

        string sanitizedAccre = string.Empty;
        if (_settingsRepo != null)
        {
            var settings = await _settingsRepo
                .Query(s => s.ClinicId == _clinicContext.ClinicId)
                .AsNoTracking()
                .FirstOrDefaultAsync(cancellationToken);
            if (!string.IsNullOrWhiteSpace(settings?.AccreditationNumber))
            {
                var alnum = new string(settings.AccreditationNumber.Where(char.IsLetterOrDigit).ToArray());
                sanitizedAccre = alnum.Length <= 9 ? alnum : alnum[..9];
            }
        }

        // Enforce 1 active non-deleted row per (ClinicId, PatientId, EffectiveYear) while preserving prior historical years.
        var existing = await _enlistmentRepo
            .Query(e => e.PatientId == request.PatientId &&
                        e.ClinicId == _clinicContext.ClinicId &&
                        e.EffectiveYear == request.EffectiveYear)
            .FirstOrDefaultAsync(cancellationToken);

        if (existing != null)
        {
            existing.Status = YakapEnlistmentStatus.Active;
            existing.Source = source;
            existing.PackageType = packageType;
            existing.EnlistmentDate = request.EnlistmentDate;
            existing.ValidUntil = validUntil;
            if (!string.IsNullOrWhiteSpace(request.CaseNo))
                existing.CaseNo = request.CaseNo.Trim();
            if (!string.IsNullOrWhiteSpace(request.EnlistmentTransNo))
                existing.EnlistmentTransNo = request.EnlistmentTransNo.Trim();
            if (!string.IsNullOrWhiteSpace(request.YesReferenceNo))
                existing.YesReferenceNo = request.YesReferenceNo.Trim();
            if (!string.IsNullOrWhiteSpace(request.Notes))
                existing.Remarks = request.Notes.Trim();
            if (!string.IsNullOrWhiteSpace(sanitizedAccre) && string.IsNullOrWhiteSpace(existing.HciAccreditationNumber))
                existing.HciAccreditationNumber = sanitizedAccre;
            existing.HasPatientConsent = true;
            existing.ConsentSignedAtUtc ??= now;
            existing.UpdatedAt = now;
            existing.UpdatedBy = actor;

            _enlistmentRepo.Update(existing);
            await _unitOfWork.SaveChangesAsync(cancellationToken);
            return GetPatientPhilHealthCoverageQueryHandler.MapEnlistmentDto(existing);
        }

        var enlistment = new PatientYakapEnlistment
        {
            Id = Guid.NewGuid(),
            TenantId = patient.TenantId ?? _clinicContext.TenantId,
            ClinicId = _clinicContext.ClinicId,
            PatientId = patient.Id,
            EffectiveYear = request.EffectiveYear,
            Status = YakapEnlistmentStatus.Active,
            Source = source,
            PackageType = packageType,
            EnlistmentDate = request.EnlistmentDate,
            ValidUntil = validUntil,
            CaseNo = NullIfWhiteSpace(request.CaseNo),
            EnlistmentTransNo = NullIfWhiteSpace(request.EnlistmentTransNo),
            EnlistmentTransDate = !string.IsNullOrWhiteSpace(request.EnlistmentTransNo) ? request.EnlistmentDate : null,
            YesReferenceNo = NullIfWhiteSpace(request.YesReferenceNo),
            HciAccreditationNumber = sanitizedAccre,
            HasPatientConsent = true,
            ConsentSignedAtUtc = now,
            Remarks = NullIfWhiteSpace(request.Notes),
            CreatedByStaffId = _clinicContext.StaffId,
            CreatedByStaffName = _clinicContext.StaffName ?? "ClinicStaff",
            CreatedAt = now,
            CreatedBy = actor
        };

        await _enlistmentRepo.AddAsync(enlistment, cancellationToken);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        return GetPatientPhilHealthCoverageQueryHandler.MapEnlistmentDto(enlistment);
    }

    private static string? NullIfWhiteSpace(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Trim();
}
