using ClinicEz.Pharmacy.Application.Common;
using ClinicEz.Pharmacy.Application.Common.Interfaces;
using ClinicEz.Pharmacy.Application.Features.Prescriptions.DTOs;
using ClinicEz.Pharmacy.Domain.Entities;
using ClinicEz.Pharmacy.Domain.Enums;
using ClinicEz.Pharmacy.Domain.Interfaces;
using ClinicEz.Shared.Exceptions;
using ClinicEz.Shared.Interoperability;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Pharmacy.Application.Features.Prescriptions.Commands;

public record AcceptPrescriptionCommand(Guid PrescriptionId) : IRequest<PrescriptionOrderDto>;

public record PartiallyAcceptPrescriptionCommand(
    Guid PrescriptionId,
    IReadOnlyList<Guid> AcceptedItemIds,
    string Reason) : IRequest<PrescriptionOrderDto>;

public record RejectPrescriptionCommand(Guid PrescriptionId, string Reason) : IRequest<PrescriptionOrderDto>;

public class AcceptPrescriptionCommandValidator : AbstractValidator<AcceptPrescriptionCommand>
{
    public AcceptPrescriptionCommandValidator()
    {
        RuleFor(x => x.PrescriptionId).NotEmpty();
    }
}

public class PartiallyAcceptPrescriptionCommandValidator : AbstractValidator<PartiallyAcceptPrescriptionCommand>
{
    public PartiallyAcceptPrescriptionCommandValidator()
    {
        RuleFor(x => x.PrescriptionId).NotEmpty();
        RuleFor(x => x.AcceptedItemIds).NotEmpty().WithMessage("Select at least one item to accept.");
        RuleFor(x => x.Reason).NotEmpty().WithMessage("A reason is required when only part of a prescription is accepted.").MaximumLength(1000);
    }
}

public class RejectPrescriptionCommandValidator : AbstractValidator<RejectPrescriptionCommand>
{
    public RejectPrescriptionCommandValidator()
    {
        RuleFor(x => x.PrescriptionId).NotEmpty();
        RuleFor(x => x.Reason).NotEmpty().WithMessage("A reason is required to reject a prescription.").MaximumLength(1000);
    }
}

/// <summary>
/// Pharmacy staff review of a received prescription. Every transition queues <c>rx.status.changed</c> (ordering clinic and,
/// when known, the patient) and, on acceptance under a Prepaid/Postpaid policy, <c>billing.invoice.requested</c>, all in the
/// outbox BEFORE the single <c>SaveChanges</c> so they commit atomically with the state change. Repeating the same decision
/// is a no-op that returns the current order; a different decision on an already reviewed order is an HTTP 409.
/// </summary>
public class PrescriptionReviewCommandHandler :
    IRequestHandler<AcceptPrescriptionCommand, PrescriptionOrderDto>,
    IRequestHandler<PartiallyAcceptPrescriptionCommand, PrescriptionOrderDto>,
    IRequestHandler<RejectPrescriptionCommand, PrescriptionOrderDto>
{
    private readonly IRepository<PrescriptionOrder> _orderRepo;
    private readonly IRepository<PharmacyInventoryItem> _inventoryRepo;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IRxStatusPublisher _statusPublisher;
    private readonly IPharmacyBillingPublisher _billingPublisher;
    private readonly IPharmacyContext _pharmacyContext;

    public PrescriptionReviewCommandHandler(
        IRepository<PrescriptionOrder> orderRepo,
        IRepository<PharmacyInventoryItem> inventoryRepo,
        IUnitOfWork unitOfWork,
        IRxStatusPublisher statusPublisher,
        IPharmacyBillingPublisher billingPublisher,
        IPharmacyContext pharmacyContext)
    {
        _orderRepo = orderRepo;
        _inventoryRepo = inventoryRepo;
        _unitOfWork = unitOfWork;
        _statusPublisher = statusPublisher;
        _billingPublisher = billingPublisher;
        _pharmacyContext = pharmacyContext;
    }

    public async Task<PrescriptionOrderDto> Handle(AcceptPrescriptionCommand request, CancellationToken cancellationToken)
    {
        var order = await LoadAsync(request.PrescriptionId, cancellationToken);
        if (order.Status == PrescriptionStatus.Accepted)
        {
            return PrescriptionOrderMapper.ToDto(order);
        }

        EnsureAwaitingReview(order);

        await QuoteAsync(order, order.Items, cancellationToken);
        order.Status = PrescriptionStatus.Accepted;
        order.StatusReason = null;
        Touch(order);

        _statusPublisher.EnqueueStatusChanged(order, RxStage.Accepted);
        RequestInvoiceIfRequired(order);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        return PrescriptionOrderMapper.ToDto(order);
    }

    public async Task<PrescriptionOrderDto> Handle(PartiallyAcceptPrescriptionCommand request, CancellationToken cancellationToken)
    {
        var order = await LoadAsync(request.PrescriptionId, cancellationToken);
        if (order.Status == PrescriptionStatus.PartiallyAccepted)
        {
            return PrescriptionOrderMapper.ToDto(order);
        }

        EnsureAwaitingReview(order);

        var acceptedIds = request.AcceptedItemIds.ToHashSet();
        var accepted = order.Items.Where(i => acceptedIds.Contains(i.Id)).ToList();
        if (accepted.Count != acceptedIds.Count)
        {
            throw new BadRequestException("One or more selected items do not belong to this prescription.");
        }

        if (accepted.Count == order.Items.Count)
        {
            throw new BadRequestException("All items were selected; accept the prescription instead of partially accepting it.");
        }

        var reason = request.Reason.Trim();
        foreach (var item in order.Items.Except(accepted))
        {
            item.Status = ItemDispenseStatus.Rejected;
            item.UpdatedAt = DateTime.UtcNow;
            item.UpdatedBy = Actor();
        }

        await QuoteAsync(order, accepted, cancellationToken);
        order.Status = PrescriptionStatus.PartiallyAccepted;
        order.StatusReason = reason;
        Touch(order);

        _statusPublisher.EnqueueStatusChanged(order, RxStage.PartiallyAccepted, reason);
        RequestInvoiceIfRequired(order);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        return PrescriptionOrderMapper.ToDto(order);
    }

    public async Task<PrescriptionOrderDto> Handle(RejectPrescriptionCommand request, CancellationToken cancellationToken)
    {
        var order = await LoadAsync(request.PrescriptionId, cancellationToken);
        if (order.Status == PrescriptionStatus.Rejected)
        {
            return PrescriptionOrderMapper.ToDto(order);
        }

        EnsureAwaitingReview(order);

        var reason = request.Reason.Trim();
        foreach (var item in order.Items)
        {
            item.Status = ItemDispenseStatus.Rejected;
            item.UpdatedAt = DateTime.UtcNow;
            item.UpdatedBy = Actor();
        }

        order.Status = PrescriptionStatus.Rejected;
        order.StatusReason = reason;
        order.PaymentStatus = PrescriptionPaymentStatus.NotRequired;
        Touch(order);

        _statusPublisher.EnqueueStatusChanged(order, RxStage.Rejected, reason);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        return PrescriptionOrderMapper.ToDto(order);
    }

    private async Task<PrescriptionOrder> LoadAsync(Guid id, CancellationToken ct)
    {
        var order = await _orderRepo.Query(o => o.Id == id)
            .Include(o => o.Items)
            .Include(o => o.DispenseRecords)
            .FirstOrDefaultAsync(ct);

        return order ?? throw new NotFoundException($"Prescription order with ID '{id}' was not found.");
    }

    private static void EnsureAwaitingReview(PrescriptionOrder order)
    {
        if (order.Status != PrescriptionStatus.Pending)
        {
            throw new PharmacyConflictException(
                PharmacyErrorCodes.InvalidState,
                $"Prescription '{order.PrescriptionNumber}' is {order.Status} and can no longer be reviewed.");
        }
    }

    /// <summary>Prices the accepted items from this pharmacy's inventory and stores the quote.</summary>
    private async Task QuoteAsync(PrescriptionOrder order, IEnumerable<PrescriptionOrderItem> accepted, CancellationToken ct)
    {
        var total = 0m;
        foreach (var item in accepted)
        {
            var searchName = item.GenericName.ToLower();
            var inventoryItem = await _inventoryRepo.Query(i =>
                    (item.InventoryItemId.HasValue && i.Id == item.InventoryItemId.Value) ||
                    i.GenericName.ToLower().Contains(searchName))
                .FirstOrDefaultAsync(ct);

            if (inventoryItem is not null)
            {
                item.InventoryItemId = inventoryItem.Id;
                item.UnitPrice = inventoryItem.UnitPrice;
            }

            item.Subtotal = item.UnitPrice * item.QuantityPrescribed;
            item.UpdatedAt = DateTime.UtcNow;
            item.UpdatedBy = Actor();
            total += item.Subtotal;
        }

        order.QuotedAmount = total;
        order.TotalAmount = total;
    }

    private void RequestInvoiceIfRequired(PrescriptionOrder order)
    {
        if (order.PaymentPolicy == PharmacyPaymentPolicy.None)
        {
            return;
        }

        order.PaymentStatus = PrescriptionPaymentStatus.AwaitingPayment;
        _billingPublisher.EnqueueInvoiceRequest(order);
    }

    private void Touch(PrescriptionOrder order)
    {
        order.ReviewedAt = DateTime.UtcNow;
        order.UpdatedAt = DateTime.UtcNow;
        order.UpdatedBy = Actor();
        _orderRepo.Update(order);
    }

    private string Actor() => _pharmacyContext.StaffId?.ToString() ?? "system";
}
