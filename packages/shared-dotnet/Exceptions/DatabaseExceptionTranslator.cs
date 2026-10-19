using System.Diagnostics.CodeAnalysis;
using System.Net;
using System.Text;
using System.Text.RegularExpressions;
using ClinicEz.Shared.Common;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace ClinicEz.Shared.Exceptions;

/// <summary>
/// Intercepts PostgreSQL and EF Core database exceptions and translates them into
/// standardized HTTP status codes and structured error response payloads without
/// leaking raw internal ORM exception strings.
/// </summary>
public static class DatabaseExceptionTranslator
{
    public sealed record TranslationResult(
        int StatusCode,
        string ErrorCode,
        string Message,
        IReadOnlyList<ApiFieldError> Errors);

    public static bool TryTranslate(
        Exception exception,
        string? traceId,
        [NotNullWhen(true)] out TranslationResult? result)
    {
        // 1. EF Core Optimistic Concurrency Conflict
        var concurrencyEx = FindConcurrencyException(exception);
        if (concurrencyEx is not null)
        {
            const string msg = "The record was modified or deleted by another operation. Please reload and try again.";
            result = new TranslationResult(
                (int)HttpStatusCode.Conflict,
                "CONCURRENCY_CONFLICT",
                msg,
                [new ApiFieldError(null, "CONCURRENCY_CONFLICT", msg)]);
            return true;
        }

        // 2. PostgreSQL / Npgsql Driver Exceptions
        var postgresEx = FindPostgresException(exception);
        if (postgresEx is not null)
        {
            switch (postgresEx.SqlState)
            {
                case "23505": // unique_violation
                {
                    var isPatientCode = IsPatientCodeConstraint(postgresEx);
                    var isQueueConsultation = !isPatientCode && IsQueueItemConstraint(postgresEx);

                    var errorCode = isPatientCode
                        ? "DUPLICATE_PATIENT_CODE"
                        : isQueueConsultation
                            ? "DUPLICATE_QUEUE_CONSULTATION"
                            : "DUPLICATE_RESOURCE";

                    var field = isPatientCode
                        ? "patientCode"
                        : isQueueConsultation
                            ? "queueItemId"
                            : ExtractFieldFromUniqueViolation(postgresEx.Detail, postgresEx.ConstraintName);

                    var message = isPatientCode
                        ? "A patient with this code already exists. Please refresh or retry."
                        : isQueueConsultation
                            ? "A consultation encounter already exists for this queue visit. Please refresh the patient chart or update the existing encounter."
                            : "A record with the same unique value already exists.";

                    result = new TranslationResult(
                        (int)HttpStatusCode.Conflict,
                        errorCode,
                        message,
                        [new ApiFieldError(field, errorCode, message)]);
                    return true;
                }

                case "22001": // string_data_right_truncation
                {
                    var field = ExtractFieldFromTruncation(postgresEx);
                    const string message = "One or more fields exceed the maximum allowed length.";
                    result = new TranslationResult(
                        (int)HttpStatusCode.BadRequest,
                        "FIELD_TOO_LONG",
                        message,
                        [new ApiFieldError(field, "FIELD_TOO_LONG", message)]);
                    return true;
                }

                case "23502": // not_null_violation
                {
                    var rawField = postgresEx.ColumnName;
                    var field = !string.IsNullOrWhiteSpace(rawField) ? ToCamelCase(rawField) : "field";
                    var message = $"Required field '{field}' cannot be empty.";
                    result = new TranslationResult(
                        (int)HttpStatusCode.BadRequest,
                        "REQUIRED_FIELD_MISSING",
                        message,
                        [new ApiFieldError(field, "REQUIRED_FIELD_MISSING", message)]);
                    return true;
                }

                case "23503": // foreign_key_violation
                {
                    var field = ExtractFieldFromForeignKey(postgresEx);
                    const string message = "The referenced entity does not exist or is currently in use.";
                    result = new TranslationResult(
                        (int)HttpStatusCode.Conflict,
                        "FOREIGN_KEY_VIOLATION",
                        message,
                        [new ApiFieldError(field, "FOREIGN_KEY_VIOLATION", message)]);
                    return true;
                }

                case "23P01": // exclusion_violation
                {
                    const string message = "The requested appointment or schedule conflicts with an existing booking.";
                    result = new TranslationResult(
                        (int)HttpStatusCode.Conflict,
                        "EXCLUSION_VIOLATION",
                        message,
                        [new ApiFieldError(null, "EXCLUSION_VIOLATION", message)]);
                    return true;
                }

                default:
                    // Any other unmapped PostgreSQL error: map to generic database error
                    break;
            }
        }

        // 3. Generic unhandled DbUpdateException or PostgresException
        var dbUpdateEx = FindDbUpdateException(exception);
        if (dbUpdateEx is not null || postgresEx is not null)
        {
            var refId = !string.IsNullOrWhiteSpace(traceId) ? traceId : "N/A";
            var message = $"A database error occurred while processing the request. Support Reference: {refId}";
            result = new TranslationResult(
                (int)HttpStatusCode.InternalServerError,
                "DATABASE_ERROR",
                message,
                [new ApiFieldError(null, "DATABASE_ERROR", message)]);
            return true;
        }

        result = null;
        return false;
    }

    private static IEnumerable<Exception> EnumerateExceptions(Exception? root)
    {
        if (root is null) yield break;

        const int maxExceptions = 128;
        var queue = new Queue<Exception>();
        var visited = new HashSet<Exception>(ReferenceEqualityComparer.Instance);
        queue.Enqueue(root);

        while (queue.Count > 0 && visited.Count < maxExceptions)
        {
            var current = queue.Dequeue();
            if (current is null || !visited.Add(current)) continue;

            yield return current;

            if (current is AggregateException agg)
            {
                foreach (var inner in agg.InnerExceptions)
                {
                    if (inner is not null)
                        queue.Enqueue(inner);
                }
            }

            if (current.InnerException is not null)
            {
                queue.Enqueue(current.InnerException);
            }
        }
    }

    private static DbUpdateConcurrencyException? FindConcurrencyException(Exception? ex)
    {
        return EnumerateExceptions(ex).OfType<DbUpdateConcurrencyException>().FirstOrDefault();
    }

    private static PostgresException? FindPostgresException(Exception? ex)
    {
        return EnumerateExceptions(ex).OfType<PostgresException>().FirstOrDefault();
    }

    private static DbUpdateException? FindDbUpdateException(Exception? ex)
    {
        return EnumerateExceptions(ex).OfType<DbUpdateException>().FirstOrDefault();
    }

    private static bool IsPatientCodeConstraint(PostgresException ex)
    {
        if (ex.ConstraintName?.Contains("PatientCode", StringComparison.OrdinalIgnoreCase) == true)
            return true;
        if (ex.ConstraintName?.Contains("patient_code", StringComparison.OrdinalIgnoreCase) == true)
            return true;
        if (ex.Detail?.Contains("PatientCode", StringComparison.OrdinalIgnoreCase) == true)
            return true;
        if (ex.Detail?.Contains("patient_code", StringComparison.OrdinalIgnoreCase) == true)
            return true;

        return false;
    }

    private static bool IsQueueItemConstraint(PostgresException ex)
    {
        if (ex.ConstraintName?.Contains("QueueItemId", StringComparison.OrdinalIgnoreCase) == true)
            return true;
        if (ex.ConstraintName?.Contains("queue_item_id", StringComparison.OrdinalIgnoreCase) == true)
            return true;
        if (ex.Detail?.Contains("QueueItemId", StringComparison.OrdinalIgnoreCase) == true)
            return true;
        if (ex.Detail?.Contains("queue_item_id", StringComparison.OrdinalIgnoreCase) == true)
            return true;

        return false;
    }

    private static string? ExtractFieldFromUniqueViolation(string? detail, string? constraintName)
    {
        if (!string.IsNullOrWhiteSpace(detail))
        {
            // PostgreSQL detail format: Key (email)=(user@example.com) already exists.
            // Compound key: Key (clinic_id, patient_code)=(..., ...) already exists.
            var match = Regex.Match(detail, @"Key\s*\(([^)]+)\)\s*=");
            if (match.Success)
            {
                var keys = match.Groups[1].Value.Split(',', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries);
                // Prefer non-tenant key in composite unique constraints (e.g. ClinicId, PatientCode -> patientCode)
                var targetKey = keys.FirstOrDefault(k =>
                    !k.Equals("clinic_id", StringComparison.OrdinalIgnoreCase) &&
                    !k.Equals("clinicid", StringComparison.OrdinalIgnoreCase) &&
                    !k.Equals("tenant_id", StringComparison.OrdinalIgnoreCase) &&
                    !k.Equals("tenantid", StringComparison.OrdinalIgnoreCase)) ?? keys.LastOrDefault();

                if (!string.IsNullOrWhiteSpace(targetKey))
                {
                    return ToCamelCase(targetKey.Trim('"', ' '));
                }
            }
        }

        if (!string.IsNullOrWhiteSpace(constraintName))
        {
            // Typical conventions: IX_TableName_ColumnName or UQ_TableName_ColumnName
            var parts = constraintName.Split('_', StringSplitOptions.RemoveEmptyEntries);
            if (parts.Length >= 3)
            {
                // Last part or second to last
                var candidate = parts[^1];
                if (parts.Length > 3 && (parts[^2].Equals("ClinicId", StringComparison.OrdinalIgnoreCase) || parts[^2].Equals("clinic_id", StringComparison.OrdinalIgnoreCase)))
                {
                    candidate = parts[^1];
                }
                return ToCamelCase(candidate);
            }
        }

        return null;
    }

    private static string? ExtractFieldFromTruncation(PostgresException ex)
    {
        if (!string.IsNullOrWhiteSpace(ex.ColumnName))
            return ToCamelCase(ex.ColumnName);

        if (!string.IsNullOrWhiteSpace(ex.MessageText))
        {
            var match = Regex.Match(ex.MessageText, @"column\s+""?([a-zA-Z0-9_]+)""?", RegexOptions.IgnoreCase);
            if (match.Success)
                return ToCamelCase(match.Groups[1].Value);
        }

        return "value";
    }

    private static string? ExtractFieldFromForeignKey(PostgresException ex)
    {
        if (!string.IsNullOrWhiteSpace(ex.ColumnName))
            return ToCamelCase(ex.ColumnName);

        if (!string.IsNullOrWhiteSpace(ex.ConstraintName))
        {
            // FK_Appointments_Patients_PatientId
            var parts = ex.ConstraintName.Split('_', StringSplitOptions.RemoveEmptyEntries);
            if (parts.Length >= 2)
            {
                return ToCamelCase(parts[^1]);
            }
        }

        return null;
    }

    public static string ToCamelCase(string input)
    {
        if (string.IsNullOrWhiteSpace(input)) return input;

        // Strip surrounding quotes or whitespace
        input = input.Trim('"', '\'', ' ');

        // If snake_case (contains underscore)
        if (input.Contains('_'))
        {
            var parts = input.Split('_', StringSplitOptions.RemoveEmptyEntries);
            if (parts.Length == 0) return input;

            var sb = new StringBuilder();
            sb.Append(char.ToLowerInvariant(parts[0][0]));
            if (parts[0].Length > 1) sb.Append(parts[0][1..]);

            for (int i = 1; i < parts.Length; i++)
            {
                if (string.IsNullOrEmpty(parts[i])) continue;
                sb.Append(char.ToUpperInvariant(parts[i][0]));
                if (parts[i].Length > 1) sb.Append(parts[i][1..]);
            }
            return sb.ToString();
        }

        // If PascalCase
        if (char.IsUpper(input[0]))
        {
            if (input.Length == 1) return input.ToLowerInvariant();
            return char.ToLowerInvariant(input[0]) + input[1..];
        }

        return input;
    }
}
