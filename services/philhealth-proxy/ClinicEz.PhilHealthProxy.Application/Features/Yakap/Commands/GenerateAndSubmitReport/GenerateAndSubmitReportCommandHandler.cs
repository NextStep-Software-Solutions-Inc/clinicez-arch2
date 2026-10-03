using System.Xml.Linq;
using ClinicEz.PhilHealthProxy.Domain.Interfaces;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Exceptions;
using MediatR;
using Microsoft.AspNetCore.DataProtection;

namespace ClinicEz.PhilHealthProxy.Application.Features.Yakap.Commands.GenerateAndSubmitReport;

public sealed class GenerateAndSubmitReportCommandHandler(
    ICurrentTenant currentTenant,
    ITenantRepository tenantRepository,
    IDataProtectionProvider dataProtectionProvider,
    IKonsultaXmlGenerator xmlGenerator,
    IKonsultaXmlValidator xmlValidator,
    IPhilHealthPayloadEncryptor encryptor,
    IPhilHealthSoapClient soapClient)
    : IRequestHandler<GenerateAndSubmitReportCommand, ApiResponse<YakapSubmissionResponse>>
{
    private readonly IDataProtector _protector =
        dataProtectionProvider.CreateProtector("ClinicEz.PhilHealthProxy.TenantCredentials");

    public async Task<ApiResponse<YakapSubmissionResponse>> Handle(
        GenerateAndSubmitReportCommand request,
        CancellationToken cancellationToken)
    {
        if (currentTenant.TenantId is null)
            throw new UnauthorizedException("Tenant could not be resolved from the request.");

        var tenant = await tenantRepository.GetByTenantIdAsync(currentTenant.TenantId.Value, cancellationToken)
            ?? throw new NotFoundException("PhilHealth configuration not found for tenant.");

        string cipherKey = _protector.Unprotect(tenant.EncryptedCipherKey);

        // 1. Generate XML
        string rawXml = request.ReportTagging == "1"
            ? xmlGenerator.GenerateTranche1Xml(request.Document)
            : xmlGenerator.GenerateTranche2Xml(request.Document);

        // 2. Pre-flight DTD Schema Validation
        var validation = xmlValidator.ValidateReportXml(rawXml);
        if (!validation.IsValid)
        {
            var errors = validation.Errors.Select(e => $"Line {e.LineNumber}:{e.LinePosition} - {e.Message}").ToList();
            return ApiResponse<YakapSubmissionResponse>.Success(
                new YakapSubmissionResponse(
                    IsSuccess: false,
                    TransmittalNumber: request.Document.HciTransmittalNumber,
                    TransactionNumber: null,
                    RawXml: rawXml,
                    PhilHealthSoapResponse: null,
                    ValidationErrors: errors));
        }

        // 3. Encrypt payload per Annex D
        string encryptedJson = encryptor.EncryptPayload(rawXml, cipherKey);

        // 4. Submit to PhilHealth SOAP submitReport service
        var soapResult = await soapClient.SubmitReportAsync(
            request.Document.HciTransmittalNumber,
            encryptedJson,
            request.ReportTagging,
            cancellationToken);

        if (!soapResult.IsSuccess)
        {
            throw new ServiceUnavailableException(
                $"PhilHealth SOAP service returned an error: [{soapResult.ErrorCode}] {soapResult.ErrorMessage}");
        }

        string? txNumber = ExtractTransactionNumber(soapResult.ResponseXml);

        return ApiResponse<YakapSubmissionResponse>.Success(
            new YakapSubmissionResponse(
                IsSuccess: true,
                TransmittalNumber: request.Document.HciTransmittalNumber,
                TransactionNumber: txNumber,
                RawXml: rawXml,
                PhilHealthSoapResponse: soapResult.ResponseXml,
                ValidationErrors: Array.Empty<string>()));
    }

    private static string? ExtractTransactionNumber(string? xml)
    {
        if (string.IsNullOrWhiteSpace(xml)) return null;
        try
        {
            var doc = XDocument.Parse(xml);
            return doc.Descendants().FirstOrDefault(e => e.Name.LocalName == "return")?.Value;
        }
        catch
        {
            return null;
        }
    }
}
