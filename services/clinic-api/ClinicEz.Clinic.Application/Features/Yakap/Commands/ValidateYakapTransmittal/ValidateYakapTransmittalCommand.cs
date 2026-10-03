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

namespace ClinicEz.Clinic.Application.Features.Yakap.Commands.ValidateYakapTransmittal;

public sealed record ValidateYakapTransmittalCommand(Guid TransmittalId) : IRequest<ApiResponse<YakapValidationResultDto>>;

public sealed class ValidateYakapTransmittalCommandValidator : AbstractValidator<ValidateYakapTransmittalCommand>
{
    public ValidateYakapTransmittalCommandValidator()
    {
        RuleFor(x => x.TransmittalId).NotEmpty().WithMessage("TransmittalId is required.");
    }
}

public sealed class ValidateYakapTransmittalCommandHandler : IRequestHandler<ValidateYakapTransmittalCommand, ApiResponse<YakapValidationResultDto>>
{
    private readonly IRepository<YakapTransmittal> _transmittalRepo;
    private readonly IRepository<ConsultationEncounter> _encounterRepo;
    private readonly IRepository<ClinicPatient> _patientRepo;
    private readonly IRepository<TriageVitals> _vitalsRepo;
    private readonly IRepository<ClinicSettings> _settingsRepo;
    private readonly IPhilHealthProxyClient _proxyClient;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClinicContext _clinicContext;
    private readonly IYakapClinicalMapper _mapper;

    public ValidateYakapTransmittalCommandHandler(
        IRepository<YakapTransmittal> transmittalRepo,
        IRepository<ConsultationEncounter> encounterRepo,
        IRepository<ClinicPatient> patientRepo,
        IRepository<TriageVitals> vitalsRepo,
        IRepository<ClinicSettings> settingsRepo,
        IPhilHealthProxyClient proxyClient,
        IUnitOfWork unitOfWork,
        IClinicContext clinicContext,
        IYakapClinicalMapper mapper)
    {
        _transmittalRepo = transmittalRepo;
        _encounterRepo = encounterRepo;
        _patientRepo = patientRepo;
        _vitalsRepo = vitalsRepo;
        _settingsRepo = settingsRepo;
        _proxyClient = proxyClient;
        _unitOfWork = unitOfWork;
        _clinicContext = clinicContext;
        _mapper = mapper;
    }

    public async Task<ApiResponse<YakapValidationResultDto>> Handle(
        ValidateYakapTransmittalCommand request,
        CancellationToken cancellationToken)
    {
        var transmittal = await _transmittalRepo.Query(t => t.Id == request.TransmittalId)
            .Include(t => t.Items)
            .FirstOrDefaultAsync(cancellationToken);

        if (transmittal == null)
        {
            return ApiResponse<YakapValidationResultDto>.Fail("Yakap transmittal not found.");
        }

        // Reconstruct the report document from database entities
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
            ClinicName = "ClinicEz Healthcare Center",
            AccreditationNumber = "000000000"
        };

        var doc = _mapper.MapToYakapReportDocument(
            transmittal.ReportTagging,
            transmittal.EffectiveYear,
            settings,
            encounters,
            patientsMap,
            vitalsMap,
            transmittal.TransmittalNumber);

        var proxyResponse = await _proxyClient.ValidateReportAsync(
            new GenerateAndValidateReportProxyRequest
            {
                Document = doc,
                ReportTagging = transmittal.ReportTagging
            },
            cancellationToken);

        if (proxyResponse.Succeeded && proxyResponse.Data != null)
        {
            var data = proxyResponse.Data;
            transmittal.RawXmlPayload = data.RawXml;
            transmittal.EncryptedPayloadHash = data.EncryptedPayload;

            if (data.IsValid)
            {
                transmittal.Status = YakapTransmittalStatus.Validated;
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
                transmittal.ValidationErrors = data.ValidationErrors?.ToList() ?? new List<string> { "Validation errors occurred." };
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

        var resultDto = new YakapValidationResultDto(
            TransmittalId: transmittal.Id,
            IsValid: transmittal.Status == YakapTransmittalStatus.Validated,
            TransmittalNumber: transmittal.TransmittalNumber,
            RawXml: transmittal.RawXmlPayload,
            ValidationErrors: transmittal.ValidationErrors);

        return ApiResponse<YakapValidationResultDto>.Success(resultDto);
    }
}
