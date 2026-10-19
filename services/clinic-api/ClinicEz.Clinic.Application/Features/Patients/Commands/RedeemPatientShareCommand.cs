using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.Patients.DTOs;
using ClinicEz.Clinic.Domain.Interfaces;
using FluentValidation;
using MediatR;

namespace ClinicEz.Clinic.Application.Features.Patients.Commands;

/// <summary>
/// Starts a scan-to-fetch import from a scanned <see cref="ShareToken"/> or, when the patient reads out a one-time code, from
/// their <see cref="ClinicEzId"/> and <see cref="Code"/>. The patient plane answers asynchronously; the caller polls the returned id.
/// </summary>
public sealed record RedeemPatientShareCommand(
    string? ShareToken,
    string? Purpose = null,
    bool AddToQueue = false,
    string? ChiefComplaint = null,
    string? ClinicEzId = null,
    string? Code = null) : IRequest<PatientShareRedeemAccepted>;

public sealed class RedeemPatientShareCommandValidator : AbstractValidator<RedeemPatientShareCommand>
{
    private const int MinCodeLength = 6;
    private const int MaxCodeLength = 16;

    private static bool HasText(string? value) => !string.IsNullOrWhiteSpace(value);
    private static bool HasToken(RedeemPatientShareCommand x) => HasText(x.ShareToken);
    private static bool HasCode(RedeemPatientShareCommand x) => HasText(x.ClinicEzId) || HasText(x.Code);
    private static int NormalizedCodeLength(string? code) => (code ?? string.Empty).Count(char.IsLetterOrDigit);

    public RedeemPatientShareCommandValidator()
    {
        RuleFor(x => x.ShareToken).MaximumLength(2048);
        RuleFor(x => x.ClinicEzId).MaximumLength(40);
        RuleFor(x => x.Code).MaximumLength(32).Matches("^[A-Za-z0-9 -]*$").WithMessage("The code has letters and digits only.");
        RuleFor(x => x)
            .Must(x => HasToken(x) != HasCode(x) && (HasToken(x) || (HasText(x.ClinicEzId) && NormalizedCodeLength(x.Code) is >= MinCodeLength and <= MaxCodeLength)))
            .WithName("ShareToken")
            .WithMessage("Provide either a scanned share token, or the patient's Clinic EZ ID with their one-time code.");
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

        var clinicEzId = string.IsNullOrWhiteSpace(request.ClinicEzId) ? null : request.ClinicEzId.Trim();
        var code = string.IsNullOrWhiteSpace(request.Code) ? null : request.Code.Trim();
        var hasCode = !string.IsNullOrWhiteSpace(clinicEzId) || !string.IsNullOrWhiteSpace(code);
        var shareToken = hasCode ? string.Empty : (request.ShareToken?.Trim() ?? string.Empty);

        var requestId = await _gateway.RequestRedeemAsync(
            new PatientShareRedeemInput(
                shareToken,
                clinicEzId,
                code,
                purpose,
                request.AddToQueue,
                chiefComplaint),
            cancellationToken);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        return new PatientShareRedeemAccepted(requestId);
    }
}
