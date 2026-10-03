using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Pharmacy.Application.Features.Gamot.DTOs;
using ClinicEz.Pharmacy.Domain.Entities;
using ClinicEz.Pharmacy.Domain.Enums;
using ClinicEz.Pharmacy.Domain.Interfaces;
using ClinicEz.Pharmacy.Domain.Services;
using ClinicEz.Shared.Common;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Pharmacy.Application.Features.Gamot.Queries;

public sealed record ValidateUpscQuery(
    string UniquePrescriptionSecurityCode,
    string? HciAccreditationNumber = null,
    string? PhilHealthIdentificationNumber = null,
    string? PrescriptionNumber = null,
    string? DoctorPrcLicense = null,
    string? DrugCode = null,
    int? Quantity = null,
    DateTime? IssueDate = null) : IRequest<ApiResponse<UpscVerifyResultDto>>;

public sealed class ValidateUpscQueryValidator : AbstractValidator<ValidateUpscQuery>
{
    public ValidateUpscQueryValidator()
    {
        RuleFor(x => x.UniquePrescriptionSecurityCode)
            .NotEmpty().WithMessage("UniquePrescriptionSecurityCode is required.");
    }
}

public sealed class ValidateUpscQueryHandler : IRequestHandler<ValidateUpscQuery, ApiResponse<UpscVerifyResultDto>>
{
    private readonly IUpscSecurityService _upscService;
    private readonly IRepository<GamotBeneficiaryLedger> _ledgerRepo;

    public ValidateUpscQueryHandler(
        IUpscSecurityService upscService,
        IRepository<GamotBeneficiaryLedger> ledgerRepo)
    {
        _upscService = upscService;
        _ledgerRepo = ledgerRepo;
    }

    public async Task<ApiResponse<UpscVerifyResultDto>> Handle(
        ValidateUpscQuery request,
        CancellationToken cancellationToken)
    {
        var upsc = request.UniquePrescriptionSecurityCode.Trim();

        // 1. Structural and Modulus-11 checksum verification
        if (!_upscService.VerifyChecksum(upsc))
        {
            var invalidChecksumResult = new UpscVerifyResultDto(
                IsValid: false,
                FailureReason: "Invalid or tampered Modulus-11 checksum.",
                UniquePrescriptionSecurityCode: upsc);

            return ApiResponse<UpscVerifyResultDto>.Success(invalidChecksumResult);
        }

        // 2. Check duplicate / already-dispensed state in GAMOT ledger
        var alreadyDispensed = await _ledgerRepo.Query(l => l.Transactions.Any(t => t.UniquePrescriptionSecurityCode == upsc && t.Status == GamotTransactionStatus.Dispensed))
            .SelectMany(l => l.Transactions)
            .Where(t => t.UniquePrescriptionSecurityCode == upsc && t.Status == GamotTransactionStatus.Dispensed)
            .FirstOrDefaultAsync(cancellationToken);

        if (alreadyDispensed != null)
        {
            var alreadyDispensedResult = new UpscVerifyResultDto(
                IsValid: false,
                FailureReason: $"UPSC has already been dispensed on {alreadyDispensed.TransactionDate:yyyy-MM-dd HH:mm:ss} for Prescription '{alreadyDispensed.PrescriptionNumber}'.",
                UniquePrescriptionSecurityCode: upsc);

            return ApiResponse<UpscVerifyResultDto>.Success(alreadyDispensedResult);
        }

        // 3. Optional deep signature validation when prescription context is provided
        if (!string.IsNullOrWhiteSpace(request.PhilHealthIdentificationNumber) &&
            !string.IsNullOrWhiteSpace(request.PrescriptionNumber) &&
            !string.IsNullOrWhiteSpace(request.DoctorPrcLicense) &&
            !string.IsNullOrWhiteSpace(request.DrugCode) &&
            request.Quantity.HasValue &&
            request.IssueDate.HasValue)
        {
            var parts = upsc.Split('-');
            var hci = !string.IsNullOrWhiteSpace(request.HciAccreditationNumber)
                ? request.HciAccreditationNumber
                : (parts.Length > 1 ? parts[1] : "00000");

            var isSignatureValid = _upscService.ValidateUpsc(
                upsc,
                hci,
                request.PhilHealthIdentificationNumber,
                request.PrescriptionNumber,
                request.DoctorPrcLicense,
                request.DrugCode,
                request.Quantity.Value,
                request.IssueDate.Value);

            if (!isSignatureValid)
            {
                var signatureMismatchResult = new UpscVerifyResultDto(
                    IsValid: false,
                    FailureReason: "Cryptographic HMAC signature does not match the prescription details provided.",
                    UniquePrescriptionSecurityCode: upsc);

                return ApiResponse<UpscVerifyResultDto>.Success(signatureMismatchResult);
            }
        }

        var validResult = new UpscVerifyResultDto(
            IsValid: true,
            FailureReason: null,
            UniquePrescriptionSecurityCode: upsc);

        return ApiResponse<UpscVerifyResultDto>.Success(validResult, "UPSC is valid, authentic, and eligible for PhilHealth GAMOT dispensing.");
    }
}
