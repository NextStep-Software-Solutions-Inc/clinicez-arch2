using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Pharmacy.Application.Features.Gamot.DTOs;
using ClinicEz.Pharmacy.Domain.Entities;
using ClinicEz.Pharmacy.Domain.Enums;
using ClinicEz.Pharmacy.Domain.Interfaces;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Exceptions;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Pharmacy.Application.Features.Gamot.Commands;

public sealed record ReverseGamotTransactionCommand(
    Guid TransactionId,
    string Reason,
    string ReversedBy) : IRequest<ApiResponse<GamotLedgerTransactionDto>>;

public sealed class ReverseGamotTransactionCommandValidator : AbstractValidator<ReverseGamotTransactionCommand>
{
    public ReverseGamotTransactionCommandValidator()
    {
        RuleFor(x => x.TransactionId).NotEmpty().WithMessage("TransactionId is required.");
        RuleFor(x => x.Reason).NotEmpty().MaximumLength(500).WithMessage("Reason is required and cannot exceed 500 characters.");
        RuleFor(x => x.ReversedBy).NotEmpty().MaximumLength(255).WithMessage("ReversedBy is required and cannot exceed 255 characters.");
    }
}

public sealed class ReverseGamotTransactionCommandHandler : IRequestHandler<ReverseGamotTransactionCommand, ApiResponse<GamotLedgerTransactionDto>>
{
    private readonly IRepository<GamotBeneficiaryLedger> _ledgerRepo;
    private readonly IRepository<PrescriptionOrder> _orderRepo;
    private readonly IUnitOfWork _unitOfWork;

    public ReverseGamotTransactionCommandHandler(
        IRepository<GamotBeneficiaryLedger> ledgerRepo,
        IRepository<PrescriptionOrder> orderRepo,
        IUnitOfWork unitOfWork)
    {
        _ledgerRepo = ledgerRepo;
        _orderRepo = orderRepo;
        _unitOfWork = unitOfWork;
    }

    public async Task<ApiResponse<GamotLedgerTransactionDto>> Handle(
        ReverseGamotTransactionCommand request,
        CancellationToken cancellationToken)
    {
        var ledger = await _ledgerRepo.Query(l => l.Transactions.Any(t => t.Id == request.TransactionId))
            .Include(l => l.Transactions)
            .FirstOrDefaultAsync(cancellationToken);

        if (ledger == null)
        {
            throw new NotFoundException($"GAMOT transaction with ID '{request.TransactionId}' was not found.");
        }

        var txn = ledger.Transactions.First(t => t.Id == request.TransactionId);
        if (txn.Status == GamotTransactionStatus.Reversed)
        {
            throw new BadRequestException("GAMOT transaction has already been reversed.");
        }

        // 1. Perform domain reversal on beneficiary ledger
        ledger.ReverseTransaction(request.TransactionId, $"{request.Reason} (Reversed by: {request.ReversedBy})");

        // 2. Adjust linked prescription order if present
        if (txn.PrescriptionOrderId != Guid.Empty)
        {
            var order = await _orderRepo.Query(o => o.Id == txn.PrescriptionOrderId)
                .Include(o => o.Items)
                .FirstOrDefaultAsync(cancellationToken);

            if (order != null)
            {
                if (txn.PrescriptionOrderItemId.HasValue)
                {
                    var item = order.Items.FirstOrDefault(i => i.Id == txn.PrescriptionOrderItemId.Value);
                    if (item != null)
                    {
                        item.Status = ItemDispenseStatus.Pending;
                        item.QuantityDispensed = 0;
                    }
                }

                order.GamotCoverageAmount = Math.Max(0.00m, order.GamotCoverageAmount - txn.TotalGamotAmount);
                order.PatientCoPayAmount = Math.Max(0.00m, order.TotalAmount - order.GamotCoverageAmount);

                if (order.Items.All(i => i.Status == ItemDispenseStatus.Pending))
                {
                    order.Status = PrescriptionStatus.Pending;
                    order.DispensedAt = null;
                    order.DispensingPharmacistName = null;
                    order.DispensingPharmacistPrc = null;
                }
            }
        }

        await _unitOfWork.SaveChangesAsync(cancellationToken);

        var dto = new GamotLedgerTransactionDto(
            Id: txn.Id,
            PrescriptionOrderId: txn.PrescriptionOrderId,
            PrescriptionOrderItemId: txn.PrescriptionOrderItemId,
            PrescriptionNumber: txn.PrescriptionNumber,
            TransactionDate: txn.TransactionDate,
            PhilHealthDrugCode: txn.PhilHealthDrugCode,
            GenericName: txn.GenericName,
            BrandName: txn.BrandName,
            QuantityDispensed: txn.QuantityDispensed,
            PhilHealthReferencePrice: txn.PhilHealthReferencePrice,
            TotalGamotAmount: txn.TotalGamotAmount,
            PatientCoPay: txn.PatientCoPay,
            UniquePrescriptionSecurityCode: txn.UniquePrescriptionSecurityCode,
            DispensingPharmacistName: txn.DispensingPharmacistName,
            DispensingPharmacistPrc: txn.DispensingPharmacistPrc,
            HciAccreditationNumber: txn.HciAccreditationNumber,
            Status: txn.Status,
            Notes: txn.Notes);

        return ApiResponse<GamotLedgerTransactionDto>.Success(dto, "GAMOT transaction successfully reversed and benefit restored.");
    }
}
