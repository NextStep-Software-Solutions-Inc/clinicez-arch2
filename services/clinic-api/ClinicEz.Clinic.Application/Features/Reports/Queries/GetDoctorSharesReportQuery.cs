using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.Reports.DTOs;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using MediatR;
using Microsoft.EntityFrameworkCore;
using ClinicEz.Shared.Common;

namespace ClinicEz.Clinic.Application.Features.Reports.Queries;

public record GetDoctorSharesReportQuery(
    DateTime? StartDate = null,
    DateTime? EndDate = null
) : IRequest<DoctorSharesReportDto>;

public class GetDoctorSharesReportQueryHandler : IRequestHandler<GetDoctorSharesReportQuery, DoctorSharesReportDto>
{
    private readonly IRepository<ConsultationEncounter> _consultationRepo;
    private readonly IRepository<Invoice> _invoiceRepo;
    private readonly IRepository<Procedure> _procedureRepo;
    private readonly IClinicContext _clinicContext;
    private readonly IRepository<FacilitySettings>? _settingsRepo;

    public GetDoctorSharesReportQueryHandler(
        IRepository<ConsultationEncounter> consultationRepo,
        IRepository<Invoice> invoiceRepo,
        IRepository<Procedure> procedureRepo,
        IClinicContext clinicContext,
        IRepository<FacilitySettings>? settingsRepo = null)
    {
        _consultationRepo = consultationRepo;
        _invoiceRepo = invoiceRepo;
        _procedureRepo = procedureRepo;
        _clinicContext = clinicContext;
        _settingsRepo = settingsRepo;
    }

    public async Task<DoctorSharesReportDto> Handle(GetDoctorSharesReportQuery request, CancellationToken cancellationToken)
    {
        var end = request.EndDate.HasValue
            ? request.EndDate.Value.ToEndOfDayExclusiveUtc()
            : DateTime.UtcNow.ToStartOfDayUtc().AddDays(1);
        var start = request.StartDate.HasValue
            ? request.StartDate.Value.ToStartOfDayUtc()
            : end.AddDays(-30);

        FacilitySettings? settings = null;
        if (_settingsRepo != null)
        {
            settings = await _settingsRepo.Query().FirstOrDefaultAsync(cancellationToken);
        }
        decimal doctorSharePct = settings?.DefaultDoctorSharePercentage ?? 0.70m;

        var consultations = await _consultationRepo.Query(c => c.EncounterDate >= start && c.EncounterDate < end)
            .Select(c => new { c.DoctorId, c.DoctorName })
            .ToListAsync(cancellationToken);

        var invoices = await _invoiceRepo.Query(i => i.InvoiceDate >= start && i.InvoiceDate < end && i.Status != InvoiceStatus.Voided)
            .Select(i => new
            {
                i.AttendingDoctorId,
                LineItems = i.LineItems.Select(li => new { li.DoctorId, li.DoctorName, li.Category, li.TotalPrice }).ToList()
            })
            .ToListAsync(cancellationToken);

        var procedures = await _procedureRepo.Query(p => p.ScheduledAt >= start && p.ScheduledAt < end)
            .Select(p => new { p.OrderedByDoctorId, p.OrderedByDoctorName, p.PerformedByStaffId, p.PerformedByStaffName })
            .ToListAsync(cancellationToken);

        // Discover doctors across consultations, invoice line items, and procedures
        var doctorCandidates = new List<(Guid DoctorId, string DoctorName)>();

        foreach (var c in consultations)
        {
            if (c.DoctorId != Guid.Empty || !string.IsNullOrWhiteSpace(c.DoctorName))
            {
                doctorCandidates.Add((c.DoctorId, c.DoctorName?.Trim() ?? string.Empty));
            }
        }

        foreach (var inv in invoices)
        {
            foreach (var li in inv.LineItems)
            {
                var dId = li.DoctorId ?? Guid.Empty;
                var dName = li.DoctorName?.Trim() ?? string.Empty;
                if (dId != Guid.Empty || !string.IsNullOrWhiteSpace(dName))
                {
                    doctorCandidates.Add((dId, dName));
                }
            }
        }

        foreach (var p in procedures)
        {
            var pDoctorName = (!string.IsNullOrWhiteSpace(p.PerformedByStaffName)
                ? p.PerformedByStaffName
                : p.OrderedByDoctorName)?.Trim() ?? string.Empty;
            var pDoctorId = p.PerformedByStaffId ?? p.OrderedByDoctorId ?? Guid.Empty;

            if (pDoctorId != Guid.Empty || !string.IsNullOrWhiteSpace(pDoctorName))
            {
                doctorCandidates.Add((pDoctorId, pDoctorName));
            }
        }

        // Prioritize candidates with both ID and Name
        doctorCandidates = doctorCandidates
            .OrderByDescending(c => c.DoctorId != Guid.Empty && !string.IsNullOrWhiteSpace(c.DoctorName))
            .ThenByDescending(c => c.DoctorId != Guid.Empty)
            .ToList();

        var distinctDoctors = new List<(Guid DoctorId, string DoctorName)>();
        foreach (var candidate in doctorCandidates)
        {
            var index = distinctDoctors.FindIndex(d =>
                (d.DoctorId != Guid.Empty && candidate.DoctorId != Guid.Empty && d.DoctorId == candidate.DoctorId) ||
                (!string.IsNullOrWhiteSpace(d.DoctorName) && !string.IsNullOrWhiteSpace(candidate.DoctorName) &&
                 string.Equals(d.DoctorName, candidate.DoctorName, StringComparison.OrdinalIgnoreCase)));

            if (index >= 0)
            {
                var existing = distinctDoctors[index];
                var mergedId = existing.DoctorId != Guid.Empty ? existing.DoctorId : candidate.DoctorId;
                var mergedName = !string.IsNullOrWhiteSpace(existing.DoctorName) ? existing.DoctorName : candidate.DoctorName;
                distinctDoctors[index] = (mergedId, mergedName);
            }
            else
            {
                distinctDoctors.Add((candidate.DoctorId, candidate.DoctorName));
            }
        }

        var details = new List<DoctorWorkloadDetailDto>();

        foreach (var doctor in distinctDoctors)
        {
            var docId = doctor.DoctorId != Guid.Empty ? doctor.DoctorId.ToString() : Guid.Empty.ToString();
            var docName = doctor.DoctorName;

            int encounterCount = consultations.Count(c =>
                (doctor.DoctorId != Guid.Empty && c.DoctorId == doctor.DoctorId) ||
                (!string.IsNullOrWhiteSpace(docName) && !string.IsNullOrWhiteSpace(c.DoctorName) &&
                 string.Equals(c.DoctorName, docName, StringComparison.OrdinalIgnoreCase)));

            // Line items attributed to this doctor
            var docLineItems = invoices
                .SelectMany(i => i.LineItems.Select(li => new { li.DoctorId, li.DoctorName, li.Category, li.TotalPrice, i.AttendingDoctorId }))
                .Where(li =>
                    (!string.IsNullOrWhiteSpace(docName) && !string.IsNullOrWhiteSpace(li.DoctorName) &&
                     string.Equals(li.DoctorName, docName, StringComparison.OrdinalIgnoreCase)) ||
                    (doctor.DoctorId != Guid.Empty && li.DoctorId.HasValue && li.DoctorId.Value == doctor.DoctorId) ||
                    (doctor.DoctorId != Guid.Empty && (!li.DoctorId.HasValue || li.DoctorId.Value == Guid.Empty) &&
                     string.IsNullOrWhiteSpace(li.DoctorName) && li.AttendingDoctorId == doctor.DoctorId))
                .ToList();

            decimal consultGross = docLineItems
                .Where(li => li.Category != null && li.Category.Contains("Consultation", StringComparison.OrdinalIgnoreCase))
                .Sum(li => li.TotalPrice);

            int procedureCount = procedures.Count(p =>
                (!string.IsNullOrWhiteSpace(docName) &&
                 (string.Equals(p.OrderedByDoctorName, docName, StringComparison.OrdinalIgnoreCase) ||
                  string.Equals(p.PerformedByStaffName, docName, StringComparison.OrdinalIgnoreCase))) ||
                (doctor.DoctorId != Guid.Empty &&
                 ((p.OrderedByDoctorId.HasValue && p.OrderedByDoctorId.Value == doctor.DoctorId) ||
                  (p.PerformedByStaffId.HasValue && p.PerformedByStaffId.Value == doctor.DoctorId))));

            decimal procedureGross = docLineItems
                .Where(li => li.Category != null && li.Category.Contains("Procedure", StringComparison.OrdinalIgnoreCase))
                .Sum(li => li.TotalPrice);

            decimal totalGross = consultGross + procedureGross;

            if (totalGross > 0m || encounterCount > 0 || procedureCount > 0)
            {
                decimal doctorShare = Math.Round(totalGross * doctorSharePct, 2);
                decimal facilityShare = totalGross - doctorShare;

                details.Add(new DoctorWorkloadDetailDto(
                    docId,
                    docName,
                    encounterCount,
                    procedureCount,
                    consultGross,
                    procedureGross,
                    totalGross,
                    doctorShare,
                    facilityShare
                ));
            }
        }

        int totalEncounters = details.Sum(d => d.TotalEncounters);
        decimal totalGrossRevenue = details.Sum(d => d.TotalGrossGenerated);
        decimal totalDocShares = details.Sum(d => d.EstimatedPhysicianShare);
        decimal totalFacShares = details.Sum(d => d.ClinicFacilityShare);

        return new DoctorSharesReportDto(
            start,
            end.AddDays(-1),
            _clinicContext.TenantId,
            _clinicContext.ClinicId,
            totalEncounters,
            totalGrossRevenue,
            totalDocShares,
            totalFacShares,
            details
        );
    }
}
