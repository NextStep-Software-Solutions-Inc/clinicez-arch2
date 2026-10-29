using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.Patients.Commands;
using ClinicEz.Clinic.Application.Features.Patients.DTOs;
using ClinicEz.Clinic.Application.Features.Patients.Search;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Features.Patients.Queries;

public sealed record GetClinicPatientsQuery(
    string? SearchTerm = null,
    bool? HasAlerts = null,
    string? VerificationStatus = null,
    string? FilterMode = null,
    int PageNumber = 1,
    int PageSize = 50,
    string? CursorLastName = null,
    string? CursorFirstName = null,
    Guid? CursorId = null,
    string? AfterLastName = null,
    string? AfterFirstName = null,
    Guid? AfterId = null) : IRequest<IReadOnlyList<ClinicPatientDto>>
{
    public string? EffectiveCursorLastName => CursorLastName ?? AfterLastName;
    public string? EffectiveCursorFirstName => CursorFirstName ?? AfterFirstName;
    public Guid? EffectiveCursorId => CursorId ?? AfterId;
}

public sealed class GetClinicPatientsQueryHandler : IRequestHandler<GetClinicPatientsQuery, IReadOnlyList<ClinicPatientDto>>
{
    private readonly IRepository<Patient> _patientRepo;

    public GetClinicPatientsQueryHandler(IRepository<Patient> patientRepo)
    {
        _patientRepo = patientRepo;
    }

    public async Task<IReadOnlyList<ClinicPatientDto>> Handle(GetClinicPatientsQuery request, CancellationToken ct)
    {
        IQueryable<Patient> query = _patientRepo.Query().AsNoTracking();

        query = query.WhereMatchesSearchTerm(request.SearchTerm);

        if (request.HasAlerts == true || string.Equals(request.FilterMode, "ALERTS", StringComparison.OrdinalIgnoreCase))
        {
            query = query.Where(p =>
                p.HasActiveSafetyAlert ||
                p.Alerts.Any(a => !a.IsDeleted && a.Status == PatientAlertStatus.Active) ||
                p.Allergies!.Any(a => !a.IsDeleted && a.Status == AllergyStatus.Active));
        }

        if (string.Equals(request.FilterMode, "SENIOR_PWD", StringComparison.OrdinalIgnoreCase))
        {
            var seniorCutoff = DateOnly.FromDateTime(DateTime.UtcNow.AddYears(-60));
            query = query.Where(p =>
                (!string.IsNullOrWhiteSpace(p.SeniorCitizenId) && p.SeniorCitizenId.Trim().Length > 0) ||
                (!string.IsNullOrWhiteSpace(p.PwdId) && p.PwdId.Trim().Length > 0) ||
                p.DateOfBirth <= seniorCutoff);
        }

        if (!string.IsNullOrWhiteSpace(request.VerificationStatus) && Enum.TryParse<PatientVerificationStatus>(request.VerificationStatus, true, out var filterVs))
        {
            query = query.Where(p => p.VerificationStatus == filterVs);
        }

        var pageSize = Math.Max(1, request.PageSize);
        var cursorLastName = request.EffectiveCursorLastName;
        var cursorFirstName = request.EffectiveCursorFirstName;
        var cursorId = request.EffectiveCursorId;
        var isCursorPaging = !string.IsNullOrEmpty(cursorLastName) || cursorId.HasValue;

        if (isCursorPaging)
        {
            if (!string.IsNullOrEmpty(cursorLastName) && cursorId.HasValue)
            {
                var cLastName = cursorLastName;
                var cFirstName = cursorFirstName ?? string.Empty;
                var cId = cursorId.Value;

                query = query.Where(p =>
                    string.Compare(p.LastName, cLastName) > 0 ||
                    (p.LastName == cLastName && string.Compare(p.FirstName, cFirstName) > 0) ||
                    (p.LastName == cLastName && p.FirstName == cFirstName && p.Id.CompareTo(cId) > 0));
            }
            else if (!string.IsNullOrEmpty(cursorLastName))
            {
                var cLastName = cursorLastName;
                var cFirstName = cursorFirstName ?? string.Empty;
                query = query.Where(p =>
                    string.Compare(p.LastName, cLastName) > 0 ||
                    (p.LastName == cLastName && string.Compare(p.FirstName, cFirstName) > 0));
            }
            else if (cursorId.HasValue)
            {
                var cId = cursorId.Value;
                query = query.Where(p => p.Id.CompareTo(cId) > 0);
            }

            query = query
                .OrderBy(p => p.LastName)
                .ThenBy(p => p.FirstName)
                .ThenBy(p => p.Id)
                .Take(pageSize);
        }
        else
        {
            var pageNumber = Math.Max(1, request.PageNumber);
            query = query
                .OrderBy(p => p.LastName)
                .ThenBy(p => p.FirstName)
                .ThenBy(p => p.Id)
                .Skip((pageNumber - 1) * pageSize)
                .Take(pageSize);
        }

        var projected = await query
            .Select(p => new
            {
                p.Id,
                p.TenantId,
                p.ClinicId,
                p.PatientCode,
                p.FirstName,
                p.LastName,
                p.MiddleName,
                p.Suffix,
                p.DateOfBirth,
                p.Sex,
                p.GenderIdentity,
                p.CivilStatus,
                p.ContactNumber,
                p.Email,
                p.PhilHealthNumber,
                p.SeniorCitizenId,
                p.PwdId,
                p.BloodType,
                p.CreatedAt,
                p.CustomFields,
                p.VerificationStatus,
                p.ClinicEzId,
                p.LandlineNumber,
                p.MaidenLastName,
                p.PreferredName,
                p.Nationality,
                p.Religion,
                p.IsDeceased,
                p.DeceasedAt,
                p.HasActiveSafetyAlert,
                p.CloudPatientId
            })
            .ToListAsync(ct);

        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        return projected.Select(p =>
        {
            var age = today.Year - p.DateOfBirth.Year;
            if (p.DateOfBirth > today.AddYears(-age)) age--;

            var middleInitial = !string.IsNullOrWhiteSpace(p.MiddleName) ? $" {p.MiddleName[0]}." : "";
            var suffix = !string.IsNullOrWhiteSpace(p.Suffix) ? $" {p.Suffix}" : "";
            var fullName = $"{p.LastName}, {p.FirstName}{middleInitial}{suffix}";

            return new ClinicPatientDto(
                p.Id,
                p.TenantId,
                p.ClinicId,
                p.PatientCode,
                p.FirstName,
                p.LastName,
                p.MiddleName,
                p.Suffix,
                fullName,
                p.DateOfBirth,
                age,
                p.Sex.ToString(),
                p.CivilStatus?.ToString(),
                p.ContactNumber,
                p.Email,
                p.PhilHealthNumber,
                p.SeniorCitizenId,
                p.PwdId,
                p.BloodType?.ToString(),
                p.CreatedAt,
                p.CustomFields,
                p.VerificationStatus.ToString(),
                ActiveQueueTicket: null,
                ActiveQueueItemId: null,
                PastMedicalHistories: null,
                ClinicEzId: p.ClinicEzId,
                LandlineNumber: p.LandlineNumber,
                MaidenLastName: p.MaidenLastName,
                PreferredName: p.PreferredName,
                Nationality: p.Nationality,
                Religion: p.Religion,
                IsDeceased: p.IsDeceased,
                DeceasedAt: p.DeceasedAt,
                PhilHealthMembership: null,
                YakapEnlistments: null,
                AlertsList: null,
                MedicalHistories: null,
                Allergies: null,
                ChronicConditions: null,
                Alerts: p.HasActiveSafetyAlert ? "Active Safety Alert" : null,
                SyncPatientId: p.CloudPatientId,
                GenderIdentity: p.GenderIdentity);
        }).ToList().AsReadOnly();
    }
}
