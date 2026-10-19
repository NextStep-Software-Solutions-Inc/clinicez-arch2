namespace ClinicEz.Shared.Interoperability;

// Request/reply contracts carried over the interop hub in place of direct service-to-service HTTP.
// A request and its reply share the same envelope CorrelationId. Bodies are raw JSON text so a service can pass
// a controller-shaped document through unchanged; the DTO types behind them stay in the owning services.

/// <summary>
/// Clinic -> pharmacy (<c>InteropTypes.GamotLookupRequested</c>). One read-only call into the pharmacy's GAMOT
/// drug reference API, expressed as the HTTP call it replaces. <c>To</c> is the pharmacy facility of the clinic's
/// tenant; the pharmacy answers only for senders of its own tenant.
/// </summary>
public sealed record GamotLookupRequestedPayload
{
    /// <summary>HTTP method, upper case. Only <c>GET</c> and <c>POST</c> are served.</summary>
    public string Method { get; init; } = "GET";

    /// <summary>Path below <c>/api/v1/gamot/</c>, without a leading slash (for example <c>drugs/search</c>).</summary>
    public string Path { get; init; } = string.Empty;

    /// <summary>Raw query string without the leading <c>?</c> (null when none).</summary>
    public string? Query { get; init; }

    /// <summary>Raw JSON request body for <c>POST</c> (null when none).</summary>
    public string? Body { get; init; }
}

/// <summary>Pharmacy -> clinic (<c>InteropTypes.GamotLookupResponded</c>). What the HTTP endpoint would have returned.</summary>
public sealed record GamotLookupRespondedPayload
{
    public int StatusCode { get; init; } = 200;
    public string? ContentType { get; init; }

    /// <summary>Response body text (JSON), null when empty.</summary>
    public string? Body { get; init; }
}

/// <summary>
/// The operations of <see cref="PhilHealthRequestPayload.Operation"/>. Each maps to one endpoint of the PhilHealth proxy;
/// the tenant and facility the operation acts for are always the verified envelope <c>From</c>, never a payload field.
/// </summary>
public static class PhilHealthOperations
{
    /// <summary>Validate a YAKAP report. <c>Body</c>: report JSON.</summary>
    public const string YakapReportValidate = "yakap.report.validate";
    /// <summary>Submit a YAKAP report. <c>Body</c>: report JSON.</summary>
    public const string YakapReportSubmit = "yakap.report.submit";
    /// <summary>Extract the masterlist. <c>Body</c>: request JSON.</summary>
    public const string YakapMasterlistExtract = "yakap.masterlist.extract";
    /// <summary>Validate a member PIN. <c>Argument</c>: the PIN.</summary>
    public const string YakapPinValidate = "yakap.pin.validate";
    /// <summary>Run the SOAP sandbox end to end. <c>Body</c>: request JSON.</summary>
    public const string SoapSandboxRun = "soap-sandbox.run";
    public const string SoapSandboxStatus = "soap-sandbox.status";
    /// <summary>Select a sandbox scenario. <c>Body</c>: request JSON.</summary>
    public const string SoapSandboxScenario = "soap-sandbox.scenario";
    public const string SoapSandboxReset = "soap-sandbox.reset";
    /// <summary>Store the facility's PhilHealth credentials. <c>Body</c>: configuration JSON.</summary>
    public const string TenantConfigure = "tenant.configure";
    public const string TenantStatus = "tenant.status";
    public const string TenantTestConnection = "tenant.test-connection";

    public static readonly IReadOnlyList<string> All =
    [
        YakapReportValidate, YakapReportSubmit, YakapMasterlistExtract, YakapPinValidate,
        SoapSandboxRun, SoapSandboxStatus, SoapSandboxScenario, SoapSandboxReset,
        TenantConfigure, TenantStatus, TenantTestConnection
    ];
}

/// <summary>
/// Facility (clinic) -> PhilHealth proxy (<c>InteropTypes.PhilHealthRequest</c>, <c>To</c> =
/// <c>Party.PhilHealth</c>, a platform service in the cloud cell). Facility clients may address the proxy only with this type.
/// </summary>
public sealed record PhilHealthRequestPayload
{
    /// <summary>One of <see cref="PhilHealthOperations"/>.</summary>
    public string Operation { get; init; } = string.Empty;

    /// <summary>Single scalar argument (the PIN for <see cref="PhilHealthOperations.YakapPinValidate"/>).</summary>
    public string? Argument { get; init; }

    /// <summary>Raw JSON body of the operation, when it takes one.</summary>
    public string? Body { get; init; }
}

/// <summary>PhilHealth proxy -> requesting facility (<c>InteropTypes.PhilHealthResponse</c>). The proxy's endpoint result.</summary>
public sealed record PhilHealthResponsePayload
{
    /// <summary>The HTTP status the endpoint would have returned (200, 400, 404, 502, ...).</summary>
    public int StatusCode { get; init; } = 200;

    /// <summary>The endpoint's JSON response body (an <c>ApiResponse&lt;T&gt;</c> document), null when empty.</summary>
    public string? Body { get; init; }
}

/// <summary>A facility's PhilHealth credentials. Secret-bearing: only ever addressed to the proxy (or to the portal that owns it).</summary>
public sealed record PhilHealthConfigPayload
{
    public string TenantId { get; init; } = string.Empty;

    /// <summary>The facility (branch) the settings belong to; null for tenant-level settings.</summary>
    public string? BranchId { get; init; }

    public string FacilityName { get; init; } = string.Empty;
    public string AccreditationNumber { get; init; } = string.Empty;
    public string PmccNumber { get; init; } = string.Empty;
    public string SoftwareCertificateId { get; init; } = string.Empty;
    public string Username { get; init; } = string.Empty;
    public string Password { get; init; } = string.Empty;
    public string CipherKey { get; init; } = string.Empty;
    public string KonsultaEndpoint { get; init; } = string.Empty;
    public bool IsActive { get; init; }
}

/// <summary>PhilHealth proxy -> portal (<c>InteropTypes.PhilHealthConfigRequested</c>, From = <c>Party.PhilHealth</c>). Asks for a facility's credentials.</summary>
public sealed record PhilHealthConfigRequestedPayload
{
    public string TenantId { get; init; } = string.Empty;
    public string? BranchId { get; init; }
}

/// <summary>Portal -> PhilHealth proxy (<c>InteropTypes.PhilHealthConfigResponded</c>). Addressed to the proxy only.</summary>
public sealed record PhilHealthConfigRespondedPayload
{
    public bool Found { get; init; }

    /// <summary>The credentials, present when <see cref="Found"/>.</summary>
    public PhilHealthConfigPayload? Config { get; init; }
}

/// <summary>
/// PhilHealth proxy -> portal (<c>InteropTypes.PhilHealthConfigUpsertRequested</c>, From = <c>Party.PhilHealth</c>). Payload:
/// <see cref="PhilHealthConfigPayload"/>. The portal stores the credentials and answers with
/// <see cref="PhilHealthConfigUpsertRespondedPayload"/>.
/// </summary>
public sealed record PhilHealthConfigUpsertRespondedPayload
{
    public bool Succeeded { get; init; }

    /// <summary>A short, secret-free explanation when not <see cref="Succeeded"/>.</summary>
    public string? Message { get; init; }
}

/// <summary>
/// Portal -> clinic (<c>InteropTypes.YakapTransmittalRequested</c>). Request payload for YAKAP transmittal operations
/// (encounters, transmittals, compilation, DTD validation, XML retrieval, and PhilHealth submission).
/// </summary>
public sealed record YakapTransmittalRequestedPayload
{
    /// <summary>HTTP method, upper case (GET or POST).</summary>
    public string Method { get; init; } = "GET";

    /// <summary>Relative operation path below <c>api/v1/yakap/</c> (e.g. <c>encounters/eligible</c>, <c>transmittals</c>, <c>transmittals/{id}/xml</c>).</summary>
    public string Path { get; init; } = string.Empty;

    /// <summary>Query string without leading <c>?</c> (e.g. <c>reportTagging=2&amp;branchId=...</c>).</summary>
    public string? Query { get; init; }

    /// <summary>JSON body for POST operations (e.g. CreateTransmittalPayload).</summary>
    public string? Body { get; init; }
}

/// <summary>Clinic -> portal (<c>InteropTypes.YakapTransmittalResponded</c>). Result of the YAKAP operation.</summary>
public sealed record YakapTransmittalRespondedPayload
{
    public int StatusCode { get; init; } = 200;
    public string? ContentType { get; init; } = "application/json";

    /// <summary>Response body text (JSON), carrying the usual ApiResponse envelope.</summary>
    public string? Body { get; init; }
}

