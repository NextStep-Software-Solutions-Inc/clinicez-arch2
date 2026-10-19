using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Pharmacy.Application.Features.Gamot.DTOs;
using ClinicEz.Pharmacy.Domain.Entities;
using ClinicEz.Pharmacy.Domain.Interfaces;
using ClinicEz.Pharmacy.Domain.Services;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Exceptions;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Pharmacy.Application.Features.Gamot.Commands;

public sealed record GenerateUpscCommand(
    Guid PrescriptionOrderId,
    Guid PrescriptionOrderItemId,
    string HciAccreditationNumber) : IRequest<ApiResponse<UpscGenerateResultDto>>;

public sealed class GenerateUpscCommandValidator : AbstractValidator<GenerateUpscCommand>
{
    public GenerateUpscCommandValidator()
    {
        RuleFor(x => x.PrescriptionOrderId).NotEmpty().WithMessage("PrescriptionOrderId is required.");
        RuleFor(x => x.PrescriptionOrderItemId).NotEmpty().WithMessage("PrescriptionOrderItemId is required.");
        RuleFor(x => x.HciAccreditationNumber).NotEmpty().WithMessage("HciAccreditationNumber is required.");
    }
}

public sealed class GenerateUpscCommandHandler : IRequestHandler<GenerateUpscCommand, ApiResponse<UpscGenerateResultDto>>
{
    private readonly IRepository<PrescriptionOrder> _orderRepo;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IUpscSecurityService _upscService;
    private readonly IGamotFormularyService _formularyService;

    public GenerateUpscCommandHandler(
        IRepository<PrescriptionOrder> orderRepo,
        IUnitOfWork unitOfWork,
        IUpscSecurityService upscService,
        IGamotFormularyService formularyService)
    {
        _orderRepo = orderRepo;
        _unitOfWork = unitOfWork;
        _upscService = upscService;
        _formularyService = formularyService;
    }

    public async Task<ApiResponse<UpscGenerateResultDto>> Handle(
        GenerateUpscCommand request,
        CancellationToken cancellationToken)
    {
        var order = await _orderRepo.Query(o => o.Id == request.PrescriptionOrderId)
            .Include(o => o.Items)
            .FirstOrDefaultAsync(cancellationToken);

        if (order == null)
        {
            throw new NotFoundException($"Prescription order with ID '{request.PrescriptionOrderId}' was not found.");
        }

        var item = order.Items.FirstOrDefault(i => i.Id == request.PrescriptionOrderItemId);
        if (item == null)
        {
            throw new NotFoundException($"Prescription order item with ID '{request.PrescriptionOrderItemId}' was not found.");
        }

        var formularyMatch = _formularyService.MatchByGenericName(item.GenericName, item.Dosage);
        var drugCode = formularyMatch?.DrugCode ?? FormatFallbackDrugCode(item.GenericName);
        var refPrice = formularyMatch?.ReferenceUnitPrice ?? item.UnitPrice;

        var patientPin = !string.IsNullOrWhiteSpace(order.PhilHealthIdentificationNumber)
            ? order.PhilHealthIdentificationNumber
            : "000000000000";

        var upsc = _upscService.GenerateUpsc(
            hciAccreditationNumber: request.HciAccreditationNumber,
            patientPin: patientPin,
            prescriptionNumber: order.PrescriptionNumber,
            doctorPrcLicense: order.DoctorPrcLicense,
            drugCode: drugCode,
            quantity: item.QuantityPrescribed,
            issueDate: order.IssuedAt);

        item.UniquePrescriptionSecurityCode = upsc;
        item.PhilHealthDrugCode = drugCode;
        item.IsGamotCovered = true;
        item.GamotReferencePrice = refPrice;

        order.IsPhilHealthGamot = true;

        await _unitOfWork.SaveChangesAsync(cancellationToken);

        var dto = new UpscGenerateResultDto(
            UniquePrescriptionSecurityCode: upsc,
            PrescriptionNumber: order.PrescriptionNumber,
            DrugCode: drugCode,
            GeneratedAt: DateTime.UtcNow);

        return ApiResponse<UpscGenerateResultDto>.Success(dto, "UPSC generated and attached to prescription item.");
    }

    private static string FormatFallbackDrugCode(string genericName)
    {
        var clean = new string(genericName.Where(char.IsLetterOrDigit).ToArray()).ToUpperInvariant();
        if (clean.Length >= 30) return clean[..30];
        return clean.PadRight(30, '0');
    }
}
