using System.Text;
using System.Xml.Linq;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.Extensions.Logging;
using PhilHealthProxy.Domain.Interfaces;
using PhilHealthProxy.Domain.Models;

namespace PhilHealthProxy.Infrastructure.Services;

/// <summary>
/// Communicates with the PhilHealth Konsulta SOAP service using raw XML over HTTP.
/// Credentials (pUsername, pUserPassword, pHospitalCode) are injected per-tenant
/// from the database. The cipher key is available for field-level encryption per
/// the PhilHealth dev kit specification.
/// </summary>
public sealed class PhilHealthSoapClient(
    HttpClient httpClient,
    ICurrentTenant currentTenant,
    ITenantRepository tenantRepository,
    IDataProtectionProvider dataProtectionProvider,
    ILogger<PhilHealthSoapClient> logger)
    : IPhilHealthSoapClient
{
    private static readonly XNamespace SoapNs = "http://schemas.xmlsoap.org/soap/envelope/";
    private static readonly XNamespace PhilHealthNs = "http://philhealth.gov.ph/";

    private readonly IDataProtector _protector =
        dataProtectionProvider.CreateProtector("PhilHealthProxy.TenantCredentials");

    public async Task<SoapResult> CheckUploadStatusAsync(
        string? startDate,
        string? endDate,
        string? transmittalId,
        string? report,
        CancellationToken cancellationToken = default)
    {
        var credentials = await ResolveTenantCredentialsAsync(cancellationToken);
        if (credentials is null)
            return new SoapResult(false, null, "TENANT_NOT_FOUND",
                "No active PhilHealth configuration found for this tenant.");

        var body = new XElement(PhilHealthNs + "checkUploadStatus",
            new XElement(PhilHealthNs + "pUsername", credentials.Username),
            new XElement(PhilHealthNs + "pUserPassword", credentials.Password),
            new XElement(PhilHealthNs + "pHospitalCode", credentials.AccreditationNumber),
            new XElement(PhilHealthNs + "pStartDate", startDate ?? string.Empty),
            new XElement(PhilHealthNs + "pEndDate", endDate ?? string.Empty),
            new XElement(PhilHealthNs + "pTransmittalID", transmittalId ?? string.Empty),
            new XElement(PhilHealthNs + "pReport", report ?? string.Empty));

        return await SendSoapAsync(
            credentials.Endpoint,
            "checkUploadStatus",
            body,
            cancellationToken);
    }

    // ─── Private helpers ───────────────────────────────────────────────────────

    private async Task<TenantCredentials?> ResolveTenantCredentialsAsync(CancellationToken ct)
    {
        if (currentTenant.TenantId is null)
            return null;

        var tenant = await tenantRepository.GetByTenantIdAsync(currentTenant.TenantId.Value, ct);
        if (tenant is null)
            return null;

        return new TenantCredentials(
            Username: _protector.Unprotect(tenant.EncryptedUsername),
            Password: _protector.Unprotect(tenant.EncryptedPassword),
            AccreditationNumber: tenant.AccreditationNumber,
            Endpoint: tenant.KonsultaEndpoint);
    }

    private async Task<SoapResult> SendSoapAsync(
        string endpoint,
        string soapAction,
        XElement bodyContent,
        CancellationToken cancellationToken)
    {
        var envelope = new XDocument(
            new XElement(SoapNs + "Envelope",
                new XAttribute(XNamespace.Xmlns + "soapenv", SoapNs),
                new XAttribute(XNamespace.Xmlns + "phi", PhilHealthNs),
                new XElement(SoapNs + "Header"),
                new XElement(SoapNs + "Body", bodyContent)));

        var xmlString = envelope.ToString(SaveOptions.DisableFormatting);

        using var content = new StringContent(xmlString, Encoding.UTF8, "text/xml");
        content.Headers.Add("SOAPAction", $"\"{PhilHealthNs}{soapAction}\"");

        logger.LogDebug("Sending SOAP {Action} to {Endpoint}", soapAction, endpoint);

        HttpResponseMessage response;
        try
        {
            response = await httpClient.PostAsync(endpoint, content, cancellationToken);
        }
        catch (HttpRequestException ex)
        {
            logger.LogError(ex, "HTTP transport error calling PhilHealth SOAP [{Action}]", soapAction);
            return new SoapResult(false, null, "TRANSPORT_ERROR", ex.Message);
        }
        catch (TaskCanceledException ex) when (!cancellationToken.IsCancellationRequested)
        {
            logger.LogError(ex, "Timeout calling PhilHealth SOAP [{Action}]", soapAction);
            return new SoapResult(false, null, "TIMEOUT", "The request to PhilHealth timed out.");
        }

        var responseXml = await response.Content.ReadAsStringAsync(cancellationToken);
        logger.LogDebug("SOAP {Action} responded HTTP {Status}", soapAction, (int)response.StatusCode);

        if (!response.IsSuccessStatusCode)
        {
            var (faultCode, faultMessage) = ExtractSoapFault(responseXml);
            return new SoapResult(false, responseXml, faultCode, faultMessage);
        }

        return new SoapResult(true, responseXml, null, null);
    }

    private static (string Code, string Message) ExtractSoapFault(string xml)
    {
        try
        {
            var doc = XDocument.Parse(xml);
            var fault = doc.Root?.Element(SoapNs + "Body")?.Element(SoapNs + "Fault");
            var code = fault?.Element("faultcode")?.Value ?? "SOAP_FAULT";
            var message = fault?.Element("faultstring")?.Value ?? "An unknown SOAP fault occurred.";
            return (code, message);
        }
        catch
        {
            return ("SOAP_FAULT", "An unknown error occurred communicating with the PhilHealth service.");
        }
    }

    private sealed record TenantCredentials(
        string Username,
        string Password,
        string AccreditationNumber,
        string Endpoint);
}
