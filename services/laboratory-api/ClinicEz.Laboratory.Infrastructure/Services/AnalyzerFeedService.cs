using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;
using ClinicEz.Laboratory.Application.Common.Interfaces;

namespace ClinicEz.Laboratory.Infrastructure.Services;

public class AnalyzerFeedService : IAnalyzerFeedService
{
    public ParsedAnalyzerPacket ParseFeed(string rawPayload, string? protocolHint = null)
    {
        if (string.IsNullOrWhiteSpace(rawPayload))
        {
            throw new ArgumentException("Analyzer feed payload cannot be empty.", nameof(rawPayload));
        }

        var trimmed = rawPayload.Trim();

        // 1. Detect JSON
        if (string.Equals(protocolHint, "JSON", StringComparison.OrdinalIgnoreCase) ||
            trimmed.StartsWith("{") && trimmed.EndsWith("}"))
        {
            return ParseJson(trimmed);
        }

        // 2. Detect HL7
        if (string.Equals(protocolHint, "HL7", StringComparison.OrdinalIgnoreCase) ||
            trimmed.StartsWith("MSH|", StringComparison.OrdinalIgnoreCase))
        {
            return ParseHl7(trimmed);
        }

        // 3. Default to ASTM E1394
        return ParseAstm(trimmed);
    }

    private static ParsedAnalyzerPacket ParseJson(string json)
    {
        using var doc = JsonDocument.Parse(json);
        var root = doc.RootElement;

        var analyzerId = root.TryGetProperty("analyzerId", out var aProp) ? aProp.GetString() ?? "ANALYZER_JSON" : "ANALYZER_JSON";
        var accession = root.TryGetProperty("accessionNumber", out var accProp) ? accProp.GetString() ?? string.Empty : string.Empty;
        var observations = new List<ParsedAnalyzerObservation>();

        if (root.TryGetProperty("observations", out var obsArray) && obsArray.ValueKind == JsonValueKind.Array)
        {
            foreach (var item in obsArray.EnumerateArray())
            {
                var code = item.TryGetProperty("code", out var c) ? c.GetString() ?? string.Empty : string.Empty;
                var name = item.TryGetProperty("name", out var n) ? n.GetString() ?? code : code;
                var val = item.TryGetProperty("value", out var v) ? v.GetString() ?? string.Empty : string.Empty;
                var unit = item.TryGetProperty("unit", out var u) ? u.GetString() ?? string.Empty : string.Empty;
                var flag = item.TryGetProperty("flag", out var f) ? f.GetString() : null;

                if (!string.IsNullOrWhiteSpace(code) && !string.IsNullOrWhiteSpace(val))
                {
                    observations.Add(new ParsedAnalyzerObservation(code, name, val, unit, flag));
                }
            }
        }

        return new ParsedAnalyzerPacket("JSON", analyzerId, accession, DateTime.UtcNow, observations);
    }

    private static ParsedAnalyzerPacket ParseHl7(string hl7)
    {
        var lines = hl7.Split(["\r\n", "\r", "\n"], StringSplitOptions.RemoveEmptyEntries);
        var analyzerId = "HL7_ANALYZER";
        var accession = string.Empty;
        var observations = new List<ParsedAnalyzerObservation>();

        foreach (var rawLine in lines)
        {
            var line = rawLine.Trim();
            if (string.IsNullOrEmpty(line)) continue;

            var fields = line.Split('|');
            var seg = fields[0].ToUpperInvariant();

            if (seg == "MSH" && fields.Length > 2)
            {
                analyzerId = fields[2];
            }
            else if (seg == "OBR" && fields.Length > 3)
            {
                accession = fields[2].Length > 0 ? fields[2] : (fields.Length > 3 ? fields[3] : string.Empty);
            }
            else if (seg == "OBX" && fields.Length > 5)
            {
                // OBX|seq|type|code^name|sub|value|unit|ref|flag...
                var idField = fields[3];
                var idParts = idField.Split('^');
                var code = idParts[0].Trim();
                var name = idParts.Length > 1 ? idParts[1].Trim() : code;

                var value = fields[5].Trim();
                var unit = fields.Length > 6 ? fields[6].Trim() : string.Empty;
                var flag = fields.Length > 8 ? fields[8].Trim() : null;

                if (!string.IsNullOrWhiteSpace(code) && !string.IsNullOrWhiteSpace(value))
                {
                    observations.Add(new ParsedAnalyzerObservation(code, name, value, unit, flag));
                }
            }
        }

        return new ParsedAnalyzerPacket("HL7", analyzerId, accession, DateTime.UtcNow, observations);
    }

    private static ParsedAnalyzerPacket ParseAstm(string astm)
    {
        var lines = astm.Split(["\r\n", "\r", "\n"], StringSplitOptions.RemoveEmptyEntries);
        var analyzerId = "ASTM_ANALYZER";
        var accession = string.Empty;
        var observations = new List<ParsedAnalyzerObservation>();

        foreach (var rawLine in lines)
        {
            var line = rawLine.Trim();
            if (string.IsNullOrEmpty(line)) continue;

            var fields = line.Split('|');
            var recType = fields[0].ToUpperInvariant();

            if (recType == "H" && fields.Length > 4)
            {
                analyzerId = !string.IsNullOrWhiteSpace(fields[4]) ? fields[4] : "ASTM_INSTRUMENT";
            }
            else if (recType == "O" && fields.Length > 2)
            {
                // Order record: O|1|ACCESSION...
                accession = fields[2].Trim();
            }
            else if (recType == "R" && fields.Length > 3)
            {
                // Result record: R|seq|^^^CODE|VALUE|UNIT|REF|FLAG
                var codeField = fields[2].Replace("^", "").Trim();
                var val = fields[3].Trim();
                var unit = fields.Length > 4 ? fields[4].Trim() : string.Empty;
                var flag = fields.Length > 6 ? fields[6].Trim() : null;

                if (!string.IsNullOrWhiteSpace(codeField) && !string.IsNullOrWhiteSpace(val))
                {
                    observations.Add(new ParsedAnalyzerObservation(codeField, codeField, val, unit, flag));
                }
            }
        }

        return new ParsedAnalyzerPacket("ASTM", analyzerId, accession, DateTime.UtcNow, observations);
    }

    public string GenerateSimulationPayload(string analyzerModel, string accessionNumber, string format = "ASTM")
    {
        var isHema = analyzerModel.Contains("Mindray", StringComparison.OrdinalIgnoreCase) ||
                     analyzerModel.Contains("Sysmex", StringComparison.OrdinalIgnoreCase) ||
                     analyzerModel.Contains("Hematology", StringComparison.OrdinalIgnoreCase);

        var fmt = format.ToUpperInvariant();

        if (fmt == "JSON")
        {
            var obs = isHema ? new[]
            {
                new { code = "HGB", name = "Hemoglobin", value = "14.4", unit = "g/dL", flag = "Normal" },
                new { code = "HCT", name = "Hematocrit", value = "43.2", unit = "%", flag = "Normal" },
                new { code = "RBC", name = "Red Blood Cells", value = "4.82", unit = "x10^6/uL", flag = "Normal" },
                new { code = "WBC", name = "White Blood Cells", value = "7.6", unit = "x10^3/uL", flag = "Normal" },
                new { code = "PLT", name = "Platelets", value = "265", unit = "x10^3/uL", flag = "Normal" },
                new { code = "NEUT", name = "Neutrophils", value = "62.0", unit = "%", flag = "Normal" },
                new { code = "LYMPH", name = "Lymphocytes", value = "28.5", unit = "%", flag = "Normal" },
            } : new[]
            {
                new { code = "FBS", name = "Fasting Blood Sugar", value = "94.0", unit = "mg/dL", flag = "Normal" },
                new { code = "CREA", name = "Serum Creatinine", value = "0.95", unit = "mg/dL", flag = "Normal" },
                new { code = "BUN", name = "Blood Urea Nitrogen", value = "14.2", unit = "mg/dL", flag = "Normal" },
                new { code = "CHOL", name = "Total Cholesterol", value = "185.0", unit = "mg/dL", flag = "Normal" },
                new { code = "TRIG", name = "Triglycerides", value = "120.0", unit = "mg/dL", flag = "Normal" },
                new { code = "SGPT_ALT", name = "ALT", value = "28.0", unit = "U/L", flag = "Normal" },
            };

            return JsonSerializer.Serialize(new
            {
                analyzerId = analyzerModel,
                protocol = "JSON",
                accessionNumber,
                timestamp = DateTime.UtcNow,
                observations = obs
            }, new JsonSerializerOptions { WriteIndented = true });
        }

        if (fmt == "HL7")
        {
            var ts = DateTime.UtcNow.ToString("yyyyMMddHHmmss");
            var header = $"MSH|^~\\&|{analyzerModel}|LAB|LIS|CLINIC|{ts}||ORU^R01|MSG{DateTime.UtcNow.Ticks % 100000}|P|2.3.1\r\n" +
                         $"PID|1||PAT001||Dela Cruz^Juan||19800101|M\r\n" +
                         $"OBR|1||{accessionNumber}|{(isHema ? "CBC^Complete Blood Count" : "CHEM^Clinical Chemistry")}\r\n";

            if (isHema)
            {
                return header +
                    "OBX|1|NM|HGB^Hemoglobin||14.4|g/dL|13.5-17.5|N|||F\r\n" +
                    "OBX|2|NM|HCT^Hematocrit||43.2|%|41.0-50.0|N|||F\r\n" +
                    "OBX|3|NM|WBC^White Blood Cells||7.6|x10^3/uL|4.5-10.0|N|||F\r\n" +
                    "OBX|4|NM|PLT^Platelets||265|x10^3/uL|150-450|N|||F\r\n" +
                    "OBX|5|NM|NEUT^Neutrophils||62.0|%|50.0-70.0|N|||F\r\n" +
                    "OBX|6|NM|LYMPH^Lymphocytes||28.5|%|20.0-40.0|N|||F\r\n";
            }
            else
            {
                return header +
                    "OBX|1|NM|FBS^Fasting Blood Sugar||94.0|mg/dL|70.0-99.0|N|||F\r\n" +
                    "OBX|2|NM|CREA^Serum Creatinine||0.95|mg/dL|0.7-1.3|N|||F\r\n" +
                    "OBX|3|NM|BUN^Blood Urea Nitrogen||14.2|mg/dL|7.0-20.0|N|||F\r\n" +
                    "OBX|4|NM|CHOL^Total Cholesterol||185.0|mg/dL|<200|N|||F\r\n" +
                    "OBX|5|NM|TRIG^Triglycerides||120.0|mg/dL|<150|N|||F\r\n";
            }
        }

        // ASTM Format
        var astmHeader = $"H|\\^&|||{analyzerModel}||||||||1\r\n" +
                         $"P|1|||PAT001||Dela Cruz^Juan\r\n" +
                         $"O|1|{accessionNumber}||^^^PANEL|R||||||A\r\n";

        if (isHema)
        {
            return astmHeader +
                "R|1|^^^HGB|14.4|g/dL|13.5-17.5|N||F\r\n" +
                "R|2|^^^HCT|43.2|%|41.0-50.0|N||F\r\n" +
                "R|3|^^^RBC|4.82|x10^6/uL|4.30-5.90|N||F\r\n" +
                "R|4|^^^WBC|7.6|x10^3/uL|4.5-10.0|N||F\r\n" +
                "R|5|^^^PLT|265|x10^3/uL|150-450|N||F\r\n" +
                "R|6|^^^NEUT|62.0|%|50.0-70.0|N||F\r\n" +
                "R|7|^^^LYMPH|28.5|%|20.0-40.0|N||F\r\n" +
                "L|1|N\r\n";
        }
        else
        {
            return astmHeader +
                "R|1|^^^FBS|94.0|mg/dL|70.0-99.0|N||F\r\n" +
                "R|2|^^^CREA|0.95|mg/dL|0.7-1.3|N||F\r\n" +
                "R|3|^^^BUN|14.2|mg/dL|7.0-20.0|N||F\r\n" +
                "R|4|^^^CHOL|185.0|mg/dL|<200.0|N||F\r\n" +
                "R|5|^^^TRIG|120.0|mg/dL|<150.0|N||F\r\n" +
                "R|6|^^^SGPT_ALT|28.0|U/L|7.0-56.0|N||F\r\n" +
                "L|1|N\r\n";
        }
    }
}
