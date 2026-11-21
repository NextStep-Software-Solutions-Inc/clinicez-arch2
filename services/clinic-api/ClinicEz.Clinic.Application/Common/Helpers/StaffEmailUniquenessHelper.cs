using System;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Common.Helpers;

public static class StaffEmailUniquenessHelper
{
    public const string DuplicateStaffEmailMessage =
        "This email address is already associated with an existing staff member in this clinic.";

    public static string? NormalizeEmail(string? email) =>
        string.IsNullOrWhiteSpace(email) ? null : email.Trim().ToLowerInvariant();

    public static bool IsStaffEmailUniqueViolation(DbUpdateException ex)
    {
        for (Exception? current = ex; current is not null; current = current.InnerException)
        {
            var constraintProp = current.GetType().GetProperty("ConstraintName");
            if (constraintProp?.GetValue(current) is string constraintName &&
                constraintName.Length > 0)
            {
                return string.Equals(constraintName, "IX_StaffMembers_ClinicId_Email", StringComparison.OrdinalIgnoreCase);
            }

            if (current.Message.Contains("IX_StaffMembers_ClinicId_Email", StringComparison.OrdinalIgnoreCase))
            {
                return true;
            }

            var sqlStateProp = current.GetType().GetProperty("SqlState");
            if (sqlStateProp?.GetValue(current) is string sqlState && sqlState == "23505")
            {
                if (!current.Message.Contains("InvitationToken", StringComparison.OrdinalIgnoreCase))
                {
                    return true;
                }
            }
        }

        return false;
    }
}
