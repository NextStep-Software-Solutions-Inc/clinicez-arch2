using System.Net;
using System.Reflection;
using System.Text.RegularExpressions;
using System.Xml;
using System.Xml.Schema;
using ClinicEz.PhilHealthProxy.Domain.Interfaces;
using ClinicEz.PhilHealthProxy.Domain.Models;

namespace ClinicEz.PhilHealthProxy.Infrastructure.Services;

/// <summary>
/// Pre-flight validator for PhilHealth Konsulta / Yakap XML transmissions:
/// - Validates report transmittals against embedded KonsultaData_v1.14.dtd.
/// - Validates extracted registration masterlists against embedded KonsultaMasterlist_v1.5.xsd.
/// </summary>
public sealed class KonsultaXmlValidator : IKonsultaXmlValidator
{
    private static readonly Assembly SchemaAssembly = typeof(KonsultaXmlValidator).Assembly;
    private readonly XmlSchemaSet _masterlistSchemaSet;

    public KonsultaXmlValidator()
    {
        _masterlistSchemaSet = new XmlSchemaSet();
        using var xsdStream = GetManifestStream("KonsultaMasterlist_v1.5.xsd")
            ?? throw new InvalidOperationException("Embedded schema 'KonsultaMasterlist_v1.5.xsd' not found.");

        using var xsdReader = XmlReader.Create(xsdStream);
        _masterlistSchemaSet.Add(null, xsdReader);
        _masterlistSchemaSet.Compile();
    }

    public XmlValidationResult ValidateReportXml(string xmlContent)
    {
        if (string.IsNullOrWhiteSpace(xmlContent))
            return XmlValidationResult.Failure("XML content is null or empty.");

        string preparedXml = EnsureReportDoctype(xmlContent);
        var errors = new List<XmlValidationError>();

        var settings = new XmlReaderSettings
        {
            DtdProcessing = DtdProcessing.Parse,
            ValidationType = ValidationType.DTD,
            XmlResolver = new EmbeddedResourceXmlResolver()
        };

        settings.ValidationEventHandler += (_, args) =>
        {
            errors.Add(new XmlValidationError(
                args.Exception?.LineNumber ?? 0,
                args.Exception?.LinePosition ?? 0,
                args.Message,
                args.Severity == XmlSeverityType.Warning));
        };

        try
        {
            using var stringReader = new StringReader(preparedXml);
            using var reader = XmlReader.Create(stringReader, settings);
            while (reader.Read()) { }
        }
        catch (XmlException ex)
        {
            errors.Add(new XmlValidationError(ex.LineNumber, ex.LinePosition, ex.Message));
        }

        return errors.Count == 0
            ? XmlValidationResult.Success()
            : XmlValidationResult.Failure(errors);
    }

    public XmlValidationResult ValidateMasterlistXml(string xmlContent)
    {
        if (string.IsNullOrWhiteSpace(xmlContent))
            return XmlValidationResult.Failure("XML content is null or empty.");

        var errors = new List<XmlValidationError>();

        var settings = new XmlReaderSettings
        {
            ValidationType = ValidationType.Schema,
            Schemas = _masterlistSchemaSet
        };

        settings.ValidationEventHandler += (_, args) =>
        {
            errors.Add(new XmlValidationError(
                args.Exception?.LineNumber ?? 0,
                args.Exception?.LinePosition ?? 0,
                args.Message,
                args.Severity == XmlSeverityType.Warning));
        };

        try
        {
            using var stringReader = new StringReader(xmlContent);
            using var reader = XmlReader.Create(stringReader, settings);
            while (reader.Read()) { }
        }
        catch (XmlException ex)
        {
            errors.Add(new XmlValidationError(ex.LineNumber, ex.LinePosition, ex.Message));
        }

        return errors.Count == 0
            ? XmlValidationResult.Success()
            : XmlValidationResult.Failure(errors);
    }

    private static string EnsureReportDoctype(string xml)
    {
        // If DOCTYPE is already present, do not modify
        if (xml.Contains("<!DOCTYPE", StringComparison.OrdinalIgnoreCase))
            return xml;

        // If XML declaration is present, insert DOCTYPE right after it
        var xmlDeclMatch = Regex.Match(xml, @"<\?xml[^>]*\?>", RegexOptions.IgnoreCase);
        if (xmlDeclMatch.Success)
        {
            int insertPos = xmlDeclMatch.Index + xmlDeclMatch.Length;
            return xml.Insert(insertPos, "\n<!DOCTYPE PCB SYSTEM \"KonsultaData_v1.14.dtd\">\n");
        }

        // Otherwise prepend DOCTYPE
        return "<!DOCTYPE PCB SYSTEM \"KonsultaData_v1.14.dtd\">\n" + xml;
    }

    private static Stream? GetManifestStream(string filename)
    {
        var resourceName = SchemaAssembly.GetManifestResourceNames()
            .FirstOrDefault(n => n.EndsWith(filename, StringComparison.OrdinalIgnoreCase));
        return resourceName != null ? SchemaAssembly.GetManifestResourceStream(resourceName) : null;
    }

    private sealed class EmbeddedResourceXmlResolver : XmlResolver
    {
        public override ICredentials Credentials { set { } }

        public override object? GetEntity(Uri absoluteUri, string? role, Type? ofObjectToReturn)
        {
            var filename = Path.GetFileName(absoluteUri.OriginalString);
            var stream = GetManifestStream(filename);
            return stream;
        }
    }
}
