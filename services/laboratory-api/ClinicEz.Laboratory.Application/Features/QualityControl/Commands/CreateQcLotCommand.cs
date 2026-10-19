using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Laboratory.Application.Features.Requisitions.DTOs;
using ClinicEz.Laboratory.Domain.Entities;
using ClinicEz.Laboratory.Domain.Enums;
using ClinicEz.Laboratory.Domain.Interfaces;
using MediatR;

namespace ClinicEz.Laboratory.Application.Features.QualityControl.Commands;

public record CreateQcLotCommand(
    string TenantId,
    string LotNumber,
    string ControlName,
    ControlLevel Level,
    string AnalyteCode,
    string InstrumentName,
    double TargetMean,
    double TargetStandardDeviation,
    DateTime ManufacturerExpirationDate,
    DateTime? OpenVialDate = null,
    int OpenVialStabilityDays = 30
) : IRequest<QcLotDto>;

public class CreateQcLotCommandHandler : IRequestHandler<CreateQcLotCommand, QcLotDto>
{
    private readonly IRepository<QcLot> _lotRepository;
    private readonly IUnitOfWork _unitOfWork;

    public CreateQcLotCommandHandler(IRepository<QcLot> lotRepository, IUnitOfWork unitOfWork)
    {
        _lotRepository = lotRepository;
        _unitOfWork = unitOfWork;
    }

    public async Task<QcLotDto> Handle(CreateQcLotCommand request, CancellationToken cancellationToken)
    {
        var lot = new QcLot
        {
            TenantId = !string.IsNullOrWhiteSpace(request.TenantId) ? request.TenantId : "default",
            LotNumber = request.LotNumber.Trim().ToUpperInvariant(),
            ControlName = request.ControlName.Trim(),
            Level = request.Level,
            AnalyteCode = request.AnalyteCode.Trim().ToUpperInvariant(),
            InstrumentName = request.InstrumentName.Trim(),
            TargetMean = request.TargetMean,
            TargetStandardDeviation = request.TargetStandardDeviation,
            ManufacturerExpirationDate = request.ManufacturerExpirationDate,
            OpenVialDate = request.OpenVialDate,
            OpenVialStabilityDays = request.OpenVialStabilityDays,
            IsActive = true
        };

        await _lotRepository.AddAsync(lot, cancellationToken);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        var now = DateTime.UtcNow;
        var openExpiry = lot.GetOpenVialExpirationDate();
        var isExp = lot.IsExpired(now);
        int? daysRemaining = null;
        if (openExpiry.HasValue)
        {
            daysRemaining = Math.Max(0, (int)(openExpiry.Value - now).TotalDays);
        }

        return new QcLotDto
        {
            Id = lot.Id,
            TenantId = lot.TenantId,
            LotNumber = lot.LotNumber,
            ControlName = lot.ControlName,
            Level = lot.Level.ToString(),
            AnalyteCode = lot.AnalyteCode,
            InstrumentName = lot.InstrumentName,
            TargetMean = lot.TargetMean,
            TargetStandardDeviation = lot.TargetStandardDeviation,
            ManufacturerExpirationDate = lot.ManufacturerExpirationDate,
            OpenVialDate = lot.OpenVialDate,
            OpenVialStabilityDays = lot.OpenVialStabilityDays,
            OpenVialExpirationDate = openExpiry,
            IsExpired = isExp,
            DaysRemaining = daysRemaining,
            IsActive = lot.IsActive
        };
    }
}
