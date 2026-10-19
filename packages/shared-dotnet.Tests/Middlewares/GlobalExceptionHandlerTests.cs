using System.Diagnostics;
using System.Net;
using System.Text.Json;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Exceptions;
using ClinicEz.Shared.Middlewares;
using FluentAssertions;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Npgsql;
using NSubstitute;
using Xunit;

namespace ClinicEz.Shared.Tests.Middlewares;

public class GlobalExceptionHandlerTests
{
    private static (DefaultHttpContext context, MemoryStream body) CreateHttpContext(string? traceIdentifier = null)
    {
        var context = new DefaultHttpContext();
        if (!string.IsNullOrEmpty(traceIdentifier))
        {
            context.TraceIdentifier = traceIdentifier;
        }
        var stream = new MemoryStream();
        context.Response.Body = stream;
        return (context, stream);
    }

    private static async Task<ApiResponse<JsonElement>?> ReadResponseAsync(MemoryStream stream)
    {
        stream.Seek(0, SeekOrigin.Begin);
        var json = await new StreamReader(stream).ReadToEndAsync();
        return JsonSerializer.Deserialize<ApiResponse<JsonElement>>(json, new JsonSerializerOptions
        {
            PropertyNameCaseInsensitive = true
        });
    }

    private static PostgresException CreatePostgresException(string sqlState, string? detail = null, string? constraint = null, string? column = null)
    {
        return new PostgresException(
            messageText: "Database error",
            severity: "ERROR",
            invariantSeverity: "ERROR",
            sqlState: sqlState,
            detail: detail,
            hint: null,
            position: 0,
            internalPosition: 0,
            internalQuery: null,
            where: null,
            schemaName: "public",
            tableName: "Patients",
            columnName: column,
            dataTypeName: null,
            constraintName: constraint,
            file: null,
            line: null,
            routine: null);
    }

    [Fact]
    public async Task TryHandleAsync_DatabaseException_UniqueViolation_MapsTo409WithTraceIdAndLogsError()
    {
        var logger = Substitute.For<ILogger<GlobalExceptionHandler>>();
        var handler = new GlobalExceptionHandler(logger);
        var (context, stream) = CreateHttpContext("TRACE-CONN-409");

        var pgEx = CreatePostgresException("23505", detail: "Key (clinic_id, patient_code)=(1, PAT-2026-00001) already exists.", constraint: "IX_Patients_PatientCode");
        var dbEx = new DbUpdateException("An error occurred while saving the entity changes. See the inner exception for details.", pgEx);

        var handled = await handler.TryHandleAsync(context, dbEx, CancellationToken.None);

        handled.Should().BeTrue();
        context.Response.StatusCode.Should().Be((int)HttpStatusCode.Conflict);

        var payload = await ReadResponseAsync(stream);
        payload.Should().NotBeNull();
        payload!.Succeeded.Should().BeFalse();
        payload.ErrorCode.Should().Be("DUPLICATE_PATIENT_CODE");
        payload.TraceId.Should().Be("TRACE-CONN-409");
        payload.Message.Should().Be("A patient with this code already exists. Please refresh or retry.");
        payload.Errors.Should().HaveCount(1);
        payload.Errors[0].Field.Should().Be("patientCode");

        // Verify logger called with LogError
        logger.ReceivedWithAnyArgs(1).Log(
            LogLevel.Error,
            Arg.Any<EventId>(),
            Arg.Any<object>(),
            dbEx,
            Arg.Any<Func<object, Exception?, string>>());
    }

    [Fact]
    public async Task TryHandleAsync_DatabaseException_ConcurrencyConflict_MapsTo409WithTraceId()
    {
        var logger = Substitute.For<ILogger<GlobalExceptionHandler>>();
        var handler = new GlobalExceptionHandler(logger);
        var (context, stream) = CreateHttpContext("TRACE-CONCURRENCY");

        var concEx = new DbUpdateConcurrencyException("Concurrency clash");

        var handled = await handler.TryHandleAsync(context, concEx, CancellationToken.None);

        handled.Should().BeTrue();
        context.Response.StatusCode.Should().Be((int)HttpStatusCode.Conflict);

        var payload = await ReadResponseAsync(stream);
        payload.Should().NotBeNull();
        payload!.ErrorCode.Should().Be("CONCURRENCY_CONFLICT");
        payload.TraceId.Should().Be("TRACE-CONCURRENCY");
        payload.Message.Should().Contain("modified or deleted by another operation");
    }

    [Fact]
    public async Task TryHandleAsync_GenericDbUpdateException_SanitizesMessageAndDoesNotLeakRawOrmStrings()
    {
        var logger = Substitute.For<ILogger<GlobalExceptionHandler>>();
        var handler = new GlobalExceptionHandler(logger);
        var (context, stream) = CreateHttpContext("TRACE-SAFE-500");

        const string rawOrmMessage = "An error occurred while saving the entity changes. See the inner exception for details.";
        var dbEx = new DbUpdateException(rawOrmMessage, new Exception("Deadlock detected"));

        var handled = await handler.TryHandleAsync(context, dbEx, CancellationToken.None);

        handled.Should().BeTrue();
        context.Response.StatusCode.Should().Be((int)HttpStatusCode.InternalServerError);

        var payload = await ReadResponseAsync(stream);
        payload.Should().NotBeNull();
        payload!.ErrorCode.Should().Be("DATABASE_ERROR");
        payload.TraceId.Should().Be("TRACE-SAFE-500");
        payload.Message.Should().NotContain(rawOrmMessage);
        payload.Message.Should().Contain("TRACE-SAFE-500");
        payload.Errors[0].Message.Should().NotContain(rawOrmMessage);
        payload.Errors[0].Message.Should().Contain("TRACE-SAFE-500");
    }

    [Fact]
    public async Task TryHandleAsync_ValidationException_Returns400WithFieldAttributionAndTraceId()
    {
        var logger = Substitute.For<ILogger<GlobalExceptionHandler>>();
        var handler = new GlobalExceptionHandler(logger);
        var (context, stream) = CreateHttpContext("TRACE-VAL-400");

        var validationErrors = new Dictionary<string, string[]>
        {
            { "patientName", ["Patient name is required."] },
            { "chiefComplaint", ["Chief complaint must not exceed 255 characters."] }
        };
        var vex = new ValidationException("One or more validation errors occurred.", validationErrors);

        var handled = await handler.TryHandleAsync(context, vex, CancellationToken.None);

        handled.Should().BeTrue();
        context.Response.StatusCode.Should().Be((int)HttpStatusCode.BadRequest);

        var payload = await ReadResponseAsync(stream);
        payload.Should().NotBeNull();
        payload!.ErrorCode.Should().Be("VALIDATION_ERROR");
        payload.TraceId.Should().Be("TRACE-VAL-400");
        payload.Errors.Should().HaveCount(2);
        payload.Errors.Should().Contain(e => e.Field == "patientName" && e.Message == "Patient name is required.");
        payload.Errors.Should().Contain(e => e.Field == "chiefComplaint" && e.Message == "Chief complaint must not exceed 255 characters.");
    }

    [Fact]
    public async Task TryHandleAsync_NotFoundException_Returns404WithTraceId()
    {
        var logger = Substitute.For<ILogger<GlobalExceptionHandler>>();
        var handler = new GlobalExceptionHandler(logger);
        var (context, stream) = CreateHttpContext("TRACE-NOTFOUND");

        var notFoundEx = new NotFoundException("Patient with ID '123' was not found.");

        var handled = await handler.TryHandleAsync(context, notFoundEx, CancellationToken.None);

        handled.Should().BeTrue();
        context.Response.StatusCode.Should().Be((int)HttpStatusCode.NotFound);

        var payload = await ReadResponseAsync(stream);
        payload.Should().NotBeNull();
        payload!.ErrorCode.Should().Be("NOT_FOUND");
        payload.TraceId.Should().Be("TRACE-NOTFOUND");
        payload.Message.Should().Be("Patient with ID '123' was not found.");
    }

    [Fact]
    public async Task TryHandleAsync_UnhandledServerException_Returns500WithSafeMessageAndTraceId()
    {
        var logger = Substitute.For<ILogger<GlobalExceptionHandler>>();
        var handler = new GlobalExceptionHandler(logger);
        var (context, stream) = CreateHttpContext("TRACE-UNHANDLED-500");

        var unexpectedEx = new InvalidOperationException("Fatal internal null pointer state");

        var handled = await handler.TryHandleAsync(context, unexpectedEx, CancellationToken.None);

        handled.Should().BeTrue();
        context.Response.StatusCode.Should().Be((int)HttpStatusCode.InternalServerError);

        var payload = await ReadResponseAsync(stream);
        payload.Should().NotBeNull();
        payload!.ErrorCode.Should().Be("INTERNAL_ERROR");
        payload.TraceId.Should().Be("TRACE-UNHANDLED-500");
        payload.Message.Should().Be("An unexpected server error occurred. Support Reference: TRACE-UNHANDLED-500");
        payload.Errors[0].Message.Should().Be("An unexpected server error occurred. Support Reference: TRACE-UNHANDLED-500");

        // Logger should receive LogError
        logger.ReceivedWithAnyArgs(1).Log(
            LogLevel.Error,
            Arg.Any<EventId>(),
            Arg.Any<object>(),
            unexpectedEx,
            Arg.Any<Func<object, Exception?, string>>());
    }

    [Fact]
    public async Task TryHandleAsync_ActivityCurrent_PreferredOverTraceIdentifier()
    {
        var handler = new GlobalExceptionHandler();
        var (context, stream) = CreateHttpContext("fallback-identifier");

        using var activity = new Activity("TestActivity");
        activity.SetIdFormat(ActivityIdFormat.W3C);
        activity.Start();

        var ex = new BadRequestException("Bad request payload");

        var handled = await handler.TryHandleAsync(context, ex, CancellationToken.None);

        handled.Should().BeTrue();

        var payload = await ReadResponseAsync(stream);
        payload.Should().NotBeNull();
        payload!.TraceId.Should().Be(activity.Id);
        context.Response.Headers["X-Correlation-ID"].ToString().Should().Be(activity.Id);
    }

    [Fact]
    public async Task TryHandleAsync_XCorrelationIdHeader_PreferredOverTraceIdentifier()
    {
        var handler = new GlobalExceptionHandler();
        var (context, stream) = CreateHttpContext("kestrel-internal-001");
        context.Request.Headers["X-Correlation-ID"] = "client-correlation-789";

        var ex = new BadRequestException("Invalid format");
        var handled = await handler.TryHandleAsync(context, ex, CancellationToken.None);

        handled.Should().BeTrue();

        var payload = await ReadResponseAsync(stream);
        payload.Should().NotBeNull();
        payload!.TraceId.Should().Be("client-correlation-789");
        context.TraceIdentifier.Should().Be("client-correlation-789");
        context.Response.Headers["X-Correlation-ID"].ToString().Should().Be("client-correlation-789");
    }

    [Fact]
    public async Task TryHandleAsync_XRequestIdHeader_PreferredOverTraceIdentifier()
    {
        var handler = new GlobalExceptionHandler();
        var (context, stream) = CreateHttpContext("kestrel-internal-002");
        context.Request.Headers["X-Request-ID"] = "gateway-req-456";

        var ex = new NotFoundException("Not found");
        var handled = await handler.TryHandleAsync(context, ex, CancellationToken.None);

        handled.Should().BeTrue();

        var payload = await ReadResponseAsync(stream);
        payload.Should().NotBeNull();
        payload!.TraceId.Should().Be("gateway-req-456");
        context.TraceIdentifier.Should().Be("gateway-req-456");
        context.Response.Headers["X-Correlation-ID"].ToString().Should().Be("gateway-req-456");
    }

    [Fact]
    public async Task TryHandleAsync_TraceIdentifier_UsedWhenNoHeadersOrActivity()
    {
        var handler = new GlobalExceptionHandler();
        var (context, stream) = CreateHttpContext("standalone-trace-123");

        var ex = new ConflictException("Conflict occurred");
        var handled = await handler.TryHandleAsync(context, ex, CancellationToken.None);

        handled.Should().BeTrue();

        var payload = await ReadResponseAsync(stream);
        payload.Should().NotBeNull();
        payload!.TraceId.Should().Be("standalone-trace-123");
        context.Response.Headers["X-Correlation-ID"].ToString().Should().Be("standalone-trace-123");
    }

    [Fact]
    public void ResolveTraceId_WhenTraceIdentifierEmpty_SynchronizesFallbackId()
    {
        var context = new DefaultHttpContext();
        context.TraceIdentifier = "";

        var resolved = GlobalExceptionHandler.ResolveTraceId(context);

        resolved.Should().NotBeNullOrWhiteSpace();
        context.TraceIdentifier.Should().Be(resolved);
    }
}
