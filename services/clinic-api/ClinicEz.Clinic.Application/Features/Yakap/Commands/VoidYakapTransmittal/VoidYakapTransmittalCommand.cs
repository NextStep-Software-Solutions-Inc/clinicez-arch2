namespace ClinicEz.Clinic.Application.Features.Yakap.Commands.VoidYakapTransmittal;

using System;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Audit;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Domain.Constants;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Exceptions;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

public sealed record VoidYakapTransmittalCommand(
    Guid TransmittalId,
    string VoidReason) : IRequest<ApiResponse<bool>>;

public sealed class VoidYakapTransmittalCommandValidator : AbstractValidator<VoidYakapTransmittalCommand>
{
    public VoidYakapTransmittalCommandValidator()
    {
        RuleFor(x => x.TransmittalId).NotEmpty().WithMessage("TransmittalId is required.");
        RuleFor(x => x.VoidReason)
            .NotEmpty().WithMessage("Mandatory statutory void reason is required.")
            .MinimumLength(5).WithMessage("Void reason must provide sufficient forensic context (minimum 5 characters).");
    }
}

public sealed class VoidYakapTransmittalCommandHandler : IRequestHandler<VoidYakapTransmittalCommand, ApiResponse<bool>>
{
    private static readonly JsonSerializerOptions JsonOptions = new() { PropertyNamingPolicy = JsonNamingPolicy.CamelCase };

    private readonly IRepository<YakapTransmittal> _transmittalRepo;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClinicContext _clinicContext;
    private readonly IAuditLogQueue _auditQueue;

    public VoidYakapTransmittalCommandHandler(
        IRepository<YakapTransmittal> transmittalRepo,
        IUnitOfWork unitOfWork,
        IClinicContext clinicContext,
        IAuditLogQueue auditQueue)
    {
        _transmittalRepo = transmittalRepo ?? throw new ArgumentNullException(nameof(transmittalRepo));
        _unitOfWork = unitOfWork ?? throw new ArgumentNullException(nameof(unitOfWork));
        _clinicContext = clinicContext ?? throw new ArgumentNullException(nameof(clinicContext));
        _auditQueue = auditQueue ?? throw new ArgumentNullException(nameof(auditQueue));
    }

    public async Task<ApiResponse<bool>> Handle(VoidYakapTransmittalCommand request, CancellationToken cancellationToken)
    {
        var transmittal = await _transmittalRepo.Query(t => t.Id == request.TransmittalId && t.ClinicId == _clinicContext.ClinicId)
            .Include(t => t.Items)
            .FirstOrDefaultAsync(cancellationToken);

        if (transmittal == null)
        {
            throw new NotFoundException($"PhilHealth Yakap transmittal '{request.TransmittalId}' was not found.");
        }

        transmittal.Status = YakapTransmittalStatus.Failed;
        transmittal.ValidationErrors.Add($"VOIDED: {request.VoidReason.Trim()}");
        transmittal.UpdatedAt = DateTime.UtcNow;
        transmittal.UpdatedBy = _clinicContext.StaffId?.ToString() ?? "Admin";

        foreach (var item in transmittal.Items)
        {
            item.ReportStatus = "D"; // Deficient/Voided
            item.DeficiencyRemarks = $"Voided per clinic request: {request.VoidReason.Trim()}";
        }

        _transmittalRepo.Update(transmittal);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        // Immutable statutory audit trail recording: yakap.claim.voided
        var metadata = new
        {
            TransmittalNumber = transmittal.TransmittalNumber,
            PhilHealthTransactionNumber = transmittal.PhilHealthTransactionNumber,
            ReportTagging = transmittal.ReportTagging,
            VoidReason = request.VoidReason.Trim(),
            VoidedItemsCount = transmittal.Items.Count,
            VoidedAtUtc = DateTime.UtcNow
        };

        var auditMessage = new AuditLogMessage
        {
            TenantId = _clinicContext.TenantId,
            ClinicId = _clinicContext.ClinicId,
            Timestamp = DateTime.UtcNow,
            Category = ClinicAuditCategories.PhilHealth,
            Severity = ClinicAuditSeverities.Emergency,
            Action = PhilHealthAuditEvents.ClaimVoided,
            ActorStaffId = _clinicContext.StaffId,
            ActorName = "Admin",
            ActorRole = "Administrator",
            TargetEntityType = "YakapTransmittal",
            TargetEntityId = transmittal.Id.ToString(),
            Outcome = ClinicAuditOutcomes.Success,
            Description = $"PhilHealth Yakap transmittal '{transmittal.TransmittalNumber}' voided. Reason: {request.VoidReason.Trim()}",
            MetadataJson = JsonSerializer.Serialize(metadata, JsonOptions)
        };

        _auditQueue.TryEnqueue(auditMessage);

        return ApiResponse<bool>.Success(true, "Yakap transmittal voided successfully.");
    }
}
