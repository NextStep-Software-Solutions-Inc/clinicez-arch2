using System.Security.Cryptography;
using System.Text;
using System.Xml.Linq;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.Extensions.Logging;
using ClinicEz.PhilHealthProxy.Domain.Entities;
using ClinicEz.PhilHealthProxy.Domain.Interfaces;
using ClinicEz.PhilHealthProxy.Domain.Models;

namespace ClinicEz.PhilHealthProxy.Infrastructure.Services;

/// <summary>
/// Communicates with the PhilHealth Konsulta SOAP service using raw XML over HTTP.
/// Tenant credentials (pUsername, pUserPassword, pHospitalCode, pSoftwareCertificationId)
/// are resolved per-request from the database and never appear in configuration files.
/// <para>
/// Per the PKA v1.1 implementation guide, every SOAP method call (except <c>getToken</c> and
/// <c>checkUploadStatus</c>) requires the access token obtained from <c>getToken</c> to be
/// passed as an HTTP header named <c>Token</c>.  This class handles token acquisition and
/// per-tenant caching automatically so callers do not need to manage tokens.
/// </para>
/// </summary>
public sealed class PhilHealthSoapClient(
    HttpClient httpClient,
    ICurrentTenant currentTenant,
    ITenantRepository tenantRepository,
    IDataProtectionProvider dataProtectionProvider,
    IPhilHealthTokenCache tokenCache,
    ISoapSandboxService soapSandboxService,
    ILogger<PhilHealthSoapClient> logger)
    : IPhilHealthSoapClient
{
    private static readonly XNamespace SoapNs = "http://schemas.xmlsoap.org/soap/envelope/";
    private static readonly XNamespace PhilHealthNs = "http://philhealth.gov.ph/";

    /// <summary>
    /// Tokens are cached for slightly less than their assumed TTL to avoid using an expired token.
    /// PhilHealth does not document the token lifetime; 28 minutes is a conservative default.
    /// </summary>
    private static readonly TimeSpan TokenTtl = TimeSpan.FromMinutes(28);

    private readonly IDataProtector _protector =
        dataProtectionProvider.CreateProtector("ClinicEz.PhilHealthProxy.TenantCredentials");

    // ── Public interface ──────────────────────────────────────────────────────

    public async Task<SoapResult> GetTokenAsync(CancellationToken cancellationToken = default)
    {
        var creds = await ResolveTenantCredentialsAsync(cancellationToken);
        if (creds is null) return TenantNotFound();

        var body = BuildGetTokenBody(creds);
        var result = await SendSoapAsync(creds.Endpoint, "getToken", body, token: null, cancellationToken);

        // Cache the returned token so subsequent operations can include it automatically.
        if (result.IsSuccess && result.ResponseXml is not null && currentTenant.TenantId.HasValue)
        {
            var token = ExtractReturnValue(result.ResponseXml);
            if (!string.IsNullOrEmpty(token))
                tokenCache.Set(currentTenant.TenantId.Value, token, TokenTtl);
        }

        return result;
    }

    public async Task<SoapResult> IsMemberDependentRegisteredAsync(
        string pin,
        string type,
        CancellationToken cancellationToken = default)
    {
        var creds = await ResolveTenantCredentialsAsync(cancellationToken);
        if (creds is null) return TenantNotFound();

        var token = await AcquireTokenAsync(creds, cancellationToken);

        var body = new XElement(PhilHealthNs + "isMemberDependentRegistered",
            new XElement(PhilHealthNs + "pPIN", pin),
            new XElement(PhilHealthNs + "pType", type));

        return await SendSoapAsync(creds.Endpoint, "isMemberDependentRegistered", body, token, cancellationToken);
    }

    public async Task<SoapResult> IsAtcValidAsync(
        string pin,
        string atc,
        string effectivityDate,
        CancellationToken cancellationToken = default)
    {
        var creds = await ResolveTenantCredentialsAsync(cancellationToken);
        if (creds is null) return TenantNotFound();

        var token = await AcquireTokenAsync(creds, cancellationToken);

        // The PhilHealth SOAP service expects dates as mm/dd/yyyy (PKA v1.1 guide, Module 2-C).
        var body = new XElement(PhilHealthNs + "isATCValid",
            new XElement(PhilHealthNs + "pPIN", pin),
            new XElement(PhilHealthNs + "pATC", atc),
            new XElement(PhilHealthNs + "pEffectivityDate", ToPhilHealthDate(effectivityDate)));

        return await SendSoapAsync(creds.Endpoint, "isATCValid", body, token, cancellationToken);
    }

    public async Task<SoapResult> ExtractRegistrationListAsync(
        string startDate,
        string endDate,
        CancellationToken cancellationToken = default)
    {
        var creds = await ResolveTenantCredentialsAsync(cancellationToken);
        if (creds is null) return TenantNotFound();

        var token = await AcquireTokenAsync(creds, cancellationToken);

        // The PhilHealth SOAP service expects dates as mm/dd/yyyy (PKA v1.1 guide, Module 2-B).
        var body = new XElement(PhilHealthNs + "extractRegistrationList",
            new XElement(PhilHealthNs + "pStartDate", ToPhilHealthDate(startDate)),
            new XElement(PhilHealthNs + "pEndDate", ToPhilHealthDate(endDate)));

        return await SendSoapAsync(creds.Endpoint, "extractRegistrationList", body, token, cancellationToken);
    }

    public async Task<SoapResult> ValidateReportAsync(
        string reportTagging,
        string report,
        CancellationToken cancellationToken = default)
    {
        var creds = await ResolveTenantCredentialsAsync(cancellationToken);
        if (creds is null) return TenantNotFound();

        var token = await AcquireTokenAsync(creds, cancellationToken);

        var body = new XElement(PhilHealthNs + "validateReport",
            new XElement(PhilHealthNs + "pReportTagging", reportTagging),
            new XElement(PhilHealthNs + "pReport", report));

        return await SendSoapAsync(creds.Endpoint, "validateReport", body, token, cancellationToken);
    }

    public async Task<SoapResult> SubmitReportAsync(
        string transmittalId,
        string report,
        string reportTagging,
        CancellationToken cancellationToken = default)
    {
        var creds = await ResolveTenantCredentialsAsync(cancellationToken);
        if (creds is null) return TenantNotFound();

        var token = await AcquireTokenAsync(creds, cancellationToken);

        var body = new XElement(PhilHealthNs + "submitReport",
            new XElement(PhilHealthNs + "pTransmittalID", transmittalId),
            new XElement(PhilHealthNs + "pReport", report),
            new XElement(PhilHealthNs + "pReportTagging", reportTagging));

        return await SendSoapAsync(creds.Endpoint, "submitReport", body, token, cancellationToken);
    }

    /// <summary>
    /// <c>checkUploadStatus</c> uses explicit credential parameters (pUsername, pUserPassword,
    /// pHospitalCode) in the SOAP body — it does not use the Bearer-style Token header.
    /// </summary>
    public async Task<SoapResult> CheckUploadStatusAsync(
        string? startDate,
        string? endDate,
        string? transmittalId,
        string? report,
        CancellationToken cancellationToken = default)
    {
        var creds = await ResolveTenantCredentialsAsync(cancellationToken);
        if (creds is null) return TenantNotFound();

        var body = new XElement(PhilHealthNs + "checkUploadStatus",
            new XElement(PhilHealthNs + "pUsername", creds.Username),
            new XElement(PhilHealthNs + "pUserPassword", creds.Password),
            new XElement(PhilHealthNs + "pHospitalCode", creds.AccreditationNumber),
            new XElement(PhilHealthNs + "pStartDate", startDate ?? string.Empty),
            new XElement(PhilHealthNs + "pEndDate", endDate ?? string.Empty),
            new XElement(PhilHealthNs + "pTransmittalID", transmittalId ?? string.Empty),
            new XElement(PhilHealthNs + "pReport", report ?? string.Empty));

        return await SendSoapAsync(creds.Endpoint, "checkUploadStatus", body, token: null, cancellationToken);
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    private static SoapResult TenantNotFound() =>
        new(false, null, "TENANT_NOT_FOUND",
            "No active PhilHealth configuration found for this tenant.");

    /// <summary>
    /// Returns the shared SOAP body element for the <c>getToken</c> operation.
    /// Reused by both <see cref="GetTokenAsync"/> and <see cref="AcquireTokenAsync"/>.
    /// </summary>
    private XElement BuildGetTokenBody(TenantCredentials creds) =>
        new(PhilHealthNs + "getToken",
            new XElement(PhilHealthNs + "pUsername", creds.Username),
            new XElement(PhilHealthNs + "pUserPassword", creds.Password),
            new XElement(PhilHealthNs + "pSoftwareCertificationId", creds.SoftwareCertificateId),
            new XElement(PhilHealthNs + "pHospitalCode", creds.AccreditationNumber));

    /// <summary>
    /// Returns a cached access token for the current tenant, fetching a new one from
    /// PhilHealth if the cache is empty or expired.
    /// </summary>
    private async Task<string?> AcquireTokenAsync(TenantCredentials creds, CancellationToken ct)
    {
        if (!currentTenant.TenantId.HasValue) return null;

        var cached = tokenCache.Get(currentTenant.TenantId.Value);
        if (cached is not null) return cached;

        var body = BuildGetTokenBody(creds);
        var result = await SendSoapAsync(creds.Endpoint, "getToken", body, token: null, ct);

        if (!result.IsSuccess || result.ResponseXml is null) return null;

        var token = ExtractReturnValue(result.ResponseXml);
        if (!string.IsNullOrEmpty(token))
            tokenCache.Set(currentTenant.TenantId.Value, token, TokenTtl);

        return token;
    }

    /// <summary>
    /// Extracts the text content of the SOAP response's <c>&lt;return&gt;</c> element,
    /// which is how PhilHealth returns the access token from <c>getToken</c>.
    /// </summary>
    private static string? ExtractReturnValue(string xml)
    {
        try
        {
            var doc = XDocument.Parse(xml);
            return doc.Descendants(PhilHealthNs + "return").FirstOrDefault()?.Value;
        }
        catch
        {
            return null;
        }
    }

    /// <summary>
    /// Converts an ISO date string (<c>yyyy-MM-dd</c>) to the <c>mm/dd/yyyy</c> format
    /// required by the PhilHealth SOAP service (PKA v1.1, Modules 2-B and 2-C).
    /// If the input cannot be parsed the original value is returned unchanged.
    /// </summary>
    private static string ToPhilHealthDate(string isoDate)
    {
        if (DateOnly.TryParseExact(isoDate, "yyyy-MM-dd",
                System.Globalization.CultureInfo.InvariantCulture,
                System.Globalization.DateTimeStyles.None,
                out var date))
        {
            return date.ToString("MM/dd/yyyy");
        }

        return isoDate;
    }

    private string SafeUnprotect(string? encrypted)
    {
        if (string.IsNullOrEmpty(encrypted)) return string.Empty;
        try
        {
            return _protector.Unprotect(encrypted);
        }
        catch (CryptographicException)
        {
            return string.Empty;
        }
        catch (FormatException)
        {
            return string.Empty;
        }
    }

    private async Task<TenantCredentials?> ResolveTenantCredentialsAsync(CancellationToken ct)
    {
        PhilHealthTenant? tenant = null;
        if (currentTenant.BranchId.HasValue)
        {
            tenant = await tenantRepository.GetByBranchIdAsync(currentTenant.BranchId.Value, ct);
        }

        if (tenant is null && currentTenant.TenantId.HasValue)
        {
            tenant = await tenantRepository.GetByTenantIdAsync(currentTenant.TenantId.Value, ct);
        }

        if (tenant is null) return null;

        return new TenantCredentials(
            Username: SafeUnprotect(tenant.EncryptedUsername),
            Password: SafeUnprotect(tenant.EncryptedPassword),
            SoftwareCertificateId: tenant.SoftwareCertificateId,
            AccreditationNumber: tenant.AccreditationNumber,
            Endpoint: tenant.KonsultaEndpoint);
    }

    private async Task<SoapResult> SendSoapAsync(
        string endpoint,
        string soapAction,
        XElement bodyContent,
        string? token,
        CancellationToken cancellationToken)
    {
        var envelope = new XDocument(
            new XElement(SoapNs + "Envelope",
                new XAttribute(XNamespace.Xmlns + "soapenv", SoapNs),
                new XAttribute(XNamespace.Xmlns + "phi", PhilHealthNs),
                new XElement(SoapNs + "Header"),
                new XElement(SoapNs + "Body", bodyContent)));

        var xmlString = envelope.ToString(SaveOptions.DisableFormatting);

        using var request = new System.Net.Http.HttpRequestMessage(System.Net.Http.HttpMethod.Post, endpoint)
        {
            Content = new StringContent(xmlString, Encoding.UTF8, "text/xml")
        };

        // SOAPAction is an HTTP-level header in SOAP 1.1 (not a content header).
        request.Headers.Add("SOAPAction", $"\"{PhilHealthNs}{soapAction}\"");

        // PKA v1.1: every method call except getToken requires the access token in a
        // request header named "Token".
        if (token is not null)
            request.Headers.Add("Token", token);

        logger.LogDebug("Sending SOAP {Action} to {Endpoint}", soapAction, endpoint);

        // In sandbox/simulator mode, handle locally without network I/O
        if (endpoint.Contains("sandbox", StringComparison.OrdinalIgnoreCase) ||
            endpoint.Contains("simulator", StringComparison.OrdinalIgnoreCase) ||
            endpoint.EndsWith("/soap/konsulta", StringComparison.OrdinalIgnoreCase))
        {
            logger.LogInformation("Routing SOAP action [{Action}] to in-memory SOAP Sandbox Simulator", soapAction);
            return await soapSandboxService.HandleSoapActionAsync(soapAction, xmlString, token, cancellationToken);
        }

        HttpResponseMessage response;
        try
        {
            response = await httpClient.SendAsync(request, cancellationToken);
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
        string SoftwareCertificateId,
        string AccreditationNumber,
        string Endpoint);
}
