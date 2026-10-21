using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.Reports.DTOs;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using MediatR;
using Microsoft.EntityFrameworkCore;
using ClinicEz.Shared.Common;

namespace ClinicEz.Clinic.Application.Features.Reports.Queries;

public record GetMorbidityReportQuery(
    DateTime? StartDate = null,
    DateTime? EndDate = null
) : IRequest<MorbidityReportDto>;

public class GetMorbidityReportQueryHandler : IRequestHandler<GetMorbidityReportQuery, MorbidityReportDto>
{
    private readonly IRepository<ConsultationEncounter> _consultationRepo;
    private readonly IRepository<ClinicPatient> _patientRepo;
    private readonly IClinicContext _clinicContext;
    private readonly IRepository<ClinicSettings>? _settingsRepo;

    public GetMorbidityReportQueryHandler(
        IRepository<ConsultationEncounter> consultationRepo,
        IRepository<ClinicPatient> patientRepo,
        IClinicContext clinicContext,
        IRepository<ClinicSettings>? settingsRepo = null)
    {
        _consultationRepo = consultationRepo;
        _patientRepo = patientRepo;
        _clinicContext = clinicContext;
        _settingsRepo = settingsRepo;
    }

    public async Task<MorbidityReportDto> Handle(GetMorbidityReportQuery request, CancellationToken cancellationToken)
    {
        var end = request.EndDate.HasValue
            ? request.EndDate.Value.ToEndOfDayExclusiveUtc()
            : DateTime.UtcNow.ToStartOfDayUtc().AddDays(1);
        var start = request.StartDate.HasValue
            ? request.StartDate.Value.ToStartOfDayUtc()
            : end.AddDays(-30);

        var encounters = await _consultationRepo.Query(c => c.EncounterDate >= start && c.EncounterDate < end)
            .Include(c => c.Diagnoses)
            .Select(c => new
            {
                c.PatientId,
                Diagnoses = c.Diagnoses.Select(d => new { d.Icd10Code, d.Description }).ToList()
            })
            .ToListAsync(cancellationToken);

        var patientIds = encounters.Select(e => e.PatientId).Distinct().ToList();
        var patients = await _patientRepo.Query(p => patientIds.Contains(p.Id))
            .Select(p => new { p.Id, p.DateOfBirth, p.Gender })
            .ToListAsync(cancellationToken);
        var patientLookup = patients.ToDictionary(p => p.Id);

        var diseaseMap = new Dictionary<string, (string Description, int Total, int Pedia, int Adult, int Senior, int Male, int Female)>();

        foreach (var enc in encounters)
        {
            patientLookup.TryGetValue(enc.PatientId, out var patient);
            int? age = null;
            string? gender = null;
            if (patient != null)
            {
                var today = DateOnly.FromDateTime(DateTime.UtcNow);
                int calcAge = today.Year - patient.DateOfBirth.Year;
                if (patient.DateOfBirth > today.AddYears(-calcAge)) calcAge--;
                age = calcAge;
                gender = patient.Gender;
            }

            foreach (var diag in enc.Diagnoses)
            {
                var key = diag.Icd10Code;
                if (!diseaseMap.ContainsKey(key))
                {
                    diseaseMap[key] = (diag.Description, 0, 0, 0, 0, 0, 0);
                }

                var curr = diseaseMap[key];
                int isPedia = (age.HasValue && age.Value < 18) ? 1 : 0;
                int isAdult = (age.HasValue && age.Value >= 18 && age.Value < 60) ? 1 : 0;
                int isSenior = (age.HasValue && age.Value >= 60) ? 1 : 0;
                int isMale = (!string.IsNullOrEmpty(gender) && gender.Equals("Male", StringComparison.OrdinalIgnoreCase)) ? 1 : 0;
                int isFemale = (!string.IsNullOrEmpty(gender) && gender.Equals("Female", StringComparison.OrdinalIgnoreCase)) ? 1 : 0;

                diseaseMap[key] = (
                    curr.Description,
                    curr.Total + 1,
                    curr.Pedia + isPedia,
                    curr.Adult + isAdult,
                    curr.Senior + isSenior,
                    curr.Male + isMale,
                    curr.Female + isFemale
                );
            }
        }

        int totalDiagnoses = diseaseMap.Values.Sum(v => v.Total);

        var diseaseRows = diseaseMap
            .OrderByDescending(kv => kv.Value.Total)
            .Select((kv, index) =>
            {
                var v = kv.Value;
                var pct = totalDiagnoses > 0 ? (double)Math.Round(((double)v.Total / totalDiagnoses) * 100, 1) : 0.0;
                return new MorbidityDiseaseRowDto(
                    index + 1,
                    kv.Key,
                    v.Description,
                    v.Total,
                    v.Pedia,
                    v.Adult,
                    v.Senior,
                    v.Male,
                    v.Female,
                    pct
                );
            })
            .ToList();

        ClinicSettings? settings = null;
        if (_settingsRepo != null)
        {
            settings = await _settingsRepo.Query().FirstOrDefaultAsync(cancellationToken);
        }
        var clinicName = settings?.ClinicName ?? "Clinic Facility";

        return new MorbidityReportDto(
            start,
            end.AddDays(-1),
            _clinicContext.TenantId,
            _clinicContext.ClinicId,
            clinicName,
            encounters.Count,
            totalDiagnoses,
            diseaseRows
        );
    }
}
