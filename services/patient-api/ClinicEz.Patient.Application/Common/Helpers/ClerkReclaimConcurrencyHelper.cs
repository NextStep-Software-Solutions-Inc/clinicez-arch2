using System;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace ClinicEz.Patient.Application.Common.Helpers;

internal static class ClerkReclaimConcurrencyHelper
{
    public static bool IsUniqueOrConcurrencyConflict(DbUpdateException exception)
        => exception is DbUpdateConcurrencyException || IsUniqueViolation(exception);

    public static bool IsUniqueViolation(DbUpdateException exception)
    {
        for (Exception? current = exception; current is not null; current = current.InnerException)
        {
            if (current is PostgresException pgEx &&
                string.Equals(pgEx.SqlState, PostgresErrorCodes.UniqueViolation, StringComparison.Ordinal))
            {
                return true;
            }

            if (current.Message.Contains("23505", StringComparison.OrdinalIgnoreCase) ||
                current.Message.Contains("duplicate key", StringComparison.OrdinalIgnoreCase) ||
                current.Message.Contains("ix_patients_clerk_user_id", StringComparison.OrdinalIgnoreCase))
            {
                return true;
            }
        }

        return false;
    }
}
