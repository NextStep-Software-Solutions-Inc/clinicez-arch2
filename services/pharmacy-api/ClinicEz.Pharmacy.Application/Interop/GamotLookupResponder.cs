using System.Collections.Specialized;
using System.Text.Json;
using System.Web;
using ClinicEz.Pharmacy.Application.Common;
using ClinicEz.Pharmacy.Application.Features.Gamot.Commands;
using ClinicEz.Pharmacy.Application.Features.Gamot.DTOs;
using ClinicEz.Pharmacy.Application.Features.Gamot.Queries;
using ClinicEz.Pharmacy.Domain.Entities;
using ClinicEz.Pharmacy.Domain.Interfaces;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Exceptions;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Handling;
using ClinicEz.Shared.Interop.Requests;
using ClinicEz.Shared.Interoperability;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Pharmacy.Application.Interop;

/// <summary>
/// <c>gamot.lookup.requested</c>: a clinic of the same tenant calls this pharmacy's GAMOT API over the hub instead of over
/// HTTP. The request is the HTTP call expressed as method, path, query and body; the reply carries the status code and JSON
/// the endpoint would have returned, in the usual <see cref="ApiResponse{T}"/> shape. The call runs in process against the
/// same application handlers the <c>/api/v1/gamot</c> controller uses; nothing is sent over HTTP.
/// <list type="bullet">
/// <item>Only a facility party of the recipient pharmacy's own tenant is answered; anyone else gets a 403 and no data is read.</item>
/// <item>The recipient (<c>To</c>) pharmacy is the scope of every read and write, never anything in the payload.</item>
/// <item>Only the GAMOT routes below exist: <c>GET formulary</c>, <c>GET ledger/{pin}</c>, <c>POST upsc/validate</c>,
/// <c>POST upsc/generate</c>, <c>POST dispense</c>, <c>POST transactions/{id}/reverse</c>. Anything else is a 404 (or 405 for a
/// known path with the wrong method); every failure is a reply, so a bad request is never redelivered.</item>
/// </list>
/// The handlers' own saves persist with the reply's outbox row; this class never saves.
/// </summary>
public sealed class GamotLookupResponder : IInteropResponder<GamotLookupRequestedPayload, GamotLookupRespondedPayload>
{
    private const string JsonContentType = "application/json";

    private static readonly JsonSerializerOptions Json = new JsonSerializerOptions(JsonSerializerDefaults.Web).UseStrictStringEnums();

    private readonly ISender _sender;
    private readonly IRepository<PharmacySettings> _settingsRepository;
    private readonly IPharmacyScopeSetter _scope;
    private readonly ILogger<GamotLookupResponder> _logger;

    public GamotLookupResponder(
        ISender sender,
        IRepository<PharmacySettings> settingsRepository,
        IPharmacyScopeSetter scope,
        ILogger<GamotLookupResponder> logger)
    {
        _sender = sender;
        _settingsRepository = settingsRepository;
        _scope = scope;
        _logger = logger;
    }

    public async Task<GamotLookupRespondedPayload> RespondAsync(
        GamotLookupRequestedPayload request,
        InteropMessageContext context,
        CancellationToken ct)
    {
        var from = context.From;
        var to = context.To;

        if (to.Kind != PartyKind.Facility
            || to.FacilityType is not null and not FacilityType.Pharmacy
            || string.IsNullOrWhiteSpace(to.TenantId)
            || !Guid.TryParse(to.FacilityId, out var pharmacyId)
            || pharmacyId == Guid.Empty)
        {
            _logger.LogWarning(
                "[GamotLookupResponder] {MessageId}: recipient {Recipient} is not a pharmacy address.",
                context.MessageId, to.Address);
            return Fail(StatusCodes.NotFound, "NOT_FOUND", "The recipient is not a pharmacy.");
        }

        if (from.Kind != PartyKind.Facility
            || string.IsNullOrWhiteSpace(from.TenantId)
            || !string.Equals(from.TenantId, to.TenantId, StringComparison.Ordinal))
        {
            _logger.LogWarning(
                "[GamotLookupResponder] {MessageId}: sender {Sender} may not query {Recipient}; refused.",
                context.MessageId, from.Address, to.Address);
            return Fail(StatusCodes.Forbidden, "FORBIDDEN", "Forbidden: this pharmacy only answers facilities of its own workspace.");
        }

        _scope.Enter(to.TenantId, pharmacyId);

        if (!await _settingsRepository.Query(s => s.PharmacyId == pharmacyId).AnyAsync(ct))
        {
            _logger.LogWarning(
                "[GamotLookupResponder] {MessageId}: {Recipient} is not a pharmacy provisioned on this server.",
                context.MessageId, to.Address);
            return Fail(StatusCodes.NotFound, "NOT_FOUND", "This pharmacy is not provisioned on this server.");
        }

        try
        {
            return await DispatchAsync(request, ct);
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception ex)
        {
            return MapFailure(ex, context);
        }
    }

    private async Task<GamotLookupRespondedPayload> DispatchAsync(GamotLookupRequestedPayload request, CancellationToken ct)
    {
        var method = request.Method?.Trim().ToUpperInvariant() ?? string.Empty;
        if (method is not ("GET" or "POST"))
            return Fail(StatusCodes.MethodNotAllowed, "METHOD_NOT_ALLOWED", "Only GET and POST are served.");

        var segments = (request.Path ?? string.Empty).Trim('/').Split('/', StringSplitOptions.RemoveEmptyEntries);
        var query = HttpUtility.ParseQueryString(request.Query ?? string.Empty);

        var route = Resolve(segments, query, request.Body, ct);
        if (route is null)
            return Fail(StatusCodes.NotFound, "NOT_FOUND", "There is no such GAMOT endpoint.");
        if (!string.Equals(route.Method, method, StringComparison.Ordinal))
            return Fail(StatusCodes.MethodNotAllowed, "METHOD_NOT_ALLOWED", $"This endpoint only accepts {route.Method}.");

        var result = await route.Run();
        return new GamotLookupRespondedPayload
        {
            StatusCode = StatusCodes.Ok,
            ContentType = JsonContentType,
            Body = JsonSerializer.Serialize(result, result.GetType(), Json)
        };
    }

    private Route? Resolve(string[] segments, NameValueCollection query, string? body, CancellationToken ct)
    {
        static string? Param(NameValueCollection query, string name) =>
            string.IsNullOrEmpty(query[name]) ? null : query[name];

        return segments.Length switch
        {
            1 when Is(segments[0], "formulary") => new Route("GET", async () =>
                await _sender.Send(new GetGamotFormularyQuery(Param(query, "search"), Param(query, "category")), ct)),

            1 when Is(segments[0], "dispense") => new Route("POST", async () =>
            {
                var r = ReadBody<DispenseGamotApiRequest>(body);
                return await _sender.Send(new DispenseGamotPrescriptionCommand(
                    r.PrescriptionOrderId, r.PharmacistName, r.PharmacistPrcLicense, r.HciAccreditationNumber,
                    r.ReceiptNumber, r.Notes, r.ManualBatchSelections), ct);
            }),

            2 when Is(segments[0], "ledger") => new Route("GET", async () =>
                await _sender.Send(new GetGamotLedgerByPinQuery(Uri.UnescapeDataString(segments[1]), Param(query, "year")), ct)),

            2 when Is(segments[0], "upsc") && Is(segments[1], "validate") => new Route("POST", async () =>
            {
                var r = ReadBody<ValidateUpscApiRequest>(body);
                return await _sender.Send(new ValidateUpscQuery(
                    r.UniquePrescriptionSecurityCode, r.HciAccreditationNumber, r.PhilHealthIdentificationNumber,
                    r.PrescriptionNumber, r.DoctorPrcLicense, r.DrugCode, r.Quantity, r.IssueDate), ct);
            }),

            2 when Is(segments[0], "upsc") && Is(segments[1], "generate") => new Route("POST", async () =>
            {
                var r = ReadBody<GenerateUpscApiRequest>(body);
                return await _sender.Send(new GenerateUpscCommand(
                    r.PrescriptionOrderId, r.PrescriptionOrderItemId, r.HciAccreditationNumber), ct);
            }),

            3 when Is(segments[0], "transactions") && Is(segments[2], "reverse") && Guid.TryParse(segments[1], out var id) =>
                new Route("POST", async () =>
                {
                    var r = ReadBody<ReverseGamotTransactionApiRequest>(body);
                    return await _sender.Send(new ReverseGamotTransactionCommand(id, r.Reason, r.ReversedBy), ct);
                }),

            _ => null
        };
    }

    private static bool Is(string segment, string expected) => string.Equals(segment, expected, StringComparison.OrdinalIgnoreCase);

    private static T ReadBody<T>(string? body) where T : class
    {
        if (string.IsNullOrWhiteSpace(body))
            throw new BadRequestException("A JSON request body is required.");

        try
        {
            return JsonSerializer.Deserialize<T>(body, Json)
                   ?? throw new BadRequestException("A JSON request body is required.");
        }
        catch (JsonException)
        {
            throw new BadRequestException("The request body is not valid for this endpoint.");
        }
    }

    private GamotLookupRespondedPayload MapFailure(Exception ex, InteropMessageContext context)
    {
        switch (ex)
        {
            case ValidationException { Errors: { } errors } validation:
                return Fail(
                    StatusCodes.BadRequest,
                    "VALIDATION_ERROR",
                    validation.Message,
                    errors.SelectMany(kvp => kvp.Value.Select(m => new ApiFieldError(kvp.Key, "VALIDATION_ERROR", m))).ToList());
            case ValidationException validation:
                return Fail(StatusCodes.BadRequest, "VALIDATION_ERROR", validation.Message);
            case BadRequestException:
                return Fail(StatusCodes.BadRequest, "BAD_REQUEST", ex.Message);
            case UnauthorizedException:
                return Fail(StatusCodes.Unauthorized, "UNAUTHORIZED", ex.Message);
            case ForbiddenException:
                return Fail(StatusCodes.Forbidden, "FORBIDDEN", ex.Message);
            case NotFoundException:
                return Fail(StatusCodes.NotFound, "NOT_FOUND", ex.Message);
            case PharmacyConflictException conflict:
                return Fail(StatusCodes.Conflict, conflict.Code, ex.Message);
            case ConflictException:
                return Fail(StatusCodes.Conflict, "CONFLICT", ex.Message);
            case TooManyRequestsException:
                return Fail(StatusCodes.TooManyRequests, "TOO_MANY_REQUESTS", ex.Message);
            case ServiceUnavailableException:
                return Fail(StatusCodes.ServiceUnavailable, "SERVICE_UNAVAILABLE", ex.Message);
            default:
                _logger.LogError(
                    "[GamotLookupResponder] {MessageId}: the request failed unexpectedly ({ExceptionType}).",
                    context.MessageId, ex.GetType().Name);
                return Fail(StatusCodes.InternalServerError, "INTERNAL_ERROR", "The pharmacy could not process the request.");
        }
    }

    private static GamotLookupRespondedPayload Fail(int status, string code, string message, IReadOnlyList<ApiFieldError>? errors = null) =>
        new()
        {
            StatusCode = status,
            ContentType = JsonContentType,
            Body = JsonSerializer.Serialize(
                ApiResponse<object>.Fail(message, errors ?? [new ApiFieldError(null, code, message)]),
                Json)
        };

    private sealed record Route(string Method, Func<Task<object>> Run);

    private static class StatusCodes
    {
        public const int Ok = 200;
        public const int BadRequest = 400;
        public const int Unauthorized = 401;
        public const int Forbidden = 403;
        public const int NotFound = 404;
        public const int MethodNotAllowed = 405;
        public const int Conflict = 409;
        public const int TooManyRequests = 429;
        public const int InternalServerError = 500;
        public const int ServiceUnavailable = 503;
    }
}
