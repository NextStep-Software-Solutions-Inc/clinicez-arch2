using System.Threading;
using System.Threading.Tasks;
using ClinicEz.PhilHealthProxy.Application.Common;
using ClinicEz.PhilHealthProxy.Domain.Interfaces;
using ClinicEz.PhilHealthProxy.Domain.Models;
using FluentValidation;
using MediatR;

namespace ClinicEz.PhilHealthProxy.Application.Features.VerificationCode.Commands;

public sealed record ValidateVerificationCodeCommand(VerificationCodeRequest Request) : IRequest<VerificationCodeResponse>;

public sealed class ValidateVerificationCodeCommandValidator : AbstractValidator<ValidateVerificationCodeCommand>
{
    public ValidateVerificationCodeCommandValidator()
    {
        RuleFor(x => x.Request.PatientPin).NotEmpty().WithMessage("Patient PIN is required.");
        RuleFor(x => x.Request.OneTimePin).NotEmpty().WithMessage("One-time PIN is required.");
        RuleFor(x => x.Request.TransactionDate).NotEmpty().WithMessage("Transaction date is required.");
    }
}

public sealed class ValidateVerificationCodeCommandHandler(
    ICurrentTenant currentTenant,
    ITenantRepository tenantRepo,
    IPhilHealthPcapiClient pcapiClient)
    : IRequestHandler<ValidateVerificationCodeCommand, VerificationCodeResponse>
{
    public async Task<VerificationCodeResponse> Handle(ValidateVerificationCodeCommand command, CancellationToken ct)
    {
        var tenant = await TenantResolutionHelper.ResolveTenantAsync(currentTenant, tenantRepo, ct);
        return await pcapiClient.ValidateVerificationCodeAsync(command.Request, tenant, ct);
    }
}
