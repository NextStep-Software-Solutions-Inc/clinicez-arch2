using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Pharmacy.Application.Features.Gamot.DTOs;
using ClinicEz.Pharmacy.Domain.Entities;
using ClinicEz.Pharmacy.Domain.Interfaces;
using ClinicEz.Shared.Common;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Pharmacy.Application.Features.Gamot.Queries;

public sealed record GetGamotLedgerByPinQuery(
    string PhilHealthIdentificationNumber,
    string? BenefitYear = null) : IRequest<ApiResponse<GamotBeneficiaryLedgerDto>>;

public sealed class GetGamotLedgerByPinQueryValidator : AbstractValidator<GetGamotLedgerByPinQuery>
{
    public GetGamotLedgerByPinQueryValidator()
    {
        RuleFor(x => x.PhilHealthIdentificationNumber)
            .NotEmpty().WithMessage("PhilHealth Identification Number (PIN) is required.")
            .MinimumLength(9).WithMessage("PhilHealth Identification Number must be at least 9 characters.");
    }
}

public sealed class GetGamotLedgerByPinQueryHandler : IRequestHandler<GetGamotLedgerByPinQuery, ApiResponse<GamotBeneficiaryLedgerDto>>
{
    private readonly IRepository<GamotBeneficiaryLedger> _ledgerRepo;
    private readonly IRepository<PrescriptionOrder> _orderRepo;

    public GetGamotLedgerByPinQueryHandler(
        IRepository<GamotBeneficiaryLedger> ledgerRepo,
        IRepository<PrescriptionOrder> orderRepo)
    {
        _ledgerRepo = ledgerRepo;
        _orderRepo = orderRepo;
    }

    public async Task<ApiResponse<GamotBeneficiaryLedgerDto>> Handle(
        GetGamotLedgerByPinQuery request,
        CancellationToken cancellationToken)
    {
        var pin = new string(request.PhilHealthIdentificationNumber.Where(char.IsDigit).ToArray()).PadLeft(12, '0');
        var year = !string.IsNullOrWhiteSpace(request.BenefitYear) ? request.BenefitYear : DateTime.UtcNow.Year.ToString();

        var ledger = await _ledgerRepo.Query(l => l.PhilHealthIdentificationNumber == pin && l.BenefitYear == year)
            .Include(l => l.Transactions)
            .FirstOrDefaultAsync(cancellationToken);

        if (ledger == null)
        {
            // Lookup patient name from previous prescription if available
            var patientName = await _orderRepo.Query(o => o.PhilHealthIdentificationNumber == pin)
                .OrderByDescending(o => o.IssuedAt)
                .Select(o => o.PatientName)
                .FirstOrDefaultAsync(cancellationToken) ?? "Eligible PhilHealth Beneficiary";

            var defaultDto = new GamotBeneficiaryLedgerDto(
                Id: Guid.Empty,
                PatientName: patientName,
                PhilHealthIdentificationNumber: pin,
                MemberPhilHealthIdentificationNumber: null,
                BenefitYear: year,
                AnnualAllocation: GamotBeneficiaryLedger.DefaultAnnualAllocation,
                TotalAmountUtilized: 0.00m,
                RemainingBalance: GamotBeneficiaryLedger.DefaultAnnualAllocation,
                Transactions: Array.Empty<GamotLedgerTransactionDto>());

            return ApiResponse<GamotBeneficiaryLedgerDto>.Success(defaultDto, "Beneficiary has an available annual GAMOT benefit allocation of PHP 9,000.00.");
        }

        var transactionDtos = ledger.Transactions
            .OrderByDescending(t => t.TransactionDate)
            .Select(t => new GamotLedgerTransactionDto(
                t.Id,
                t.PrescriptionOrderId,
                t.PrescriptionOrderItemId,
                t.PrescriptionNumber,
                t.TransactionDate,
                t.PhilHealthDrugCode,
                t.GenericName,
                t.BrandName,
                t.QuantityDispensed,
                t.PhilHealthReferencePrice,
                t.TotalGamotAmount,
                t.PatientCoPay,
                t.UniquePrescriptionSecurityCode,
                t.DispensingPharmacistName,
                t.DispensingPharmacistPrc,
                t.HciAccreditationNumber,
                t.Status,
                t.Notes))
            .ToList();

        var dto = new GamotBeneficiaryLedgerDto(
            Id: ledger.Id,
            PatientName: ledger.PatientName,
            PhilHealthIdentificationNumber: ledger.PhilHealthIdentificationNumber,
            MemberPhilHealthIdentificationNumber: ledger.MemberPhilHealthIdentificationNumber,
            BenefitYear: ledger.BenefitYear,
            AnnualAllocation: ledger.AnnualAllocation,
            TotalAmountUtilized: ledger.TotalAmountUtilized,
            RemainingBalance: ledger.RemainingBalance,
            Transactions: transactionDtos);

        return ApiResponse<GamotBeneficiaryLedgerDto>.Success(dto);
    }
}
