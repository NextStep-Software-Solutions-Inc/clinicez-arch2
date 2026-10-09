using ClinicEz.Pharmacy.Domain.Entities;
using ClinicEz.Pharmacy.Domain.Enums;
using ClinicEz.Pharmacy.Domain.Interfaces;
using ClinicEz.Shared.Exceptions;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Pharmacy.Application.Features.Settings;

public record PharmacySettingsDto(string PharmacyName, string PaymentPolicy);

public record GetPharmacySettingsQuery : IRequest<PharmacySettingsDto>;

/// <summary>Changes the policy applied to prescriptions received from now on; orders already received keep the policy they arrived under.</summary>
public record UpdatePaymentPolicyCommand(PharmacyPaymentPolicy PaymentPolicy) : IRequest<PharmacySettingsDto>;

public class UpdatePaymentPolicyCommandValidator : AbstractValidator<UpdatePaymentPolicyCommand>
{
    public UpdatePaymentPolicyCommandValidator()
    {
        RuleFor(x => x.PaymentPolicy).IsInEnum();
    }
}

public class PharmacySettingsHandler :
    IRequestHandler<GetPharmacySettingsQuery, PharmacySettingsDto>,
    IRequestHandler<UpdatePaymentPolicyCommand, PharmacySettingsDto>
{
    private readonly IRepository<PharmacySettings> _settingsRepo;
    private readonly IUnitOfWork _unitOfWork;

    public PharmacySettingsHandler(IRepository<PharmacySettings> settingsRepo, IUnitOfWork unitOfWork)
    {
        _settingsRepo = settingsRepo;
        _unitOfWork = unitOfWork;
    }

    public async Task<PharmacySettingsDto> Handle(GetPharmacySettingsQuery request, CancellationToken cancellationToken)
    {
        var settings = await LoadAsync(cancellationToken);
        return ToDto(settings);
    }

    public async Task<PharmacySettingsDto> Handle(UpdatePaymentPolicyCommand request, CancellationToken cancellationToken)
    {
        var settings = await LoadAsync(cancellationToken);
        settings.PaymentPolicy = request.PaymentPolicy;
        settings.UpdatedAt = DateTime.UtcNow;
        _settingsRepo.Update(settings);
        await _unitOfWork.SaveChangesAsync(cancellationToken);
        return ToDto(settings);
    }

    private async Task<PharmacySettings> LoadAsync(CancellationToken ct) =>
        await _settingsRepo.Query().FirstOrDefaultAsync(ct)
        ?? throw new NotFoundException("This pharmacy has not been provisioned yet.");

    private static PharmacySettingsDto ToDto(PharmacySettings settings) =>
        new(settings.PharmacyName, settings.PaymentPolicy.ToString());
}
