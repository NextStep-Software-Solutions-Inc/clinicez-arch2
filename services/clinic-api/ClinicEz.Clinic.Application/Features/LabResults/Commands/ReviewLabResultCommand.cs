using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.LabOrders;
using ClinicEz.Clinic.Application.Features.LabResults.DTOs;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Exceptions;
using ClinicEz.Shared.Interoperability;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Features.LabResults.Commands;

public record ReviewLabResultCommand(Guid ResultId, bool Accepted, string? Remarks) : IRequest<LabResultReviewItemDto>;

/// <summary>
/// A doctor accepts or rejects an unverified (external-lab or patient-uploaded) result. Only an Unverified result can be
/// reviewed, once; a ClinicEZ-lab result is verified by its lab and is not reviewable. The review is announced to the
/// laboratory (when routed) and to the patient, and the patient's copy of the document is updated, all in the same
/// <c>SaveChanges</c> as the decision.
/// </summary>
public class ReviewLabResultCommandHandler : IRequestHandler<ReviewLabResultCommand, LabResultReviewItemDto>
{
    private readonly IRepository<LabResult> _resultRepo;
    private readonly IRepository<LabOrder> _orderRepo;
    private readonly IRepository<StaffMember> _staffRepo;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClinicContext _clinicContext;
    private readonly ILabResultReviewedPublisher _reviewPublisher;
    private readonly IPatientDocumentPublisher _documents;

    public ReviewLabResultCommandHandler(
        IRepository<LabResult> resultRepo,
        IRepository<LabOrder> orderRepo,
        IRepository<StaffMember> staffRepo,
        IUnitOfWork unitOfWork,
        IClinicContext clinicContext,
        ILabResultReviewedPublisher reviewPublisher,
        IPatientDocumentPublisher documents)
    {
        _resultRepo = resultRepo;
        _orderRepo = orderRepo;
        _staffRepo = staffRepo;
        _unitOfWork = unitOfWork;
        _clinicContext = clinicContext;
        _reviewPublisher = reviewPublisher;
        _documents = documents;
    }

    public async Task<LabResultReviewItemDto> Handle(ReviewLabResultCommand request, CancellationToken cancellationToken)
    {
        var remarks = request.Remarks?.Trim();
        if (!request.Accepted && string.IsNullOrEmpty(remarks))
        {
            throw new BadRequestException("Remarks are required when rejecting a result.");
        }

        var result = await _resultRepo.Query(r => r.Id == request.ResultId).FirstOrDefaultAsync(cancellationToken)
            ?? throw new NotFoundException($"Lab result '{request.ResultId}' was not found.");

        if (result.Source == ResultSource.ClinicEzLab)
        {
            throw new ConflictException("A Clinic EZ laboratory result is verified by the laboratory and cannot be reviewed here.");
        }

        if (result.Verification != VerificationState.Unverified)
        {
            throw new ConflictException($"This result was already reviewed ({result.Verification}).");
        }

        var order = await _orderRepo.Query(o => o.Id == result.LabOrderId)
            .Include(o => o.Items)
            .FirstOrDefaultAsync(cancellationToken)
            ?? throw new NotFoundException($"Clinic lab order '{result.LabOrderId}' was not found.");

        var staffId = _clinicContext.StaffId
            ?? throw new BadRequestException("Only a signed-in staff member can review a result.");
        var reviewer = await _staffRepo.Query(s => s.Id == staffId && s.ClinicId == _clinicContext.ClinicId)
            .FirstOrDefaultAsync(cancellationToken)
            ?? throw new BadRequestException("The reviewing staff member was not found in this clinic.");

        var now = DateTime.UtcNow;
        var reviewerName = $"{reviewer.Title} {reviewer.FirstName} {reviewer.LastName}".Trim();

        result.Verification = request.Accepted ? VerificationState.Verified : VerificationState.Rejected;
        result.VerifiedByStaffId = reviewer.Id;
        result.VerifiedByName = reviewerName;
        result.VerifiedByPrc = reviewer.PrcLicenseNumber;
        result.VerifiedAt = now;
        result.ReviewRemarks = remarks;
        result.UpdatedAt = now;
        result.UpdatedBy = reviewerName;

        order.Stage = request.Accepted ? LabOrderStage.Reviewed : LabOrderStage.Rejected;
        order.StageChangedAt = now;
        order.StageReason = request.Accepted ? null : remarks;

        // Queued in the interop outbox: it commits in the same SaveChanges as the decision, or not at all.
        await _reviewPublisher.PublishAsync(order, new LabResultReviewedPayload
        {
            RequisitionId = order.Id,
            ReportId = result.ReportId,
            State = result.Verification,
            ReviewedByName = reviewerName,
            ReviewedByPrc = reviewer.PrcLicenseNumber,
            Remarks = remarks,
            ReviewedAtUtc = now
        }, cancellationToken);
        await _documents.PublishAsync(LabResultDocuments.For(order, result), cancellationToken);

        await _unitOfWork.SaveChangesAsync(cancellationToken);

        return LabResultReviewItemDto.From(result, order);
    }
}
