using System.Net;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Exceptions;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using Xunit;

namespace ClinicEz.Shared.Tests.Exceptions;

public class DatabaseExceptionTranslatorTests
{
    private static PostgresException CreatePostgresException(
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

    [Fact]
    public void TryTranslate_UniqueViolation_PatientCodeInConstraintName_MapsToDuplicatePatientCode()
    {
        var pgEx = CreatePostgresException(
            sqlState: "23505",
            constraintName: "IX_ClinicPatients_ClinicId_PatientCode",
            detail: "Key (clinic_id, patient_code)=(123, PAT-2026-00001) already exists.");
        var dbEx = new DbUpdateException("An error occurred while saving the entity changes.", pgEx);

        var translated = DatabaseExceptionTranslator.TryTranslate(dbEx, "trace-123", out var result);

        translated.Should().BeTrue();
        result.Should().NotBeNull();
        result!.StatusCode.Should().Be((int)HttpStatusCode.Conflict);
        result.ErrorCode.Should().Be("DUPLICATE_PATIENT_CODE");
        result.Message.Should().Be("A patient with this code already exists. Please refresh or retry.");
        result.Errors.Should().HaveCount(1);
        result.Errors[0].Field.Should().Be("patientCode");
        result.Errors[0].Code.Should().Be("DUPLICATE_PATIENT_CODE");
        result.Errors[0].Message.Should().Be("A patient with this code already exists. Please refresh or retry.");
    }

    [Fact]
    public void TryTranslate_UniqueViolation_PatientCodeInDetail_MapsToDuplicatePatientCode()
    {
        var pgEx = CreatePostgresException(
            sqlState: "23505",
            constraintName: "unique_code_idx",
            detail: "Key (PatientCode)=(PAT-2026-99999) already exists.");

        var translated = DatabaseExceptionTranslator.TryTranslate(pgEx, "trace-456", out var result);

        translated.Should().BeTrue();
        result.Should().NotBeNull();
        result!.StatusCode.Should().Be((int)HttpStatusCode.Conflict);
        result.ErrorCode.Should().Be("DUPLICATE_PATIENT_CODE");
        result.Errors[0].Field.Should().Be("patientCode");
    }

    [Fact]
    public void TryTranslate_UniqueViolation_QueueItemId_MapsToDuplicateQueueConsultation()
    {
        var pgEx = CreatePostgresException(
            sqlState: "23505",
            constraintName: "IX_Consultations_QueueItemId",
            detail: "Key (\"QueueItemId\")=(8f14e45f-ceea-467a-9a38-000000000001) already exists.");
        var dbEx = new DbUpdateException("An error occurred while saving the entity changes.", pgEx);

        var translated = DatabaseExceptionTranslator.TryTranslate(dbEx, "trace-queue-consult", out var result);

        translated.Should().BeTrue();
        result.Should().NotBeNull();
        result!.StatusCode.Should().Be((int)HttpStatusCode.Conflict);
        result.ErrorCode.Should().Be("DUPLICATE_QUEUE_CONSULTATION");
        result.Message.Should().Be("A consultation encounter already exists for this queue visit. Please refresh the patient chart or update the existing encounter.");
        result.Errors.Should().HaveCount(1);
        result.Errors[0].Field.Should().Be("queueItemId");
        result.Errors[0].Code.Should().Be("DUPLICATE_QUEUE_CONSULTATION");
    }

    [Fact]
    public void TryTranslate_UniqueViolation_EmailInDetail_MapsToDuplicateResourceWithEmailAttribution()
    {
        var pgEx = CreatePostgresException(
            sqlState: "23505",
            constraintName: "IX_Users_Email",
            detail: "Key (email)=(doctor@clinicez.ph) already exists.");
        var dbEx = new DbUpdateException("An error occurred while saving the entity changes.", pgEx);

        var translated = DatabaseExceptionTranslator.TryTranslate(dbEx, "trace-email", out var result);

        translated.Should().BeTrue();
        result.Should().NotBeNull();
        result!.StatusCode.Should().Be((int)HttpStatusCode.Conflict);
        result.ErrorCode.Should().Be("DUPLICATE_RESOURCE");
        result.Message.Should().Be("A record with the same unique value already exists.");
        result.Errors.Should().HaveCount(1);
        result.Errors[0].Field.Should().Be("email");
        result.Errors[0].Code.Should().Be("DUPLICATE_RESOURCE");
    }

    [Fact]
    public void TryTranslate_UniqueViolation_CompoundKeyInDetail_ExtractsNonTenantKey()
    {
        var pgEx = CreatePostgresException(
            sqlState: "23505",
            detail: "Key (clinic_id, PhilHealthPin)=(123, 12-345678901-2) already exists.");

        var translated = DatabaseExceptionTranslator.TryTranslate(pgEx, null, out var result);

        translated.Should().BeTrue();
        result.Should().NotBeNull();
        result!.StatusCode.Should().Be((int)HttpStatusCode.Conflict);
        result.ErrorCode.Should().Be("DUPLICATE_RESOURCE");
        result.Errors[0].Field.Should().Be("philHealthPin");
    }

    [Fact]
    public void TryTranslate_StringDataRightTruncation_WithColumnName_MapsToFieldTooLong()
    {
        var pgEx = CreatePostgresException(
            sqlState: "22001",
            columnName: "ChiefComplaint",
            messageText: "value too long for type character varying(255)");
        var dbEx = new DbUpdateException("An error occurred while saving the entity changes.", pgEx);

        var translated = DatabaseExceptionTranslator.TryTranslate(dbEx, "trace-trunc", out var result);

        translated.Should().BeTrue();
        result.Should().NotBeNull();
        result!.StatusCode.Should().Be((int)HttpStatusCode.BadRequest);
        result.ErrorCode.Should().Be("FIELD_TOO_LONG");
        result.Message.Should().Be("One or more fields exceed the maximum allowed length.");
        result.Errors.Should().HaveCount(1);
        result.Errors[0].Field.Should().Be("chiefComplaint");
        result.Errors[0].Code.Should().Be("FIELD_TOO_LONG");
    }

    [Fact]
    public void TryTranslate_StringDataRightTruncation_WithoutColumnName_ParsesFromMessageText()
    {
        var pgEx = CreatePostgresException(
            sqlState: "22001",
            messageText: "value too long for type character varying(255) in column \"notes\"");

        var translated = DatabaseExceptionTranslator.TryTranslate(pgEx, null, out var result);

        translated.Should().BeTrue();
        result!.StatusCode.Should().Be((int)HttpStatusCode.BadRequest);
        result.ErrorCode.Should().Be("FIELD_TOO_LONG");
        result.Errors[0].Field.Should().Be("notes");
    }

    [Fact]
    public void TryTranslate_NotNullViolation_MapsToRequiredFieldMissing()
    {
        var pgEx = CreatePostgresException(
            sqlState: "23502",
            columnName: "patient_name",
            messageText: "null value in column \"patient_name\" violates not-null constraint");
        var dbEx = new DbUpdateException("An error occurred while saving the entity changes.", pgEx);

        var translated = DatabaseExceptionTranslator.TryTranslate(dbEx, "trace-null", out var result);

        translated.Should().BeTrue();
        result.Should().NotBeNull();
        result!.StatusCode.Should().Be((int)HttpStatusCode.BadRequest);
        result.ErrorCode.Should().Be("REQUIRED_FIELD_MISSING");
        result.Message.Should().Be("Required field 'patientName' cannot be empty.");
        result.Errors.Should().HaveCount(1);
        result.Errors[0].Field.Should().Be("patientName");
        result.Errors[0].Code.Should().Be("REQUIRED_FIELD_MISSING");
    }

    [Fact]
    public void TryTranslate_ForeignKeyViolation_MapsToForeignKeyViolation()
    {
        var pgEx = CreatePostgresException(
            sqlState: "23503",
            constraintName: "FK_Appointments_Patients_PatientId",
            messageText: "insert or update on table \"Appointments\" violates foreign key constraint \"FK_Appointments_Patients_PatientId\"");
        var dbEx = new DbUpdateException("An error occurred while saving the entity changes.", pgEx);

        var translated = DatabaseExceptionTranslator.TryTranslate(dbEx, "trace-fk", out var result);

        translated.Should().BeTrue();
        result.Should().NotBeNull();
        result!.StatusCode.Should().Be((int)HttpStatusCode.Conflict);
        result.ErrorCode.Should().Be("FOREIGN_KEY_VIOLATION");
        result.Message.Should().Be("The referenced entity does not exist or is currently in use.");
        result.Errors.Should().HaveCount(1);
        result.Errors[0].Field.Should().Be("patientId");
        result.Errors[0].Code.Should().Be("FOREIGN_KEY_VIOLATION");
    }

    [Fact]
    public void TryTranslate_ExclusionViolation_MapsToExclusionViolation()
    {
        var pgEx = CreatePostgresException(
            sqlState: "23P01",
            messageText: "conflicting key value violates exclusion constraint \"doctor_slot_overlap\"");
        var dbEx = new DbUpdateException("An error occurred while saving the entity changes.", pgEx);

        var translated = DatabaseExceptionTranslator.TryTranslate(dbEx, "trace-excl", out var result);

        translated.Should().BeTrue();
        result.Should().NotBeNull();
        result!.StatusCode.Should().Be((int)HttpStatusCode.Conflict);
        result.ErrorCode.Should().Be("EXCLUSION_VIOLATION");
        result.Message.Should().Be("The requested appointment or schedule conflicts with an existing booking.");
        result.Errors.Should().HaveCount(1);
        result.Errors[0].Code.Should().Be("EXCLUSION_VIOLATION");
    }

    [Fact]
    public void TryTranslate_DbUpdateConcurrencyException_MapsToConcurrencyConflict()
    {
        var concEx = new DbUpdateConcurrencyException("Database operation expected to affect 1 row(s) but affected 0 row(s).");

        var translated = DatabaseExceptionTranslator.TryTranslate(concEx, "trace-conc", out var result);

        translated.Should().BeTrue();
        result.Should().NotBeNull();
        result!.StatusCode.Should().Be((int)HttpStatusCode.Conflict);
        result.ErrorCode.Should().Be("CONCURRENCY_CONFLICT");
        result.Message.Should().Be("The record was modified or deleted by another operation. Please reload and try again.");
        result.Errors.Should().HaveCount(1);
        result.Errors[0].Code.Should().Be("CONCURRENCY_CONFLICT");
    }

    [Fact]
    public void TryTranslate_GenericDbUpdateException_NeverLeaksRawOrmMessage()
    {
        const string rawOrmMessage = "An error occurred while saving the entity changes. See the inner exception for details.";
        var innerEx = new InvalidOperationException("Internal SQL query failed");
        var dbEx = new DbUpdateException(rawOrmMessage, innerEx);

        var translated = DatabaseExceptionTranslator.TryTranslate(dbEx, "TRACE-REF-999", out var result);

        translated.Should().BeTrue();
        result.Should().NotBeNull();
        result!.StatusCode.Should().Be((int)HttpStatusCode.InternalServerError);
        result.ErrorCode.Should().Be("DATABASE_ERROR");
        result.Message.Should().NotContain(rawOrmMessage);
        result.Message.Should().Contain("TRACE-REF-999");
        result.Errors[0].Message.Should().NotContain(rawOrmMessage);
        result.Errors[0].Message.Should().Contain("TRACE-REF-999");
    }

    [Fact]
    public void TryTranslate_UnmappedPostgresSqlState_MapsToGenericDatabaseErrorWithTraceId()
    {
        var pgEx = CreatePostgresException(
            sqlState: "08006",
            messageText: "connection_failure");

        var translated = DatabaseExceptionTranslator.TryTranslate(pgEx, "TRACE-CONN-123", out var result);

        translated.Should().BeTrue();
        result.Should().NotBeNull();
        result!.StatusCode.Should().Be((int)HttpStatusCode.InternalServerError);
        result.ErrorCode.Should().Be("DATABASE_ERROR");
        result.Message.Should().Contain("TRACE-CONN-123");
    }

    [Fact]
    public void TryTranslate_NonDatabaseException_ReturnsFalse()
    {
        var invalidOpEx = new InvalidOperationException("Invalid operation performed");

        var translated = DatabaseExceptionTranslator.TryTranslate(invalidOpEx, "trace-none", out var result);

        translated.Should().BeFalse();
        result.Should().BeNull();
    }

    [Fact]
    public void TryTranslate_DbUpdateException_WithoutInnerException_MapsToDatabaseError()
    {
        var dbEx = new DbUpdateException("An error occurred while saving the entity changes.");

        var translated = DatabaseExceptionTranslator.TryTranslate(dbEx, "trace-empty-inner", out var result);

        translated.Should().BeTrue();
        result!.StatusCode.Should().Be((int)HttpStatusCode.InternalServerError);
        result.ErrorCode.Should().Be("DATABASE_ERROR");
        result.Message.Should().NotContain("An error occurred while saving the entity changes");
        result.Message.Should().Contain("trace-empty-inner");
    }

    [Fact]
    public void TryTranslate_DeeplyNestedPostgresException_FindsAndTranslates()
    {
        var pgEx = CreatePostgresException("23505", detail: "Key (email)=(nested@example.com) already exists.");
        var innerDbEx = new DbUpdateException("ORM error", pgEx);
        var middleEx = new InvalidOperationException("Middle wrapper", innerDbEx);
        var topEx = new Exception("Top level wrapper", middleEx);

        var translated = DatabaseExceptionTranslator.TryTranslate(topEx, "trace-nested", out var result);

        translated.Should().BeTrue();
        result!.StatusCode.Should().Be((int)HttpStatusCode.Conflict);
        result.ErrorCode.Should().Be("DUPLICATE_RESOURCE");
        result.Errors[0].Field.Should().Be("email");
    }

    [Fact]
    public void TryTranslate_NotNullViolation_NullColumnName_DefaultsToField()
    {
        var pgEx = CreatePostgresException("23502", columnName: null);

        var translated = DatabaseExceptionTranslator.TryTranslate(pgEx, null, out var result);

        translated.Should().BeTrue();
        result!.StatusCode.Should().Be((int)HttpStatusCode.BadRequest);
        result.ErrorCode.Should().Be("REQUIRED_FIELD_MISSING");
        result.Errors[0].Field.Should().Be("field");
        result.Message.Should().Contain("Required field 'field' cannot be empty.");
    }

    [Fact]
    public void TryTranslate_Truncation_UnknownColumn_DefaultsToValue()
    {
        var pgEx = CreatePostgresException("22001", messageText: "string data right truncation", columnName: null);

        var translated = DatabaseExceptionTranslator.TryTranslate(pgEx, null, out var result);

        translated.Should().BeTrue();
        result!.StatusCode.Should().Be((int)HttpStatusCode.BadRequest);
        result.ErrorCode.Should().Be("FIELD_TOO_LONG");
        result.Errors[0].Field.Should().Be("value");
    }

    [Fact]
    public void ApiResponse_Fail_FactoryOverloads_SetPropertiesCorrectly()
    {
        var failWithErrors = ApiResponse<string>.Fail(
            "Failed operation",
            [new ApiFieldError("code", "INVALID_CODE", "Code is invalid")],
            "CUSTOM_ERROR",
            "TRACE-CUSTOM");

        failWithErrors.Succeeded.Should().BeFalse();
        failWithErrors.Message.Should().Be("Failed operation");
        failWithErrors.ErrorCode.Should().Be("CUSTOM_ERROR");
        failWithErrors.TraceId.Should().Be("TRACE-CUSTOM");
        failWithErrors.Errors.Should().HaveCount(1);

        var failWithCode = ApiResponse<string>.Fail(
            "Quick error",
            "QUICK_CODE",
            "TRACE-QUICK");

        failWithCode.Succeeded.Should().BeFalse();
        failWithCode.ErrorCode.Should().Be("QUICK_CODE");
        failWithCode.TraceId.Should().Be("TRACE-QUICK");
        failWithCode.Errors.Should().HaveCount(1);
        failWithCode.Errors[0].Code.Should().Be("QUICK_CODE");
    }

    [Fact]
    public void TryTranslate_AggregateException_MultipleInnerExceptions_SecondPosition_TranslatesToConflict()
    {
        var pgEx = CreatePostgresException("23505", detail: "Key (email)=(doc@example.com) already exists.");
        var dbEx = new DbUpdateException("ORM save error", pgEx);
        var aggEx = new AggregateException("Batch error", new InvalidOperationException("First failure"), dbEx);

        var translated = DatabaseExceptionTranslator.TryTranslate(aggEx, "trace-agg-test-2", out var result);

        translated.Should().BeTrue();
        result.Should().NotBeNull();
        result!.StatusCode.Should().Be((int)HttpStatusCode.Conflict);
        result.ErrorCode.Should().Be("DUPLICATE_RESOURCE");
        result.Errors[0].Field.Should().Be("email");
    }

    [Fact]
    public void TryTranslate_AggregateException_DbUpdateConcurrencyException_AtSecondPosition_TranslatesToConflict()
    {
        var concEx = new DbUpdateConcurrencyException("Row version conflict");
        var aggEx = new AggregateException(
            "Batch error",
            new InvalidOperationException("Step 1 failed"),
            concEx);

        var translated = DatabaseExceptionTranslator.TryTranslate(aggEx, "trace-agg-conc-2", out var result);

        translated.Should().BeTrue();
        result.Should().NotBeNull();
        result!.StatusCode.Should().Be((int)HttpStatusCode.Conflict);
        result.ErrorCode.Should().Be("CONCURRENCY_CONFLICT");
    }

    [Fact]
    public void TryTranslate_CyclicExceptionHierarchy_TerminatesSafelyWithoutLooping()
    {
        var ex1 = new Exception("Cycle node 1");
        var ex2 = new Exception("Cycle node 2", ex1);
        typeof(Exception)
            .GetField("_innerException", System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Instance)
            ?.SetValue(ex1, ex2);

        var translated = DatabaseExceptionTranslator.TryTranslate(ex1, "trace-cycle", out var result);

        translated.Should().BeFalse();
        result.Should().BeNull();
    }

    [Fact]
    public void TryTranslate_CyclicExceptionWithPostgresChild_FindsPostgresAndTerminatesSafely()
    {
        var pgEx = CreatePostgresException("23505", detail: "Key (email)=(cycle@example.com) already exists.");
        var ex1 = new Exception("Cycle node 1");
        var ex2 = new Exception("Cycle node 2", ex1);
        var ex3 = new Exception("Cycle node 3", pgEx);

        var field = typeof(Exception).GetField("_innerException", System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Instance);
        field?.SetValue(ex1, ex2);

        var agg = new AggregateException(ex1, ex3);

        var translated = DatabaseExceptionTranslator.TryTranslate(agg, "trace-cycle-pg", out var result);

        translated.Should().BeTrue();
        result.Should().NotBeNull();
        result!.StatusCode.Should().Be((int)HttpStatusCode.Conflict);
        result.ErrorCode.Should().Be("DUPLICATE_RESOURCE");
    }
}
