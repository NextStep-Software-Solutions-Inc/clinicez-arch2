using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Pharmacy.Api.Authorization;
using ClinicEz.Pharmacy.Application.Features.Settings;
using ClinicEz.Pharmacy.Domain.Constants;
using ClinicEz.Pharmacy.Domain.Enums;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Exceptions;
using MediatR;
using Microsoft.AspNetCore.Mvc;

namespace ClinicEz.Pharmacy.Api.Controllers;

[ApiController]
[Route("api/v1/settings")]
public sealed class SettingsController : ControllerBase
{
    private readonly ISender _sender;

    public SettingsController(ISender sender)
    {
        _sender = sender;
    }

    [HttpGet]
    [HasPermission(PharmacyPermissions.PrescriptionsRead)]
    public async Task<ActionResult<ApiResponse<PharmacySettingsDto>>> Get(CancellationToken ct = default)
    {
        var result = await _sender.Send(new GetPharmacySettingsQuery(), ct);
        return Ok(ApiResponse<PharmacySettingsDto>.Success(result));
    }

    [HttpPut("payment-policy")]
    [HasPermission(PharmacyPermissions.StaffManage)]
    public async Task<ActionResult<ApiResponse<PharmacySettingsDto>>> UpdatePaymentPolicy(
        [FromBody] UpdatePaymentPolicyApiRequest request,
        CancellationToken ct = default)
    {
        if (!Enum.TryParse<PharmacyPaymentPolicy>(request.PaymentPolicy, ignoreCase: true, out var policy)
            || !Enum.IsDefined(policy))
        {
            throw new BadRequestException("PaymentPolicy must be one of: Prepaid, Postpaid, None.");
        }

        var result = await _sender.Send(new UpdatePaymentPolicyCommand(policy), ct);
        return Ok(ApiResponse<PharmacySettingsDto>.Success(result, "Payment policy updated. It applies to prescriptions received from now on."));
    }
}

public record UpdatePaymentPolicyApiRequest
{
    public string? PaymentPolicy { get; init; }
}
