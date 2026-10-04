using System.Xml.Linq;
using ClinicEz.PhilHealthProxy.Domain.Entities;
using ClinicEz.PhilHealthProxy.Domain.Interfaces;
using ClinicEz.PhilHealthProxy.Domain.Models;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Exceptions;
using MediatR;
using Microsoft.AspNetCore.DataProtection;

namespace ClinicEz.PhilHealthProxy.Application.Features.Yakap.Queries.ExtractAndParseMasterlist;

public sealed class ExtractAndParseMasterlistQueryHandler(
    ICurrentTenant currentTenant,
    ITenantRepository tenantRepository,
    IDataProtectionProvider dataProtectionProvider,
    IPhilHealthSoapClient soapClient,
    IPhilHealthPayloadEncryptor encryptor,
    IKonsultaMasterlistParser masterlistParser)
    : IRequestHandler<ExtractAndParseMasterlistQuery, ApiResponse<YakapMasterlistResult>>
{
    private readonly IDataProtector _protector =
        dataProtectionProvider.CreateProtector("ClinicEz.PhilHealthProxy.TenantCredentials");

    public async Task<ApiResponse<YakapMasterlistResult>> Handle(
        ExtractAndParseMasterlistQuery request,
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

        var soapResult = await soapClient.ExtractRegistrationListAsync(
            request.StartDate,
            request.EndDate,
            cancellationToken);

        if (!soapResult.IsSuccess)
        {
            throw new ServiceUnavailableException(
                $"PhilHealth SOAP service returned an error: [{soapResult.ErrorCode}] {soapResult.ErrorMessage}");
        }

        string rawPayload = ExtractReturnContent(soapResult.ResponseXml);

        // If returned content is JSON envelope per Annex D, decrypt it; otherwise parse directly if plain XML
        string xmlContent = rawPayload.Trim().StartsWith('{')
            ? encryptor.DecryptPayload(rawPayload, cipherKey)
            : rawPayload;

        var result = masterlistParser.ParseMasterlistXml(xmlContent);
        return ApiResponse<YakapMasterlistResult>.Success(result);
    }

    private static string ExtractReturnContent(string? xml)
    {
        if (string.IsNullOrWhiteSpace(xml)) return string.Empty;

        var match = System.Text.RegularExpressions.Regex.Match(
            xml,
            @"<(?:\w+:)?return[^>]*>(.*?)</(?:\w+:)?return>",
            System.Text.RegularExpressions.RegexOptions.Singleline | System.Text.RegularExpressions.RegexOptions.IgnoreCase);

        if (match.Success)
        {
            string content = match.Groups[1].Value.Trim();
            return System.Net.WebUtility.HtmlDecode(content);
        }

        try
        {
            var doc = XDocument.Parse(xml);
            var returnElem = doc.Descendants().FirstOrDefault(e => e.Name.LocalName.Equals("return", StringComparison.OrdinalIgnoreCase));
            return returnElem?.Value ?? xml;
        }
        catch
        {
            return xml;
        }
    }
}
