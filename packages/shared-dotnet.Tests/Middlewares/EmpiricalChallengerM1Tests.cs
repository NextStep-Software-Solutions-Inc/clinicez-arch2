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

public class EmpiricalChallengerM1Tests
{
    private static (DefaultHttpContext context, MemoryStream body) CreateHttpContext(string? traceIdentifier = null)
    {
        var context = new DefaultHttpContext();
        if (traceIdentifier != null)
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

    private static PostgresException CreatePgEx(
        string sqlState,
        string messageText = "Database error",
        string? detail = null,
        string? constraint = null,
        string? column = null)
    {
        return new PostgresException(
            messageText: messageText,
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
            tableName: "TestTable",
            columnName: column,
            dataTypeName: null,
            constraintName: constraint,
            file: null,
            line: null,
            routine: null);
    }

    #region Objective 1: Status Codes & Mappings

    [Theory]
    [InlineData("23505", (int)HttpStatusCode.Conflict, "DUPLICATE_RESOURCE")]
    [InlineData("22001", (int)HttpStatusCode.BadRequest, "FIELD_TOO_LONG")]
    [InlineData("23503", (int)HttpStatusCode.Conflict, "FOREIGN_KEY_VIOLATION")]
    [InlineData("23502", (int)HttpStatusCode.BadRequest, "REQUIRED_FIELD_MISSING")]
    [InlineData("23P01", (int)HttpStatusCode.Conflict, "EXCLUSION_VIOLATION")]
    [InlineData("08006", (int)HttpStatusCode.InternalServerError, "DATABASE_ERROR")]
    [InlineData("42P01", (int)HttpStatusCode.InternalServerError, "DATABASE_ERROR")]
    [InlineData("40001", (int)HttpStatusCode.InternalServerError, "DATABASE_ERROR")]
    public async Task StatusCodes_PostgreSqlErrors_MatchSpecification(
        string sqlState,
        int expectedStatus,
        string expectedErrorCode)
    {
        var handler = new GlobalExceptionHandler();
        var (context, stream) = CreateHttpContext("TRACE-TEST-SQLSTATE");

        var pgEx = CreatePgEx(sqlState, detail: "Key (email)=(test@example.com) already exists.");
        var dbEx = new DbUpdateException("An error occurred while saving the entity changes.", pgEx);

        var handled = await handler.TryHandleAsync(context, dbEx, CancellationToken.None);

        handled.Should().BeTrue();
        context.Response.StatusCode.Should().Be(expectedStatus);

        var response = await ReadResponseAsync(stream);
        response.Should().NotBeNull();
        response!.Succeeded.Should().BeFalse();
        response.ErrorCode.Should().Be(expectedErrorCode);
    }

    [Fact]
    public async Task StatusCodes_PostgreSql23505_PatientCodeConstraint_MapsToDuplicatePatientCode()
    {
        var handler = new GlobalExceptionHandler();
        var (context, stream) = CreateHttpContext("TRACE-TEST-PATIENTCODE");

        var pgEx = CreatePgEx("23505",
            constraint: "IX_ClinicPatients_ClinicId_PatientCode",
            detail: "Key (clinic_id, patient_code)=(100, PAT-2026-00042) already exists.");
        var dbEx = new DbUpdateException("An error occurred while saving the entity changes.", pgEx);

        var handled = await handler.TryHandleAsync(context, dbEx, CancellationToken.None);

        handled.Should().BeTrue();
        context.Response.StatusCode.Should().Be((int)HttpStatusCode.Conflict);

        var response = await ReadResponseAsync(stream);
        response.Should().NotBeNull();
        response!.ErrorCode.Should().Be("DUPLICATE_PATIENT_CODE");
        response.Errors[0].Field.Should().Be("patientCode");
    }

    [Fact]
    public async Task StatusCodes_DbUpdateConcurrencyException_MapsTo409Conflict()
    {
        var handler = new GlobalExceptionHandler();
        var (context, stream) = CreateHttpContext("TRACE-CONCURRENCY-409");

        var concEx = new DbUpdateConcurrencyException("Concurrency conflict in entity update");

        var handled = await handler.TryHandleAsync(context, concEx, CancellationToken.None);

        handled.Should().BeTrue();
        context.Response.StatusCode.Should().Be((int)HttpStatusCode.Conflict);

        var response = await ReadResponseAsync(stream);
        response.Should().NotBeNull();
        response!.ErrorCode.Should().Be("CONCURRENCY_CONFLICT");
        response.Errors.Should().Contain(e => e.Code == "CONCURRENCY_CONFLICT");
    }

    [Fact]
    public async Task StatusCodes_GenericDbUpdateException_MapsTo500InternalServerError()
    {
        var handler = new GlobalExceptionHandler();
        var (context, stream) = CreateHttpContext("TRACE-GENERIC-500");

        var dbEx = new DbUpdateException(
            "An error occurred while saving the entity changes. See the inner exception for details.",
            new InvalidOperationException("Failed socket connection to DB node"));

        var handled = await handler.TryHandleAsync(context, dbEx, CancellationToken.None);

        handled.Should().BeTrue();
        context.Response.StatusCode.Should().Be((int)HttpStatusCode.InternalServerError);

        var response = await ReadResponseAsync(stream);
        response.Should().NotBeNull();
        response!.ErrorCode.Should().Be("DATABASE_ERROR");
    }

    #endregion

    #region Objective 2: TraceId Population

    [Fact]
    public async Task TraceId_DefaultHttpContext_IsAlwaysPopulatedInResponse()
    {
        var handler = new GlobalExceptionHandler();
        var (context, stream) = CreateHttpContext(); // No explicit traceIdentifier provided

        context.TraceIdentifier.Should().NotBeNullOrWhiteSpace();

        var dbEx = new DbUpdateException(
            "An error occurred while saving the entity changes.",
            CreatePgEx("23505", detail: "Key (email)=(x@y.com) already exists."));

        var handled = await handler.TryHandleAsync(context, dbEx, CancellationToken.None);

        handled.Should().BeTrue();

        var response = await ReadResponseAsync(stream);
        response.Should().NotBeNull();
        response!.TraceId.Should().NotBeNullOrWhiteSpace();
        response.TraceId.Should().Be(context.TraceIdentifier);
    }

    [Fact]
    public async Task TraceId_ActivityCurrent_TakesPrecedenceAndIsPopulated()
    {
        var handler = new GlobalExceptionHandler();
        var (context, stream) = CreateHttpContext("fallback-identifier");

        using var activity = new Activity("ChallengerActivity");
        activity.SetIdFormat(ActivityIdFormat.W3C);
        activity.Start();

        var dbEx = new DbUpdateException(
            "An error occurred while saving the entity changes.",
            CreatePgEx("22001", column: "Notes"));

        var handled = await handler.TryHandleAsync(context, dbEx, CancellationToken.None);

        handled.Should().BeTrue();

        var response = await ReadResponseAsync(stream);
        response.Should().NotBeNull();
        response!.TraceId.Should().Be(activity.Id);
    }

    [Fact]
    public async Task TraceId_WhenTraceIdentifierIsEmpty_ShouldBePopulatedFallback()
    {
        var handler = new GlobalExceptionHandler();
        var (context, stream) = CreateHttpContext("");
        context.TraceIdentifier = "";

        var dbEx = new DbUpdateException(
            "An error occurred while saving the entity changes.",
            CreatePgEx("23505", detail: "Key (email)=(x@y.com) already exists."));

        var handled = await handler.TryHandleAsync(context, dbEx, CancellationToken.None);

        handled.Should().BeTrue();

        var response = await ReadResponseAsync(stream);
        response.Should().NotBeNull();
        response!.TraceId.Should().NotBeNullOrWhiteSpace("traceId must always be populated in response");
    }

    [Fact]
    public async Task TraceId_WhenTraceIdentifierIsWhitespace_ShouldBePopulatedFallback()
    {
        var handler = new GlobalExceptionHandler();
        var (context, stream) = CreateHttpContext("   ");
        context.TraceIdentifier = "   ";

        var dbEx = new DbUpdateException(
            "An error occurred while saving the entity changes.",
            CreatePgEx("23505", detail: "Key (email)=(x@y.com) already exists."));

        var handled = await handler.TryHandleAsync(context, dbEx, CancellationToken.None);

        handled.Should().BeTrue();

        var response = await ReadResponseAsync(stream);
        response.Should().NotBeNull();
        response!.TraceId.Should().NotBeNullOrWhiteSpace("traceId must always be populated in response");
        response.TraceId.Should().NotBe("   ");
        context.TraceIdentifier.Should().NotBe("   ");
        context.TraceIdentifier.Should().Be(response.TraceId);
    }

    #endregion

    #region Objective 3: No Raw ORM Strings Leaked

    [Theory]
    [InlineData("An error occurred while saving the entity changes. See the inner exception for details.")]
    [InlineData("An error occurred while saving the entity changes.")]
    [InlineData("Microsoft.EntityFrameworkCore.DbUpdateException: An error occurred while saving the entity changes.")]
    public async Task RawOrmMessages_AreNeverEmittedInResponsePayload(string rawOrmSnippet)
    {
        var handler = new GlobalExceptionHandler();
        var (context, stream) = CreateHttpContext("TRACE-LEAK-AUDIT");

        var dbEx = new DbUpdateException(rawOrmSnippet, new InvalidOperationException("Connection timeout"));

        var handled = await handler.TryHandleAsync(context, dbEx, CancellationToken.None);

        handled.Should().BeTrue();

        stream.Seek(0, SeekOrigin.Begin);
        var rawResponseJson = await new StreamReader(stream).ReadToEndAsync();

        rawResponseJson.Should().NotContain("An error occurred while saving the entity changes");
        rawResponseJson.Should().NotContain("See the inner exception for details");

        var response = await ReadResponseAsync(new MemoryStream(System.Text.Encoding.UTF8.GetBytes(rawResponseJson)));
        response.Should().NotBeNull();
        response!.ErrorCode.Should().Be("DATABASE_ERROR");
        response.Message.Should().NotContain("An error occurred while saving the entity changes");
        response.TraceId.Should().Be("TRACE-LEAK-AUDIT");
    }

    [Fact]
    public async Task RawOrmMessages_InDomainException_AreSanitized()
    {
        var handler = new GlobalExceptionHandler();
        var (context, stream) = CreateHttpContext("TRACE-DOMAIN-LEAK");

        var domainEx = new BadRequestException("An error occurred while saving the entity changes. See the inner exception for details.");

        var handled = await handler.TryHandleAsync(context, domainEx, CancellationToken.None);

        handled.Should().BeTrue();

        stream.Seek(0, SeekOrigin.Begin);
        var rawResponseJson = await new StreamReader(stream).ReadToEndAsync();

        rawResponseJson.Should().NotContain("An error occurred while saving the entity changes");
        rawResponseJson.Should().NotContain("See the inner exception for details");
    }

    [Fact]
    public async Task RawOrmMessages_InUnhandled500Exception_AreSanitized()
    {
        var handler = new GlobalExceptionHandler();
        var (context, stream) = CreateHttpContext("TRACE-UNHANDLED-LEAK");

        var unhandledEx = new InvalidOperationException("An error occurred while saving the entity changes: table lock timeout.");

        var handled = await handler.TryHandleAsync(context, unhandledEx, CancellationToken.None);

        handled.Should().BeTrue();

        stream.Seek(0, SeekOrigin.Begin);
        var rawResponseJson = await new StreamReader(stream).ReadToEndAsync();

        rawResponseJson.Should().NotContain("An error occurred while saving the entity changes");
        rawResponseJson.Should().Contain("TRACE-UNHANDLED-LEAK");
    }

    #endregion

    #region Stress Testing & Edge Cases

    [Fact]
    public async Task StressTest_DeepNestedExceptionWithMultipleWrappers_ExtractsPostgreSqlError()
    {
        var handler = new GlobalExceptionHandler();
        var (context, stream) = CreateHttpContext("TRACE-DEEP-WRAPPER");

        var pgEx = CreatePgEx("23505", detail: "Key (clinic_id, national_id)=(9, PH-123456) already exists.");
        var dbEx = new DbUpdateException("EF Core message", pgEx);
        var appEx = new InvalidOperationException("Application service failure", dbEx);
        var pipelineEx = new Exception("Pipeline error", appEx);

        var handled = await handler.TryHandleAsync(context, pipelineEx, CancellationToken.None);

        handled.Should().BeTrue();
        context.Response.StatusCode.Should().Be((int)HttpStatusCode.Conflict);

        var response = await ReadResponseAsync(stream);
        response.Should().NotBeNull();
        response!.ErrorCode.Should().Be("DUPLICATE_RESOURCE");
        response.Errors[0].Field.Should().Be("nationalId");
    }

    [Fact]
    public async Task StressTest_CompositeUniqueConstraintWithTenantId_StripsTenantId()
    {
        var handler = new GlobalExceptionHandler();
        var (context, stream) = CreateHttpContext("TRACE-TENANT-STRIP");

        var pgEx = CreatePgEx("23505", detail: "Key (tenant_id, appointment_number)=(org_abc, APT-0099) already exists.");
        var dbEx = new DbUpdateException("EF Core", pgEx);

        var handled = await handler.TryHandleAsync(context, dbEx, CancellationToken.None);

        handled.Should().BeTrue();

        var response = await ReadResponseAsync(stream);
        response.Should().NotBeNull();
        response!.Errors[0].Field.Should().Be("appointmentNumber");
    }

    [Fact]
    public async Task StressTest_PostgreSqlConstraintName_CompoundPascalCase()
    {
        var handler = new GlobalExceptionHandler();
        var (context, stream) = CreateHttpContext("TRACE-CONSTRAINT-NAME");

        var pgEx = CreatePgEx("23505", constraint: "IX_PatientAllergies_ClinicId_AllergenName");
        var dbEx = new DbUpdateException("EF Core", pgEx);

        var handled = await handler.TryHandleAsync(context, dbEx, CancellationToken.None);

        handled.Should().BeTrue();

        var response = await ReadResponseAsync(stream);
        response.Should().NotBeNull();
        response!.Errors[0].Field.Should().Be("allergenName");
    }

    [Fact]
    public async Task AggregateException_DatabaseExceptionAtIndex2_MapsToConflict()
    {
        var handler = new GlobalExceptionHandler();
        var (context, stream) = CreateHttpContext("TRACE-AGG-INDEX2");

        var pgEx = CreatePgEx("23505",
            constraint: "IX_ClinicPatients_ClinicId_PatientCode",
            detail: "Key (clinic_id, patient_code)=(1, PAT-2026-00042) already exists.");
        var dbEx = new DbUpdateException("An error occurred while saving the entity changes.", pgEx);
        var aggEx = new AggregateException(
            "Batch execution error",
            new TimeoutException("DB timeout"),
            new InvalidOperationException("Transaction failed"),
            dbEx);

        var handled = await handler.TryHandleAsync(context, aggEx, CancellationToken.None);

        handled.Should().BeTrue();
        context.Response.StatusCode.Should().Be((int)HttpStatusCode.Conflict);

        var response = await ReadResponseAsync(stream);
        response.Should().NotBeNull();
        response!.ErrorCode.Should().Be("DUPLICATE_PATIENT_CODE");
        response.TraceId.Should().Be("TRACE-AGG-INDEX2");
        response.Errors[0].Field.Should().Be("patientCode");
    }

    [Fact]
    public async Task AggregateException_DbUpdateConcurrencyException_AtIndex1_MapsToConflict()
    {
        var handler = new GlobalExceptionHandler();
        var (context, stream) = CreateHttpContext("TRACE-AGG-CONC");

        var concEx = new DbUpdateConcurrencyException("Store update statement affected 0 rows.");
        var aggEx = new AggregateException(
            "Batch execution error",
            new InvalidOperationException("Step 1 failed"),
            concEx);

        var handled = await handler.TryHandleAsync(context, aggEx, CancellationToken.None);

        handled.Should().BeTrue();
        context.Response.StatusCode.Should().Be((int)HttpStatusCode.Conflict);

        var response = await ReadResponseAsync(stream);
        response.Should().NotBeNull();
        response!.ErrorCode.Should().Be("CONCURRENCY_CONFLICT");
        response.TraceId.Should().Be("TRACE-AGG-CONC");
    }

    #endregion
}
