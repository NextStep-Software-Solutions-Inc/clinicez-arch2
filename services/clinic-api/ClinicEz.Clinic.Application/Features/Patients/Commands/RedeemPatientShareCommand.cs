using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.Patients.DTOs;
using ClinicEz.Clinic.Domain.Interfaces;
using FluentValidation;
using MediatR;

namespace ClinicEz.Clinic.Application.Features.Patients.Commands;

/// <summary>Starts a scan-to-fetch import. The patient plane answers asynchronously; the caller polls the returned id.</summary>
public sealed record RedeemPatientShareCommand(
    string ShareToken,
    string? Purpose = null,
    bool AddToQueue = false,
    string? ChiefComplaint = null) : IRequest<PatientShareRedeemAccepted>;

public sealed class RedeemPatientShareCommandValidator : AbstractValidator<RedeemPatientShareCommand>
{
    public RedeemPatientShareCommandValidator()
    {
        RuleFor(x => x.ShareToken).NotEmpty().MaximumLength(2048);
        RuleFor(x => x.Purpose).MaximumLength(100);
        RuleFor(x => x.ChiefComplaint).MaximumLength(500);
    }
}

public sealed class RedeemPatientShareCommandHandler : IRequestHandler<RedeemPatientShareCommand, PatientShareRedeemAccepted>
{
    private const string DefaultPurpose = "Consultation";

    private readonly IPatientRecordGateway _gateway;
    private readonly IUnitOfWork _unitOfWork;

    public RedeemPatientShareCommandHandler(IPatientRecordGateway gateway, IUnitOfWork unitOfWork)
    {
        _gateway = gateway;
        _unitOfWork = unitOfWork;
    }

    public async Task<PatientShareRedeemAccepted> Handle(RedeemPatientShareCommand request, CancellationToken cancellationToken)
    {
        var purpose = string.IsNullOrWhiteSpace(request.Purpose) ? DefaultPurpose : request.Purpose.Trim();
        var chiefComplaint = string.IsNullOrWhiteSpace(request.ChiefComplaint) ? null : request.ChiefComplaint.Trim();

        var requestId = await _gateway.RequestRedeemAsync(
            request.ShareToken.Trim(), purpose, request.AddToQueue, chiefComplaint, cancellationToken);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        return new PatientShareRedeemAccepted(requestId);
    }
}
