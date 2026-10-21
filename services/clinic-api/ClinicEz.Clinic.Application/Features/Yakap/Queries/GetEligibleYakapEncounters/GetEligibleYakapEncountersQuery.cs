using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.Yakap.DTOs;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Common;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Features.Yakap.Queries.GetEligibleYakapEncounters;

public record GetEligibleYakapEncountersQuery(
    string ReportTagging = "2",
    DateTime? StartDate = null,
    DateTime? EndDate = null,
    Guid? PatientId = null,
    Guid? BranchId = null
) : IRequest<ApiResponse<List<EligibleYakapEncounterDto>>>;

public class GetEligibleYakapEncountersQueryHandler : IRequestHandler<GetEligibleYakapEncountersQuery, ApiResponse<List<EligibleYakapEncounterDto>>>
{
    private readonly IRepository<ConsultationEncounter> _encounterRepo;
    private readonly IRepository<ClinicPatient> _patientRepo;
    private readonly IRepository<YakapTransmittal> _transmittalRepo;
    private readonly IRepository<ClinicLabOrder> _labOrderRepo;
    private readonly IClinicContext _clinicContext;

    public GetEligibleYakapEncountersQueryHandler(
        IRepository<ConsultationEncounter> encounterRepo,
        IRepository<ClinicPatient> patientRepo,
        IRepository<YakapTransmittal> transmittalRepo,
        IRepository<ClinicLabOrder> labOrderRepo,
        IClinicContext clinicContext)
    {
        _encounterRepo = encounterRepo;
        _patientRepo = patientRepo;
        _transmittalRepo = transmittalRepo;
        _labOrderRepo = labOrderRepo;
        _clinicContext = clinicContext;
    }

    public async Task<ApiResponse<List<EligibleYakapEncounterDto>>> Handle(
        GetEligibleYakapEncountersQuery request,
        CancellationToken cancellationToken)
    {
        var clinicId = _clinicContext.ClinicId;
        var targetBranchId = request.BranchId ?? _clinicContext.BranchId;

        // 1. Find encounter IDs already submitted or approved in non-failed transmittals
        var submittedEncounterIds = await _transmittalRepo.Query(t =>
                (targetBranchId.HasValue ? t.BranchId == targetBranchId.Value : t.ClinicId == clinicId) &&
                t.Status != YakapTransmittalStatus.Failed)
            .SelectMany(t => t.Items)
            .Where(i => i.ConsultationEncounterId.HasValue)
            .Select(i => i.ConsultationEncounterId!.Value)
            .Distinct()
            .ToListAsync(cancellationToken);

        // 2. Query signed encounters
        var query = _encounterRepo.Query(e =>
                e.IsSigned &&
                !submittedEncounterIds.Contains(e.Id))
            .Include(e => e.Diagnoses)
            .Include(e => e.Prescriptions)
            .AsQueryable();

        if (targetBranchId.HasValue)
        {
            query = query.Where(e => e.BranchId == targetBranchId.Value);
        }
        else
        {
            query = query.Where(e => e.ClinicId == clinicId);
        }

        if (request.PatientId.HasValue)
        {
            query = query.Where(e => e.PatientId == request.PatientId.Value);
        }

        if (request.StartDate.HasValue)
        {
            var startUtc = request.StartDate.Value.ToStartOfDayUtc();
            query = query.Where(e => e.EncounterDate >= startUtc);
        }

        if (request.EndDate.HasValue)
        {
            var endUtc = request.EndDate.Value.ToEndOfDayExclusiveUtc();
            query = query.Where(e => e.EncounterDate < endUtc);
        }

        var encounters = await query
            .OrderByDescending(e => e.EncounterDate)
            .ToListAsync(cancellationToken);

        if (encounters.Count == 0)
        {
            return ApiResponse<List<EligibleYakapEncounterDto>>.Success(new List<EligibleYakapEncounterDto>());
        }

        // 3. Load associated patients for PhilHealth PIN check
        var patientIds = encounters.Select(e => e.PatientId).Distinct().ToList();
        var patients = await _patientRepo.Query(p => patientIds.Contains(p.Id))
            .ToDictionaryAsync(p => p.Id, cancellationToken);

        // 4. Load associated lab orders to count diagnostics
        var encounterIds = encounters.Select(e => e.Id).ToList();
        var labOrders = await _labOrderRepo.Query(l =>
                l.ConsultationId.HasValue && encounterIds.Contains(l.ConsultationId.Value))
            .Include(l => l.Items)
            .ToListAsync(cancellationToken);

        var labOrderMap = labOrders
            .GroupBy(l => l.ConsultationId!.Value)
            .ToDictionary(g => g.Key, g => g.SelectMany(l => l.Items).Count());

        // 5. Build DTO list
        var results = new List<EligibleYakapEncounterDto>();
        foreach (var enc in encounters)
        {
            patients.TryGetValue(enc.PatientId, out var patient);
            var pin = patient?.PhilHealthNumber;
            var hasPin = !string.IsNullOrWhiteSpace(pin);

            var primaryDiag = enc.Diagnoses.FirstOrDefault(d => d.IsPrimary)?.Description
                              ?? enc.Diagnoses.FirstOrDefault()?.Description
                              ?? enc.Assessment;

            var diagCount = enc.Diagnoses.Count;
            var rxCount = enc.Prescriptions.Count;
            var labCount = labOrderMap.TryGetValue(enc.Id, out var count) ? count : 0;

            // Simple sum of medication quantity * assumed fee schedule or default
            decimal medTotal = enc.Prescriptions.Sum(p => p.Quantity * 10m);

            results.Add(new EligibleYakapEncounterDto(
                EncounterId: enc.Id,
                PatientId: enc.PatientId,
                PatientName: enc.PatientName,
                PhilHealthIdentificationNumber: pin,
                EncounterDate: enc.EncounterDate,
                DoctorName: enc.DoctorName,
                PrimaryDiagnosis: primaryDiag,
                DiagnosesCount: diagCount,
                PrescriptionsCount: rxCount,
                DiagnosticsCount: labCount,
                IsYakapEligible: enc.IsYakapEligible,
                HasPhilHealthPin: hasPin,
                TotalMedicationAmount: medTotal
            ));
        }

        return ApiResponse<List<EligibleYakapEncounterDto>>.Success(results);
    }
}
