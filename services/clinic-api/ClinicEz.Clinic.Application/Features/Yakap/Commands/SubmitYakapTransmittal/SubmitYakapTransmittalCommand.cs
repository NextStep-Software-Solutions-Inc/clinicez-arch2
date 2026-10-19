using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.Yakap.DTOs;
using ClinicEz.Clinic.Application.Features.Yakap.Services;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Common;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Features.Yakap.Commands.SubmitYakapTransmittal;

public sealed record SubmitYakapTransmittalCommand(Guid TransmittalId) : IRequest<ApiResponse<YakapSubmissionResultDto>>;

public sealed class SubmitYakapTransmittalCommandValidator : AbstractValidator<SubmitYakapTransmittalCommand>
{
    public SubmitYakapTransmittalCommandValidator()
    {
        RuleFor(x => x.TransmittalId).NotEmpty().WithMessage("TransmittalId is required.");
    }
}

public sealed class SubmitYakapTransmittalCommandHandler : IRequestHandler<SubmitYakapTransmittalCommand, ApiResponse<YakapSubmissionResultDto>>
{
    private readonly IRepository<YakapTransmittal> _transmittalRepo;
    private readonly IRepository<ConsultationEncounter> _encounterRepo;
    private readonly IRepository<ClinicPatient> _patientRepo;
    private readonly IRepository<TriageVitals> _vitalsRepo;
    private readonly IRepository<ClinicSettings> _settingsRepo;
    private readonly IRepository<ClinicLabOrder> _labOrderRepo;
    private readonly IRepository<ClinicServiceItem> _serviceItemRepo;
    private readonly IPhilHealthProxyClient _proxyClient;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClinicContext _clinicContext;
    private readonly IYakapClinicalMapper _mapper;
    private readonly IRepository<PatientPhysicalExamProfile>? _physicalExamRepo;

    public SubmitYakapTransmittalCommandHandler(
        IRepository<YakapTransmittal> transmittalRepo,
        IRepository<ConsultationEncounter> encounterRepo,
        IRepository<ClinicPatient> patientRepo,
        IRepository<TriageVitals> vitalsRepo,
        IRepository<ClinicSettings> settingsRepo,
        IRepository<ClinicLabOrder> labOrderRepo,
        IRepository<ClinicServiceItem> serviceItemRepo,
        IPhilHealthProxyClient proxyClient,
        IUnitOfWork unitOfWork,
        IClinicContext clinicContext,
        IYakapClinicalMapper mapper,
        IRepository<PatientPhysicalExamProfile>? physicalExamRepo = null)
    {
        _transmittalRepo = transmittalRepo;
        _encounterRepo = encounterRepo;
        _patientRepo = patientRepo;
        _vitalsRepo = vitalsRepo;
        _settingsRepo = settingsRepo;
        _labOrderRepo = labOrderRepo;
        _serviceItemRepo = serviceItemRepo;
        _proxyClient = proxyClient;
        _unitOfWork = unitOfWork;
        _clinicContext = clinicContext;
        _mapper = mapper;
        _physicalExamRepo = physicalExamRepo;
    }

    public async Task<ApiResponse<YakapSubmissionResultDto>> Handle(
        SubmitYakapTransmittalCommand request,
        CancellationToken cancellationToken)
    {
        var transmittal = await _transmittalRepo.Query(t => t.Id == request.TransmittalId)
            .Include(t => t.Items)
            .FirstOrDefaultAsync(cancellationToken);

        if (transmittal == null)
        {
            return ApiResponse<YakapSubmissionResultDto>.Fail("Yakap transmittal not found.");
        }

        // Reconstruct report document
        var encounterIds = transmittal.Items
            .Where(i => i.ConsultationEncounterId.HasValue)
            .Select(i => i.ConsultationEncounterId!.Value)
            .Distinct()
            .ToList();

        var encounters = await _encounterRepo.Query(e => encounterIds.Contains(e.Id))
            .Include(e => e.Diagnoses)
            .Include(e => e.Prescriptions)
            .ToListAsync(cancellationToken);

        var patientIds = transmittal.Items.Select(i => i.PatientId).Distinct().ToList();
        var patientsList = await _patientRepo.Query(p => patientIds.Contains(p.Id))
            .ToListAsync(cancellationToken);
        var patientsMap = patientsList.ToDictionary(p => p.Id, p => p);

        Dictionary<Guid, PatientPhysicalExamProfile>? peMap = null;
        if (_physicalExamRepo != null)
        {
            var peList = await _physicalExamRepo.Query(pe => patientIds.Contains(pe.PatientId))
                .ToListAsync(cancellationToken);
            peMap = peList.ToDictionary(pe => pe.PatientId, pe => pe);
        }

        var queueItemIds = encounters.Where(e => e.QueueItemId.HasValue).Select(e => e.QueueItemId!.Value).ToList();
        var vitalsList = await _vitalsRepo.Query(v => queueItemIds.Contains(v.QueueItemId) || patientIds.Contains(v.PatientId))
            .ToListAsync(cancellationToken);

        var vitalsMap = new Dictionary<Guid, TriageVitals>();
        foreach (var enc in encounters)
        {
            var match = vitalsList.FirstOrDefault(v => enc.QueueItemId.HasValue && v.QueueItemId == enc.QueueItemId.Value)
                        ?? vitalsList.FirstOrDefault(v => v.PatientId == enc.PatientId);
            if (match != null)
                vitalsMap[enc.Id] = match;
        }

        var settings = await _settingsRepo.Query(s => s.ClinicId == _clinicContext.ClinicId)
            .FirstOrDefaultAsync(cancellationToken);
        settings ??= new ClinicSettings
        {
            TenantId = _clinicContext.TenantId,
            ClinicId = _clinicContext.ClinicId,
            ClinicName = "Clinic EZ Healthcare Center",
            AccreditationNumber = "000000000"
        };

        var encIds = encounters.Select(e => e.Id).ToList();
        var labOrders = await _labOrderRepo.Query(l => l.ConsultationId.HasValue && encIds.Contains(l.ConsultationId.Value))
            .Include(l => l.Items)
            .ToListAsync(cancellationToken);

        var labOrdersMap = labOrders
            .GroupBy(l => l.ConsultationId!.Value)
            .ToDictionary(g => g.Key, g => g.ToList());

        var serviceItems = await _serviceItemRepo.Query(s => s.ClinicId == _clinicContext.ClinicId || s.TenantId == _clinicContext.TenantId)
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

        var doc = _mapper.MapToYakapReportDocument(
            transmittal.ReportTagging,
            transmittal.EffectiveYear,
            settings,
            encounters,
            patientsMap,
            vitalsMap,
            transmittal.TransmittalNumber,
            ncdMap: null,
            labOrdersMap: labOrdersMap,
            feeScheduleMap: feeScheduleMap,
            physicalExamsMap: peMap);

        var proxyResponse = await _proxyClient.SubmitReportAsync(
            new GenerateAndSubmitReportProxyRequest
            {
                Document = doc,
                ReportTagging = transmittal.ReportTagging
            },
            cancellationToken);

        if (proxyResponse.Succeeded && proxyResponse.Data != null)
        {
            var data = proxyResponse.Data;
            transmittal.RawXmlPayload = data.RawXml;

            if (data.IsSuccess)
            {
                transmittal.Status = YakapTransmittalStatus.Submitted;
                transmittal.PhilHealthTransactionNumber = data.TransactionNumber;
                transmittal.SubmittedAt = DateTime.UtcNow;
                transmittal.SubmittedBy = _clinicContext.StaffId?.ToString() ?? "System";
                transmittal.ValidationErrors.Clear();

                foreach (var item in transmittal.Items)
                {
                    item.ReportStatus = "A";
                    item.DeficiencyRemarks = null;
                }
            }
            else
            {
                transmittal.Status = YakapTransmittalStatus.Failed;
                transmittal.ValidationErrors = data.ValidationErrors?.ToList() ?? new List<string> { "Submission rejected by PhilHealth." };

                foreach (var item in transmittal.Items)
                {
                    item.ReportStatus = "D";
                    item.DeficiencyRemarks = transmittal.ValidationErrors.FirstOrDefault();
                }
            }
        }
        else
        {
            transmittal.Status = YakapTransmittalStatus.Failed;
            var errorMsg = proxyResponse.Message ?? "Failed to communicate with PhilHealth proxy";
            transmittal.ValidationErrors = new List<string> { errorMsg };
        }

        transmittal.UpdatedAt = DateTime.UtcNow;
        transmittal.UpdatedBy = _clinicContext.StaffId?.ToString() ?? "System";

        _transmittalRepo.Update(transmittal);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        var resultDto = new YakapSubmissionResultDto(
            TransmittalId: transmittal.Id,
            IsSuccess: transmittal.Status == YakapTransmittalStatus.Submitted,
            TransmittalNumber: transmittal.TransmittalNumber,
            TransactionNumber: transmittal.PhilHealthTransactionNumber,
            ValidationErrors: transmittal.ValidationErrors);

        return ApiResponse<YakapSubmissionResultDto>.Success(resultDto);
    }
}
