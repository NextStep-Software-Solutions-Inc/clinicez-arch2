using System;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Common.Helpers;

public static class PatientCodeCollisionDetector
{
    public static bool IsPatientCodeCollision(DbUpdateException ex)
    {
        if (ex == null) return false;

        var text = ex.ToString();
        var isUniqueViolation = text.Contains("23505", StringComparison.OrdinalIgnoreCase)
            || text.Contains("duplicate key", StringComparison.OrdinalIgnoreCase)
            || text.Contains("unique constraint", StringComparison.OrdinalIgnoreCase)
            || text.Contains("already exists", StringComparison.OrdinalIgnoreCase);

        if (!isUniqueViolation)
        {
            return false;
        }

        return text.Contains("PatientCode", StringComparison.OrdinalIgnoreCase)
            || text.Contains("patient_code", StringComparison.OrdinalIgnoreCase)
            || text.Contains("IX_ClinicPatients", StringComparison.OrdinalIgnoreCase);
    }
}
