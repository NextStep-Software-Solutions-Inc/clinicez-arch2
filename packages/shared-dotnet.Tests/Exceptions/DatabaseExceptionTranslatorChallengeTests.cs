using System.Net;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Exceptions;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using Xunit;

namespace ClinicEz.Shared.Tests.Exceptions;

public class DatabaseExceptionTranslatorChallengeTests
{
    private static PostgresException CreatePgEx(
        string sqlState,
        string messageText = "Database error",
        string? detail = null,
        string? constraintName = null,
        string? columnName = null,
        string? tableName = null)
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
            tableName: tableName,
            columnName: columnName,
            dataTypeName: null,
            constraintName: constraintName,
            file: null,
            line: null,
            routine: null);
    }

    // =========================================================================
    // SECTION 1: PostgreSQL SQLSTATE & Tricky Constraint Parsing
    // =========================================================================

    [Fact]
    public void Challenge_CompoundUniqueIndex_MultipleTenantKeys_ExtractsBusinessKey()
    {
        // Detail with both tenant_id and clinic_id preceding patient_code
        var pgEx = CreatePgEx(
            sqlState: "23505",
            detail: "Key (tenant_id, clinic_id, patient_code)=(uuid-1, uuid-2, PAT-2026-00042) already exists.");

        var translated = DatabaseExceptionTranslator.TryTranslate(pgEx, "trace-1", out var result);

        translated.Should().BeTrue();
        result!.StatusCode.Should().Be((int)HttpStatusCode.Conflict);
        result.ErrorCode.Should().Be("DUPLICATE_PATIENT_CODE");
        result.Errors[0].Field.Should().Be("patientCode");
    }

    [Fact]
    public void Challenge_CompoundUniqueIndex_QuotedAndSpacedDetail_ExtractsCleanField()
    {
        // Detail with quoted identifier and complex value format
        var pgEx = CreatePgEx(
            sqlState: "23505",
            detail: "Key (clinic_id, \"PhilHealthPin\")=(123, \"12-345678901-2 (active)\") already exists.");

        var translated = DatabaseExceptionTranslator.TryTranslate(pgEx, "trace-2", out var result);

        translated.Should().BeTrue();
        result!.StatusCode.Should().Be((int)HttpStatusCode.Conflict);
        result.ErrorCode.Should().Be("DUPLICATE_RESOURCE");
        result.Errors[0].Field.Should().Be("philHealthPin");
    }

    [Fact]
    public void Challenge_UniqueViolation_MissingDetail_ConstraintWithTenantPrefix_ExtractsField()
    {
        // Detail is null, but constraint name is IX_ClinicPatients_ClinicId_NationalId
        var pgEx = CreatePgEx(
            sqlState: "23505",
            constraintName: "IX_ClinicPatients_ClinicId_NationalId",
            detail: null);

        var translated = DatabaseExceptionTranslator.TryTranslate(pgEx, "trace-3", out var result);

        translated.Should().BeTrue();
        result!.StatusCode.Should().Be((int)HttpStatusCode.Conflict);
        result.ErrorCode.Should().Be("DUPLICATE_RESOURCE");
        result.Errors[0].Field.Should().Be("nationalId");
    }

    [Fact]
    public void Challenge_UniqueViolation_PostgresDefaultConstraintName_WithoutDetail_Behavior()
    {
        // Postgres default naming convention: table_column_key without detail
        // Under constraintName split by '_', candidate extracts parts[^1] ("key")
        var pgEx = CreatePgEx(
            sqlState: "23505",
            constraintName: "patients_email_key",
            detail: null);

        var translated = DatabaseExceptionTranslator.TryTranslate(pgEx, "trace-4", out var result);

        translated.Should().BeTrue();
        result!.StatusCode.Should().Be((int)HttpStatusCode.Conflict);
        result.ErrorCode.Should().Be("DUPLICATE_RESOURCE");
        result.Errors[0].Field.Should().Be("key");
    }

    [Fact]
    public void Challenge_UniqueViolation_NoDetail_NoConstraintName_GracefullyReturnsNullField()
    {
        // Constraint name and detail are both null
        var pgEx = CreatePgEx(
            sqlState: "23505",
            constraintName: null,
            detail: null);

        var translated = DatabaseExceptionTranslator.TryTranslate(pgEx, "trace-5", out var result);

        translated.Should().BeTrue();
        result!.StatusCode.Should().Be((int)HttpStatusCode.Conflict);
        result.ErrorCode.Should().Be("DUPLICATE_RESOURCE");
        result.Errors[0].Field.Should().BeNull();
    }

    [Fact]
    public void Challenge_ForeignKey_SnakeCaseConstraintName_Behavior()
    {
        // Foreign key named with snake_case: fk_appointments_patients_patient_id
        // Under parts[^1], candidate extracts "id"
        var pgEx = CreatePgEx(
            sqlState: "23503",
            constraintName: "fk_appointments_patients_patient_id",
            columnName: null);

        var translated = DatabaseExceptionTranslator.TryTranslate(pgEx, "trace-6", out var result);

        translated.Should().BeTrue();
        result!.StatusCode.Should().Be((int)HttpStatusCode.Conflict);
        result.ErrorCode.Should().Be("FOREIGN_KEY_VIOLATION");
        result.Errors[0].Field.Should().Be("id");
    }

    [Fact]
    public void Challenge_NotNullViolation_WhitespaceOrEmptyColumn_DefaultsToField()
    {
        var pgEx = CreatePgEx(
            sqlState: "23502",
            columnName: "   ");

        var translated = DatabaseExceptionTranslator.TryTranslate(pgEx, "trace-7", out var result);

        translated.Should().BeTrue();
        result!.StatusCode.Should().Be((int)HttpStatusCode.BadRequest);
        result.ErrorCode.Should().Be("REQUIRED_FIELD_MISSING");
        result.Errors[0].Field.Should().Be("field");
        result.Message.Should().Be("Required field 'field' cannot be empty.");
    }

    [Fact]
    public void Challenge_Truncation_MessageWithoutColumn_DefaultsToValue()
    {
        var pgEx = CreatePgEx(
            sqlState: "22001",
            messageText: "value too long for type character varying(255)",
            columnName: null);

        var translated = DatabaseExceptionTranslator.TryTranslate(pgEx, "trace-8", out var result);

        translated.Should().BeTrue();
        result!.StatusCode.Should().Be((int)HttpStatusCode.BadRequest);
        result.ErrorCode.Should().Be("FIELD_TOO_LONG");
        result.Errors[0].Field.Should().Be("value");
    }

    // =========================================================================
    // SECTION 2: Deeply Nested Exceptions & AggregateException
    // =========================================================================

    [Fact]
    public void Challenge_AggregateException_WrappingDbUpdateException_WrappingPostgresException_TranslatesSuccessfully()
    {
        // Exact case requested in Challenger objectives:
        // AggregateException wrapping DbUpdateException wrapping PostgresException
        var pgEx = CreatePgEx("23505", detail: "Key (clinic_id, patient_code)=(1, PAT-2026-00001) already exists.");
        var dbEx = new DbUpdateException("ORM save error", pgEx);
        var aggEx = new AggregateException("Batch error", dbEx);

        var translated = DatabaseExceptionTranslator.TryTranslate(aggEx, "trace-agg-1", out var result);

        translated.Should().BeTrue();
        result!.StatusCode.Should().Be((int)HttpStatusCode.Conflict);
        result.ErrorCode.Should().Be("DUPLICATE_PATIENT_CODE");
        result.Errors[0].Field.Should().Be("patientCode");
    }

    [Fact]
    public void Challenge_DeeplyNestedExceptions_50LevelsDeep_ResolvesCorrectly()
    {
        // Deep exception hierarchy with 50 wrappers
        var pgEx = CreatePgEx("23P01", messageText: "Exclusion violation on slots");
        Exception currentEx = pgEx;
        for (int i = 0; i < 50; i++)
        {
            currentEx = new Exception($"Wrapper level {i}", currentEx);
        }

        var translated = DatabaseExceptionTranslator.TryTranslate(currentEx, "trace-deep-50", out var result);

        translated.Should().BeTrue();
        result!.StatusCode.Should().Be((int)HttpStatusCode.Conflict);
        result.ErrorCode.Should().Be("EXCLUSION_VIOLATION");
    }

    [Fact]
    public void Challenge_AggregateException_MultipleInnerExceptions_SecondPositionBehavior()
    {
        // When AggregateException contains multiple inner exceptions and DbUpdateException
        // is at index 1 (not index 0):
        var pgEx = CreatePgEx("23505", detail: "Key (email)=(doc@example.com) already exists.");
        var dbEx = new DbUpdateException("ORM save error", pgEx);
        var aggEx = new AggregateException("Batch error", new InvalidOperationException("First failure"), dbEx);

        var translated = DatabaseExceptionTranslator.TryTranslate(aggEx, "trace-agg-2", out var result);

        // Verification observation: In current implementation, current.InnerException only inspects
        // InnerExceptions[0], so it returns false when the DB exception is at index 1.
        translated.Should().BeFalse();
        result.Should().BeNull();
    }

    // =========================================================================
    // SECTION 3: Concurrency Exception Handling
    // =========================================================================

    [Fact]
    public void Challenge_DbUpdateConcurrencyException_NestedInApplicationException_TranslatesTo409()
    {
        var concEx = new DbUpdateConcurrencyException("Store update, insert, or delete statement affected 0 rows.");
        var appEx = new ApplicationException("Transaction aborted", concEx);

        var translated = DatabaseExceptionTranslator.TryTranslate(appEx, "trace-conc-nest", out var result);

        translated.Should().BeTrue();
        result!.StatusCode.Should().Be((int)HttpStatusCode.Conflict);
        result.ErrorCode.Should().Be("CONCURRENCY_CONFLICT");
        result.Message.Should().Contain("modified or deleted by another operation");
    }

    [Fact]
    public void Challenge_DbUpdateConcurrencyException_InAggregateException_TranslatesTo409()
    {
        var concEx = new DbUpdateConcurrencyException("Row version conflict");
        var aggEx = new AggregateException(concEx);

        var translated = DatabaseExceptionTranslator.TryTranslate(aggEx, "trace-conc-agg", out var result);

        translated.Should().BeTrue();
        result!.StatusCode.Should().Be((int)HttpStatusCode.Conflict);
        result.ErrorCode.Should().Be("CONCURRENCY_CONFLICT");
    }

    // =========================================================================
    // SECTION 4: Unmapped & Deadlock PostgreSQL Error Codes
    // =========================================================================

    [Fact]
    public void Challenge_PostgresDeadlockDetected_40P01_MapsToGenericDatabaseError()
    {
        // Deadlock detected: SQLSTATE 40P01
        var pgEx = CreatePgEx("40P01", messageText: "deadlock detected");
        var dbEx = new DbUpdateException("ORM save error", pgEx);

        var translated = DatabaseExceptionTranslator.TryTranslate(dbEx, "trace-10101", out var result);

        translated.Should().BeTrue();
        result!.StatusCode.Should().Be((int)HttpStatusCode.InternalServerError);
        result.ErrorCode.Should().Be("DATABASE_ERROR");
        result.Message.Should().Contain("Support Reference: trace-10101");
        result.Message.Should().NotContain("deadlock");
    }

    [Fact]
    public void Challenge_NullTraceId_FallsBackToNA_NeverThrows()
    {
        var pgEx = CreatePgEx("40001", messageText: "serialization_failure");

        var translated = DatabaseExceptionTranslator.TryTranslate(pgEx, null, out var result);

        translated.Should().BeTrue();
        result!.StatusCode.Should().Be((int)HttpStatusCode.InternalServerError);
        result.ErrorCode.Should().Be("DATABASE_ERROR");
        result.Message.Should().Contain("Support Reference: N/A");
    }

    [Fact]
    public void Challenge_NullException_GracefullyReturnsFalse_NeverThrows()
    {
        var translated = DatabaseExceptionTranslator.TryTranslate(null!, "trace-null-ex", out var result);

        translated.Should().BeFalse();
        result.Should().BeNull();
    }
}
