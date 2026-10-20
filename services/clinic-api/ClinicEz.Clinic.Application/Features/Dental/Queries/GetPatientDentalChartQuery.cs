using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.Dental.DTOs;
using ClinicEz.Clinic.Application.Features.Procedures.Commands;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Exceptions;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Features.Dental.Queries;

public sealed record GetPatientDentalChartQuery(
    Guid PatientId,
    Guid? ConsultationId = null
) : IRequest<DentalChartDto>;

public sealed class GetPatientDentalChartQueryHandler : IRequestHandler<GetPatientDentalChartQuery, DentalChartDto>
{
    private readonly IRepository<DentalToothRecord> _toothRepo;
    private readonly IRepository<ClinicalProcedure> _procRepo;
    private readonly IRepository<ClinicPatient>? _patientRepo;
    private readonly IClinicContext _clinicContext;

    public GetPatientDentalChartQueryHandler(
        IRepository<DentalToothRecord> toothRepo,
        IRepository<ClinicalProcedure> procRepo,
        IClinicContext clinicContext)
        : this(toothRepo, procRepo, null, clinicContext)
    {
    }

    public GetPatientDentalChartQueryHandler(
        IRepository<DentalToothRecord> toothRepo,
        IRepository<ClinicalProcedure> procRepo,
        IRepository<ClinicPatient>? patientRepo,
        IClinicContext clinicContext)
    {
        _toothRepo = toothRepo ?? throw new ArgumentNullException(nameof(toothRepo));
        _procRepo = procRepo ?? throw new ArgumentNullException(nameof(procRepo));
        _patientRepo = patientRepo;
        _clinicContext = clinicContext ?? throw new ArgumentNullException(nameof(clinicContext));
    }

    public async Task<DentalChartDto> Handle(GetPatientDentalChartQuery request, CancellationToken ct)
    {
        if (request.PatientId == Guid.Empty)
        {
            throw new BadRequestException("PatientId is required to query dental chart.");
        }

        if (_patientRepo != null)
        {
            var patientExists = await _patientRepo
                .Query(p => p.ClinicId == _clinicContext.ClinicId && p.Id == request.PatientId && !p.IsDeleted)
                .AnyAsync(ct);

            if (!patientExists)
            {
                throw new NotFoundException($"Patient '{request.PatientId}' not found.");
            }
        }

        var records = await _toothRepo
            .Query(t => t.ClinicId == _clinicContext.ClinicId && t.PatientId == request.PatientId && !t.IsDeleted)
            .AsNoTracking()
            .OrderBy(t => t.ToothNumber)
            .ToListAsync(ct);

        var teethDtos = records.Select(r => new DentalToothRecordDto(
            r.Id,
            r.TenantId,
            r.ClinicId,
            r.PatientId,
            r.ConsultationId,
            r.ToothNumber,
            r.Status,
            r.Surface,
            r.Notes,
            r.CreatedAt,
            r.UpdatedAt,
            r.PatientName,
            r.UpdatedBy ?? r.CreatedBy
        )).ToList();

        var procedures = await _procRepo
            .Query(p => p.ClinicId == _clinicContext.ClinicId && p.PatientId == request.PatientId && !p.IsDeleted
                    && (p.Category == "Dental" || p.ToothNumber.HasValue))
            .AsNoTracking()
            .OrderByDescending(p => p.ScheduledAt)
            .ToListAsync(ct);

        var procDtos = procedures
            .Select(p => OrderProcedureCommandHandler.MapToDto(p, _clinicContext.TenantId))
            .ToList();

        var lastExaminedAt = records.Count > 0
            ? records.Max(r => r.UpdatedAt ?? r.CreatedAt)
            : (DateTime?)null;

        var dmftCount = records
            .Where(r => r.Status == ToothStatus.Decay || r.Status == ToothStatus.Missing || r.Status == ToothStatus.Filled)
            .Select(r => r.ToothNumber)
            .Distinct()
            .Count();

        var summary = new DentalSummaryDto(
            TotalTeethRecorded: records.Select(r => r.ToothNumber).Distinct().Count(),
            HealthyCount: records.Where(r => r.Status == ToothStatus.Healthy).Select(r => r.ToothNumber).Distinct().Count(),
            DecayCount: records.Where(r => r.Status == ToothStatus.Decay).Select(r => r.ToothNumber).Distinct().Count(),
            FilledCount: records.Where(r => r.Status == ToothStatus.Filled).Select(r => r.ToothNumber).Distinct().Count(),
            MissingCount: records.Where(r => r.Status == ToothStatus.Missing).Select(r => r.ToothNumber).Distinct().Count(),
            CrownCount: records.Where(r => r.Status == ToothStatus.Crown).Select(r => r.ToothNumber).Distinct().Count(),
            ExtractionCount: records.Where(r => r.Status == ToothStatus.Extraction).Select(r => r.ToothNumber).Distinct().Count(),
            DmftIndex: dmftCount
        );

        return new DentalChartDto(request.PatientId, teethDtos, procDtos, lastExaminedAt, summary);
    }
}
