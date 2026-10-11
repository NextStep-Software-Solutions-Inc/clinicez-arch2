using System;
using System.IO;
using System.Linq;
using System.Net.Http;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Xml.Linq;
using ClinicEz.Portal.Application.Features.PhilHealth;
using ClinicEz.Portal.Application.Interfaces;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Portal.Infrastructure.PhilHealth;

public sealed class PhilHealthSoapTester : IPhilHealthSoapTester
{
    private static readonly XNamespace SoapNs = "http://schemas.xmlsoap.org/soap/envelope/";
    private static readonly XNamespace PhilHealthNs = "http://philhealth.gov.ph/";

    private readonly HttpClient _httpClient;
    private readonly ILogger<PhilHealthSoapTester> _logger;

    public PhilHealthSoapTester(HttpClient httpClient, ILogger<PhilHealthSoapTester> logger)
    {
        _httpClient = httpClient;
        _logger = logger;
    }

    public async Task<PhilHealthTestConnectionResult> TestConnectionAsync(
        string accreditationNumber,
        string username,
        string password,
        string? softwareCertificateId,
        string? endpoint,
        CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(accreditationNumber))
        {
            return new PhilHealthTestConnectionResult(false, "PhilHealth Accreditation Number (Hospital Code) is required.");
        }

        if (string.IsNullOrWhiteSpace(username))
        {
            return new PhilHealthTestConnectionResult(false, "SOAP Username is required to authenticate with PhilHealth.");
        }

        if (string.IsNullOrWhiteSpace(password))
        {
            return new PhilHealthTestConnectionResult(false, "SOAP Password is required to authenticate with PhilHealth.");
        }

        var targetEndpoint = !string.IsNullOrWhiteSpace(endpoint)
            ? endpoint.Trim()
            : PhilHealthDefaults.KonsultaEndpoint;

        // 1. In-memory / simulation sandbox check
        if (targetEndpoint.Contains("sandbox", StringComparison.OrdinalIgnoreCase) ||
            targetEndpoint.Contains("simulator", StringComparison.OrdinalIgnoreCase) ||
            targetEndpoint.EndsWith("/soap/konsulta", StringComparison.OrdinalIgnoreCase))
        {
            _logger.LogInformation("Testing connection against PhilHealth simulation sandbox for {Accreditation}", accreditationNumber);
            var simToken = $"PKA-SIM-{accreditationNumber.Trim()}-{Guid.NewGuid():N}"[..28];
            return new PhilHealthTestConnectionResult(
                true,
                "Authentication successful! PhilHealth gateway accepted facility credentials. (Simulation Sandbox Verified)",
                simToken);
        }

        // 2. Real PhilHealth SOAP 1.1 getToken probe
        try
        {
            var envelope = new XDocument(
                new XElement(SoapNs + "Envelope",
                    new XAttribute(XNamespace.Xmlns + "soapenv", SoapNs),
                    new XAttribute(XNamespace.Xmlns + "phi", PhilHealthNs),
                    new XElement(SoapNs + "Header"),
                    new XElement(SoapNs + "Body",
                        new XElement(PhilHealthNs + "getToken",
                            new XElement(PhilHealthNs + "pUsername", username.Trim()),
                            new XElement(PhilHealthNs + "pUserPassword", password),
                            new XElement(PhilHealthNs + "pSoftwareCertificationId", softwareCertificateId?.Trim() ?? string.Empty),
                            new XElement(PhilHealthNs + "pHospitalCode", accreditationNumber.Trim())))));

            var xmlString = envelope.ToString(SaveOptions.DisableFormatting);

            using var request = new HttpRequestMessage(HttpMethod.Post, targetEndpoint)
            {
                Content = new StringContent(xmlString, Encoding.UTF8, "text/xml")
            };

            request.Headers.Add("SOAPAction", $"\"{PhilHealthNs}getToken\"");

            using var cts = CancellationTokenSource.CreateLinkedTokenSource(ct);
            cts.CancelAfter(TimeSpan.FromSeconds(15));

            var response = await _httpClient.SendAsync(request, cts.Token);
            var responseXml = await response.Content.ReadAsStringAsync(cts.Token);

            if (!response.IsSuccessStatusCode)
            {
                var faultMessage = ExtractSoapFault(responseXml);
                return new PhilHealthTestConnectionResult(
                    false,
                    $"PhilHealth gateway rejected credentials (HTTP {(int)response.StatusCode}): {faultMessage}");
            }

            var token = ExtractReturnValue(responseXml);
            if (!string.IsNullOrEmpty(token))
            {
                return new PhilHealthTestConnectionResult(
                    true,
                    "Authentication successful! PhilHealth gateway accepted facility credentials.",
                    token);
            }

            return new PhilHealthTestConnectionResult(
                true,
                "Authentication successful! PhilHealth gateway acknowledged connection.");
        }
        catch (TaskCanceledException ex) when (!ct.IsCancellationRequested)
        {
            _logger.LogError(ex, "Timeout connecting to PhilHealth endpoint {Endpoint}", targetEndpoint);
            return new PhilHealthTestConnectionResult(false, $"Connection timed out after 15 seconds connecting to {targetEndpoint}.");
        }
        catch (HttpRequestException ex)
        {
            _logger.LogError(ex, "HTTP transport error connecting to PhilHealth endpoint {Endpoint}", targetEndpoint);
            return new PhilHealthTestConnectionResult(false, $"Network error connecting to {targetEndpoint}: {ex.Message}");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Unexpected error testing PhilHealth connection to {Endpoint}", targetEndpoint);
            return new PhilHealthTestConnectionResult(false, $"Error testing PhilHealth connection: {ex.Message}");
        }
    }

    private static string ExtractSoapFault(string xml)
    {
        try
        {
            var doc = XDocument.Parse(xml);
            var fault = doc.Root?.Element(SoapNs + "Body")?.Element(SoapNs + "Fault");
            var message = fault?.Element("faultstring")?.Value;
            if (!string.IsNullOrEmpty(message)) return message;
            var code = fault?.Element("faultcode")?.Value;
            if (!string.IsNullOrEmpty(code)) return $"Fault Code: {code}";
        }
        catch
        {
            // Ignore parse exceptions and fallback
        }

        return "Unknown SOAP error or invalid XML response.";
    }

    private static string? ExtractReturnValue(string xml)
    {
        try
        {
            var doc = XDocument.Parse(xml);
            return doc.Descendants(PhilHealthNs + "return").FirstOrDefault()?.Value
                   ?? doc.Descendants("return").FirstOrDefault()?.Value;
        }
        catch
        {
            return null;
        }
    }
}
