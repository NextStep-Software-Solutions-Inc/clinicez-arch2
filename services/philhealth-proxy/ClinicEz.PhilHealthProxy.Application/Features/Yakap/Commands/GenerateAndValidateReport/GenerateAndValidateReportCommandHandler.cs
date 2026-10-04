using ClinicEz.PhilHealthProxy.Domain.Entities;
using ClinicEz.PhilHealthProxy.Domain.Interfaces;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Exceptions;
using MediatR;
using Microsoft.AspNetCore.DataProtection;

namespace ClinicEz.PhilHealthProxy.Application.Features.Yakap.Commands.GenerateAndValidateReport;

public sealed class GenerateAndValidateReportCommandHandler(
    ICurrentTenant currentTenant,
    ITenantRepository tenantRepository,
    IDataProtectionProvider dataProtectionProvider,
    IKonsultaXmlGenerator xmlGenerator,
    IKonsultaXmlValidator xmlValidator,
    IPhilHealthPayloadEncryptor encryptor,
    IPhilHealthSoapClient soapClient)
    : IRequestHandler<GenerateAndValidateReportCommand, ApiResponse<YakapValidationResponse>>
{
    private readonly IDataProtector _protector =
        dataProtectionProvider.CreateProtector("ClinicEz.PhilHealthProxy.TenantCredentials");

    public async Task<ApiResponse<YakapValidationResponse>> Handle(
        GenerateAndValidateReportCommand request,
        CancellationToken cancellationToken)
    {
        if (currentTenant.TenantId is null && currentTenant.BranchId is null)
            throw new UnauthorizedException("Tenant or Branch could not be resolved from the request.");

        PhilHealthTenant? tenant = null;
        if (currentTenant.BranchId.HasValue)
        {
            tenant = await tenantRepository.GetByBranchIdAsync(currentTenant.BranchId.Value, cancellationToken);
        }

        if (tenant is null && currentTenant.TenantId.HasValue)
        {
            tenant = await tenantRepository.GetByTenantIdAsync(currentTenant.TenantId.Value, cancellationToken);
        }

        if (tenant is null)
            throw new NotFoundException("PhilHealth configuration not found for tenant or branch.");

        string cipherKey = _protector.Unprotect(tenant.EncryptedCipherKey);

        // 1. Generate XML conforming to DTD v1.14
        string rawXml = request.ReportTagging == "1"
            ? xmlGenerator.GenerateTranche1Xml(request.Document)
            : xmlGenerator.GenerateTranche2Xml(request.Document);

        // 2. Pre-flight DTD Schema Validation
        var validation = xmlValidator.ValidateReportXml(rawXml);
        if (!validation.IsValid)
        {
            var errors = validation.Errors.Select(e => $"Line {e.LineNumber}:{e.LinePosition} - {e.Message}").ToList();
            return ApiResponse<YakapValidationResponse>.Success(
                new YakapValidationResponse(
                    IsValid: false,
                    TransmittalNumber: request.Document.HciTransmittalNumber,
                    RawXml: rawXml,
                    EncryptedPayload: null,
                    PhilHealthSoapResponse: null,
                    ValidationErrors: errors));
        }

        // 3. Encrypt payload per Annex D
        string encryptedJson = encryptor.EncryptPayload(rawXml, cipherKey);

        // 4. Submit to PhilHealth SOAP validateReport service
        var soapResult = await soapClient.ValidateReportAsync(
            request.ReportTagging,
            encryptedJson,
            cancellationToken);

        if (!soapResult.IsSuccess)
        {
            throw new ServiceUnavailableException(
                $"PhilHealth SOAP service returned an error: [{soapResult.ErrorCode}] {soapResult.ErrorMessage}");
        }

        return ApiResponse<YakapValidationResponse>.Success(
            new YakapValidationResponse(
                IsValid: true,
                TransmittalNumber: request.Document.HciTransmittalNumber,
                RawXml: rawXml,
                EncryptedPayload: encryptedJson,
                PhilHealthSoapResponse: soapResult.ResponseXml,
                ValidationErrors: Array.Empty<string>()));
    }
}
