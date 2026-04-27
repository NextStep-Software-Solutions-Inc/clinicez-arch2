using System.Net.Http.Headers;
using System.Text;
using System.Xml.Linq;
using CLINICEZ.PhilHealth.Proxy.Configuration;
using CLINICEZ.PhilHealth.Proxy.Models;
using Microsoft.Extensions.Options;

namespace CLINICEZ.PhilHealth.Proxy.Services;

/// <summary>
/// Concrete SOAP client that communicates with the PhilHealth Konsulta web service.
/// All outbound requests are wrapped in a SOAP 1.1 envelope and authenticated
/// using the WS-Security UsernameToken profile.
/// </summary>
public sealed class PhilHealthSoapClient(
    HttpClient httpClient,
    IOptions<PhilHealthSettings> options,
    ILogger<PhilHealthSoapClient> logger)
    : IPhilHealthSoapClient
{
    private readonly PhilHealthSettings _settings = options.Value;

    private const string SoapAction_GetMemberInfo = "getMemberInfo";
    private const string SoapAction_CheckEligibility = "checkEligibility";
    private const string SoapAction_VerifyMember = "verifyMember";

    // XML namespaces used in the PhilHealth Konsulta WSDL
    private static readonly XNamespace SoapNs = "http://schemas.xmlsoap.org/soap/envelope/";
    private static readonly XNamespace KonsultaNs = "http://konsulta.philhealth.gov.ph/";

    // ──────────────────────────────────────────────────────────────
    //  Public interface
    // ──────────────────────────────────────────────────────────────

    public async Task<SoapResponse<PhilHealthMemberInfo>> GetMemberInfoAsync(
        string philHealthNumber,
        CancellationToken cancellationToken = default)
    {
        var body = new XElement(KonsultaNs + SoapAction_GetMemberInfo,
            new XElement(KonsultaNs + "philhealthIdNumber", philHealthNumber));

        var raw = await SendSoapAsync(SoapAction_GetMemberInfo, body, cancellationToken);
        if (!raw.IsSuccess)
            return new SoapResponse<PhilHealthMemberInfo>(false, null, raw.ErrorCode, raw.ErrorMessage);

        var result = ParseMemberInfo(raw.Data!);
        return new SoapResponse<PhilHealthMemberInfo>(true, result, null, null);
    }

    public async Task<SoapResponse<EligibilityResult>> CheckEligibilityAsync(
        string philHealthNumber,
        string facilityAccreditationNumber,
        string consultationDate,
        IReadOnlyList<string> diagnosisCodes,
        CancellationToken cancellationToken = default)
    {
        var diagnosisElements = diagnosisCodes
            .Select(d => new XElement(KonsultaNs + "diagnosisCode", d));

        var body = new XElement(KonsultaNs + SoapAction_CheckEligibility,
            new XElement(KonsultaNs + "philhealthIdNumber", philHealthNumber),
            new XElement(KonsultaNs + "facilityAccreditationNumber", facilityAccreditationNumber),
            new XElement(KonsultaNs + "consultationDate", consultationDate),
            new XElement(KonsultaNs + "diagnosisCodes", diagnosisElements));

        var raw = await SendSoapAsync(SoapAction_CheckEligibility, body, cancellationToken);
        if (!raw.IsSuccess)
            return new SoapResponse<EligibilityResult>(false, null, raw.ErrorCode, raw.ErrorMessage);

        var result = ParseEligibilityResult(raw.Data!);
        return new SoapResponse<EligibilityResult>(true, result, null, null);
    }

    public async Task<SoapResponse<bool>> VerifyMemberAsync(
        string philHealthNumber,
        string lastName,
        string firstName,
        string? dateOfBirth,
        CancellationToken cancellationToken = default)
    {
        var body = new XElement(KonsultaNs + SoapAction_VerifyMember,
            new XElement(KonsultaNs + "philhealthIdNumber", philHealthNumber),
            new XElement(KonsultaNs + "lastName", lastName),
            new XElement(KonsultaNs + "firstName", firstName),
            new XElement(KonsultaNs + "dateOfBirth", dateOfBirth ?? string.Empty));

        var raw = await SendSoapAsync(SoapAction_VerifyMember, body, cancellationToken);
        if (!raw.IsSuccess)
            return new SoapResponse<bool>(false, false, raw.ErrorCode, raw.ErrorMessage);

        var verified = string.Equals(
            raw.Data?.Element(KonsultaNs + "verified")?.Value,
            "true",
            StringComparison.OrdinalIgnoreCase);

        return new SoapResponse<bool>(true, verified, null, null);
    }

    // ──────────────────────────────────────────────────────────────
    //  Private helpers
    // ──────────────────────────────────────────────────────────────

    private async Task<SoapResponse<XElement?>> SendSoapAsync(
        string soapAction,
        XElement bodyContent,
        CancellationToken cancellationToken)
    {
        var envelope = BuildEnvelope(bodyContent);
        var xmlString = envelope.ToString(SaveOptions.DisableFormatting);

        using var content = new StringContent(xmlString, Encoding.UTF8, "text/xml");
        content.Headers.Add("SOAPAction", $"\"{KonsultaNs}{soapAction}\"");

        logger.LogDebug("Sending SOAP request: {Action}", soapAction);

        HttpResponseMessage response;
        try
        {
            response = await httpClient.PostAsync(_settings.ServiceUrl, content, cancellationToken);
        }
        catch (HttpRequestException ex)
        {
            logger.LogError(ex, "HTTP error calling PhilHealth SOAP service");
            return new SoapResponse<XElement?>(false, null, "TRANSPORT_ERROR", ex.Message);
        }

        var responseXml = await response.Content.ReadAsStringAsync(cancellationToken);
        logger.LogDebug("Received SOAP response: HTTP {StatusCode}", (int)response.StatusCode);

        if (!response.IsSuccessStatusCode)
        {
            var (faultCode, faultMessage) = ExtractSoapFault(responseXml);
            return new SoapResponse<XElement?>(false, null, faultCode, faultMessage);
        }

        try
        {
            var doc = XDocument.Parse(responseXml);
            var bodyElement = doc.Root
                ?.Element(SoapNs + "Body")
                ?.Elements()
                .FirstOrDefault();

            return new SoapResponse<XElement?>(true, bodyElement, null, null);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Failed to parse SOAP response XML");
            return new SoapResponse<XElement?>(false, null, "PARSE_ERROR", "Failed to parse the SOAP response.");
        }
    }

    private XDocument BuildEnvelope(XElement bodyContent)
    {
        var security = new XElement(
            XNamespace.Get("http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd") + "Security",
            new XElement(
                XNamespace.Get("http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd") + "UsernameToken",
                new XElement(
                    XNamespace.Get("http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd") + "Username",
                    _settings.Username),
                new XElement(
                    XNamespace.Get("http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd") + "Password",
                    _settings.Password)));

        return new XDocument(
            new XElement(SoapNs + "Envelope",
                new XAttribute(XNamespace.Xmlns + "soapenv", SoapNs),
                new XAttribute(XNamespace.Xmlns + "kon", KonsultaNs),
                new XElement(SoapNs + "Header", security),
                new XElement(SoapNs + "Body", bodyContent)));
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
            return ("SOAP_FAULT", "An unknown error occurred with the PhilHealth service.");
        }
    }

    private static PhilHealthMemberInfo ParseMemberInfo(XElement element)
    {
        string Val(string name) => element.Element(KonsultaNs + name)?.Value ?? string.Empty;

        return new PhilHealthMemberInfo(
            PhilHealthNumber: Val("philhealthIdNumber"),
            LastName: Val("lastName"),
            FirstName: Val("firstName"),
            MiddleName: element.Element(KonsultaNs + "middleName")?.Value,
            MemberCategory: Val("memberCategory"),
            Status: Val("status"),
            EffectivityDate: element.Element(KonsultaNs + "effectivityDate")?.Value,
            ExpiryDate: element.Element(KonsultaNs + "expiryDate")?.Value,
            DateOfBirth: element.Element(KonsultaNs + "dateOfBirth")?.Value,
            Sex: element.Element(KonsultaNs + "sex")?.Value);
    }

    private static EligibilityResult ParseEligibilityResult(XElement element)
    {
        string Val(string name) => element.Element(KonsultaNs + name)?.Value ?? string.Empty;

        var diagnoses = element
            .Elements(KonsultaNs + "diagnosisCode")
            .Select(e => e.Value)
            .ToList();

        return new EligibilityResult(
            PhilHealthNumber: Val("philhealthIdNumber"),
            IsEligible: string.Equals(Val("isEligible"), "true", StringComparison.OrdinalIgnoreCase),
            MemberType: Val("memberType"),
            Status: Val("status"),
            PackageCategory: element.Element(KonsultaNs + "packageCategory")?.Value,
            Diagnoses: diagnoses,
            HospitalAccreditationNumber: element.Element(KonsultaNs + "facilityAccreditationNumber")?.Value,
            EffectivityDate: element.Element(KonsultaNs + "effectivityDate")?.Value,
            Remarks: element.Element(KonsultaNs + "remarks")?.Value);
    }
}
