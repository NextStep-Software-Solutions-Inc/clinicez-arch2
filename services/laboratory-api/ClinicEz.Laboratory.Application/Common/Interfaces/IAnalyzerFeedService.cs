using System;
using System.Collections.Generic;

namespace ClinicEz.Laboratory.Application.Common.Interfaces;

public record ParsedAnalyzerObservation(
    string AnalyteCode,
    string AnalyteName,
    string Value,
    string Unit,
    string? Flag = null
);

public record ParsedAnalyzerPacket(
    string Protocol,
    string AnalyzerId,
    string AccessionNumber,
    DateTime Timestamp,
    List<ParsedAnalyzerObservation> Observations
);

public interface IAnalyzerFeedService
{
    ParsedAnalyzerPacket ParseFeed(string rawPayload, string? protocolHint = null);
    string GenerateSimulationPayload(string analyzerModel, string accessionNumber, string format = "ASTM");
}
