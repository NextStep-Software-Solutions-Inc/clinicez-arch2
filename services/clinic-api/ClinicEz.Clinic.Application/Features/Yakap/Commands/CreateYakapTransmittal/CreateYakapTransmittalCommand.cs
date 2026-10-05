using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.Yakap.DTOs;
using ClinicEz.Clinic.Application.Features.Yakap.Services;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Common;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Features.Yakap.Commands.CreateYakapTransmittal;

public sealed record CreateYakapTransmittalCommand(
    IReadOnlyList<Guid>? ConsultationEncounterIds = null,
    string ReportTagging = "1",
    string? EffectiveYear = null,
    Guid? BranchId = null) : IRequest<ApiResponse<YakapTransmittalDto>>;

public sealed class CreateYakapTransmittalCommandValidator : AbstractValidator<CreateYakapTransmittalCommand>
{
    public CreateYakapTransmittalCommandValidator()
    {
        RuleFor(x => x.ReportTagging)
            .Must(t => t == "1" || t == "2")
            .WithMessage("ReportTagging must be '1' (First Tranche) or '2' (Second Tranche).");
    }
}

public sealed class CreateYakapTransmittalCommandHandler : IRequestHandler<CreateYakapTransmittalCommand, ApiResponse<YakapTransmittalDto>>
{
    private readonly IRepository<YakapTransmittal> _transmittalRepo;
    private readonly IRepository<ConsultationEncounter> _encounterRepo;
    private readonly IRepository<ClinicPatient> _patientRepo;
    private readonly IRepository<TriageVitals> _vitalsRepo;
    private readonly IRepository<ClinicSettings> _settingsRepo;
    private readonly IRepository<ClinicLabOrder> _labOrderRepo;
    private readonly IRepository<ClinicServiceItem> _serviceItemRepo;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClinicContext _clinicContext;
    private readonly IYakapClinicalMapper _mapper;
    private readonly IPhilHealthSequenceGenerator? _sequenceGenerator;

    public CreateYakapTransmittalCommandHandler(
        IRepository<YakapTransmittal> transmittalRepo,
        IRepository<ConsultationEncounter> encounterRepo,
        IRepository<ClinicPatient> patientRepo,
        IRepository<TriageVitals> vitalsRepo,
        IRepository<ClinicSettings> settingsRepo,
        IRepository<ClinicLabOrder> labOrderRepo,
        IRepository<ClinicServiceItem> serviceItemRepo,
        IUnitOfWork unitOfWork,
        IClinicContext clinicContext,
        IYakapClinicalMapper mapper,
        IPhilHealthSequenceGenerator? sequenceGenerator = null)
    {
        _transmittalRepo = transmittalRepo;
        _encounterRepo = encounterRepo;
        _patientRepo = patientRepo;
        _vitalsRepo = vitalsRepo;
        _settingsRepo = settingsRepo;
        _labOrderRepo = labOrderRepo;
        _serviceItemRepo = serviceItemRepo;
        _unitOfWork = unitOfWork;
        _clinicContext = clinicContext;
        _mapper = mapper;
        _sequenceGenerator = sequenceGenerator;
    }

    public async Task<ApiResponse<YakapTransmittalDto>> Handle(
        CreateYakapTransmittalCommand request,
        CancellationToken cancellationToken)
    {
        var clinicId = _clinicContext.ClinicId;
        var tenantId = _clinicContext.TenantId;
        var targetBranchId = request.BranchId ?? _clinicContext.BranchId;

        // 1. Load encounters
        List<ConsultationEncounter> encounters;
        if (request.ConsultationEncounterIds != null && request.ConsultationEncounterIds.Count > 0)
        {
            encounters = await _encounterRepo.Query(e =>
                    request.ConsultationEncounterIds.Contains(e.Id) &&
                    (targetBranchId.HasValue ? e.BranchId == targetBranchId.Value : e.ClinicId == clinicId))
                .Include(e => e.Diagnoses)
                .Include(e => e.Prescriptions)
                .ToListAsync(cancellationToken);
        }
        else
        {
            var submittedEncounterIds = await _transmittalRepo.Query(t =>
                    (targetBranchId.HasValue ? t.BranchId == targetBranchId.Value : t.ClinicId == clinicId) &&
                    t.Status != YakapTransmittalStatus.Failed)
                .SelectMany(t => t.Items)
                .Where(i => i.ConsultationEncounterId.HasValue)
                .Select(i => i.ConsultationEncounterId!.Value)
                .Distinct()
                .ToListAsync(cancellationToken);

            var query = _encounterRepo.Query(e =>
                    (targetBranchId.HasValue ? e.BranchId == targetBranchId.Value : e.ClinicId == clinicId) &&
                    !submittedEncounterIds.Contains(e.Id));

            if (request.ReportTagging == "2")
            {
                query = query.Where(e => e.IsSigned);
            }

            encounters = await query
                .Include(e => e.Diagnoses)
                .Include(e => e.Prescriptions)
                .OrderBy(e => e.EncounterDate)
                .ToListAsync(cancellationToken);
        }

        if (encounters.Count == 0)
        {
            return ApiResponse<YakapTransmittalDto>.Fail("No matching consultation encounters found.");
        }

        // 2. Load patients
        var patientIds = encounters.Select(e => e.PatientId).Distinct().ToList();
        var patientsList = await _patientRepo.Query(p => patientIds.Contains(p.Id))
            .ToListAsync(cancellationToken);
        var patientsMap = patientsList.ToDictionary(p => p.Id, p => p);

        // 3. Load vitals
        var queueItemIds = encounters.Where(e => e.QueueItemId.HasValue).Select(e => e.QueueItemId!.Value).ToList();
        var vitalsList = await _vitalsRepo.Query(v => queueItemIds.Contains(v.QueueItemId) || patientIds.Contains(v.PatientId))
            .ToListAsync(cancellationToken);

        var vitalsMap = new Dictionary<Guid, TriageVitals>();
        foreach (var enc in encounters)
        {
            var match = vitalsList.FirstOrDefault(v => enc.QueueItemId.HasValue && v.QueueItemId == enc.QueueItemId.Value)
                        ?? vitalsList.FirstOrDefault(v => v.PatientId == enc.PatientId);
            if (match != null)
            {
                vitalsMap[enc.Id] = match;
            }
        }

        // 4. Load clinic settings
        var settings = await _settingsRepo.Query(s => s.ClinicId == clinicId)
            .FirstOrDefaultAsync(cancellationToken);
        settings ??= new ClinicSettings
        {
            TenantId = tenantId,
            ClinicId = clinicId,
            ClinicName = "ClinicEz Healthcare Center",
            AccreditationNumber = "000000000"
        };

        var effectiveYear = request.EffectiveYear ?? DateTime.UtcNow.Year.ToString();
        string transmittalNumber;

        if (_sequenceGenerator != null)
        {
            var accreClean = settings.AccreditationNumber ?? "000921";
            transmittalNumber = await _sequenceGenerator.GenerateTransmittalNumberAsync(
                tenantId, clinicId, accreClean, effectiveYear, cancellationToken);

            foreach (var p in patientsList)
            {
                await _sequenceGenerator.AssignPatientJourneyNumbersAsync(
                    tenantId, clinicId, p.Id, null, accreClean, effectiveYear, cancellationToken);
            }

            foreach (var enc in encounters)
            {
                await _sequenceGenerator.AssignPatientJourneyNumbersAsync(
                    tenantId, clinicId, enc.PatientId, enc.Id, accreClean, effectiveYear, cancellationToken);
            }
        }
        else
        {
            var timestamp = DateTime.UtcNow.ToString("yyyyMMddHHmmss");
            var accreditationShort = (settings.AccreditationNumber ?? "000000000").Replace("-", string.Empty);
            transmittalNumber = $"RHCI{accreditationShort}{effectiveYear}{timestamp}";
        }

        // 5. Load lab orders and fee schedule
        var encIds = encounters.Select(e => e.Id).ToList();
        var labOrders = await _labOrderRepo.Query(l => l.ConsultationId.HasValue && encIds.Contains(l.ConsultationId.Value))
            .Include(l => l.Items)
            .ToListAsync(cancellationToken);

        var labOrdersMap = labOrders
            .GroupBy(l => l.ConsultationId!.Value)
            .ToDictionary(g => g.Key, g => g.ToList());

        var serviceItems = await _serviceItemRepo.Query(s => s.ClinicId == clinicId || s.TenantId == tenantId)
            .ToListAsync(cancellationToken);

        var feeScheduleMap = new Dictionary<string, decimal>(StringComparer.OrdinalIgnoreCase);
        foreach (var item in serviceItems)
        {
            if (!string.IsNullOrWhiteSpace(item.PhilHealthCode))
                feeScheduleMap[item.PhilHealthCode] = item.StandardPrice;
            if (!string.IsNullOrWhiteSpace(item.Code))
                feeScheduleMap[item.Code] = item.StandardPrice;
            if (!string.IsNullOrWhiteSpace(item.Name))
                feeScheduleMap[item.Name] = item.StandardPrice;
        }

        // 6. Generate mapping document
        _mapper.MapToYakapReportDocument(
            request.ReportTagging,
            effectiveYear,
            settings,
            encounters,
            patientsMap,
            vitalsMap,
            transmittalNumber,
            ncdMap: null,
            labOrdersMap: labOrdersMap,
            feeScheduleMap: feeScheduleMap);

        // 6. Build Transmittal Entity
        var transmittal = new YakapTransmittal
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            BranchId = targetBranchId,
            TransmittalNumber = transmittalNumber,
            ReportTagging = request.ReportTagging,
            EffectiveYear = effectiveYear,
            PackageType = "K",
            Status = YakapTransmittalStatus.Draft,
            CreatedAt = DateTime.UtcNow,
            CreatedBy = _clinicContext.StaffId?.ToString() ?? "System"
        };

        foreach (var p in patientsList)
        {
            transmittal.Items.Add(new YakapTransmittalItem
            {
                Id = Guid.NewGuid(),
                TenantId = tenantId,
                ClinicId = clinicId,
                YakapTransmittalId = transmittal.Id,
                PatientId = p.Id,
                PatientName = $"{p.LastName}, {p.FirstName}",
                PhilHealthIdentificationNumber = _mapper.NormalizePin(p.PhilHealthNumber ?? string.Empty),
                ItemType = "Enlistment",
                ReportStatus = "U"
            });

            transmittal.Items.Add(new YakapTransmittalItem
            {
                Id = Guid.NewGuid(),
                TenantId = tenantId,
                ClinicId = clinicId,
                YakapTransmittalId = transmittal.Id,
                PatientId = p.Id,
                PatientName = $"{p.LastName}, {p.FirstName}",
                PhilHealthIdentificationNumber = _mapper.NormalizePin(p.PhilHealthNumber ?? string.Empty),
                ItemType = "Profile",
                ReportStatus = "U"
            });
        }

        foreach (var enc in encounters)
        {
            if (patientsMap.TryGetValue(enc.PatientId, out var patient))
            {
                transmittal.Items.Add(new YakapTransmittalItem
                {
                    Id = Guid.NewGuid(),
                    TenantId = tenantId,
                    ClinicId = clinicId,
                    YakapTransmittalId = transmittal.Id,
                    PatientId = patient.Id,
                    PatientName = $"{patient.LastName}, {patient.FirstName}",
                    PhilHealthIdentificationNumber = _mapper.NormalizePin(patient.PhilHealthNumber ?? string.Empty),
                    ConsultationEncounterId = enc.Id,
                    EncounterDate = enc.EncounterDate,
                    ItemType = "Soap",
                    ReportStatus = "U"
                });
            }
        }

        await _transmittalRepo.AddAsync(transmittal, cancellationToken);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        var dto = new YakapTransmittalDto(
            Id: transmittal.Id,
            TransmittalNumber: transmittal.TransmittalNumber,
            ReportTagging: transmittal.ReportTagging,
            EffectiveYear: transmittal.EffectiveYear,
            PackageType: transmittal.PackageType,
            Status: transmittal.Status,
            PhilHealthTransactionNumber: transmittal.PhilHealthTransactionNumber,
            EncryptedPayloadHash: transmittal.EncryptedPayloadHash,
            ValidationErrors: transmittal.ValidationErrors,
            SubmittedAt: transmittal.SubmittedAt,
            SubmittedBy: transmittal.SubmittedBy,
            CreatedAt: transmittal.CreatedAt,
            TotalItemsCount: transmittal.Items.Count,
            Items: transmittal.Items.Select(i => new YakapTransmittalItemDto(
                Id: i.Id,
                YakapTransmittalId: i.YakapTransmittalId,
                PatientId: i.PatientId,
                PatientName: i.PatientName,
                PhilHealthIdentificationNumber: i.PhilHealthIdentificationNumber,
                ConsultationEncounterId: i.ConsultationEncounterId,
                EncounterDate: i.EncounterDate,
                ItemType: i.ItemType,
                ReportStatus: i.ReportStatus,
                DeficiencyRemarks: i.DeficiencyRemarks)).ToList(),
            BranchId: transmittal.BranchId);

        return ApiResponse<YakapTransmittalDto>.Success(dto);
    }
}
