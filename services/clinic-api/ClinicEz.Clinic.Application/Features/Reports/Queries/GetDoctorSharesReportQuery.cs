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
    private readonly IRepository<ClinicalProcedure> _procedureRepo;
    private readonly IClinicContext _clinicContext;
    private readonly IRepository<ClinicSettings>? _settingsRepo;

    public GetDoctorSharesReportQueryHandler(
        IRepository<ConsultationEncounter> consultationRepo,
        IRepository<Invoice> invoiceRepo,
        IRepository<ClinicalProcedure> procedureRepo,
        IClinicContext clinicContext,
        IRepository<ClinicSettings>? settingsRepo = null)
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

        ClinicSettings? settings = null;
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
            .Select(p => new { p.OrderedByDoctorName, p.PerformedByStaffName })
            .ToListAsync(cancellationToken);

        var doctorGroups = consultations
            .GroupBy(c => new { c.DoctorId, c.DoctorName })
            .ToList();

        var details = new List<DoctorWorkloadDetailDto>();

        foreach (var group in doctorGroups)
        {
            var docId = group.Key.DoctorId.ToString();
            var docName = group.Key.DoctorName;
            int encounterCount = group.Count();

            // Consultations line items for this doctor
            var docLineItems = invoices
                .SelectMany(i => i.LineItems.Select(li => new { li.DoctorId, li.DoctorName, li.Category, li.TotalPrice, i.AttendingDoctorId }))
                .Where(li => (li.DoctorName != null && string.Equals(li.DoctorName, docName, StringComparison.OrdinalIgnoreCase)) ||
                             (group.Key.DoctorId != Guid.Empty && li.DoctorId == group.Key.DoctorId) ||
                             (group.Key.DoctorId != Guid.Empty && li.DoctorId == null && string.IsNullOrEmpty(li.DoctorName) && li.AttendingDoctorId == group.Key.DoctorId))
                .ToList();

            decimal consultGross = docLineItems
                .Where(li => li.Category.Contains("Consultation", StringComparison.OrdinalIgnoreCase))
                .Sum(li => li.TotalPrice);

            int procedureCount = procedures.Count(p => p.OrderedByDoctorName == docName || p.PerformedByStaffName == docName);
            decimal procedureGross = docLineItems
                .Where(li => li.Category.Contains("Procedure", StringComparison.OrdinalIgnoreCase))
                .Sum(li => li.TotalPrice);

            decimal totalGross = consultGross + procedureGross;
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
