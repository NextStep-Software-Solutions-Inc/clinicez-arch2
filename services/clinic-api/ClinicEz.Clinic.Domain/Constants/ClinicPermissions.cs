using System.Collections.Generic;

namespace ClinicEz.Clinic.Domain.Constants;

public static class ClinicPermissions
{
    // Appointments
    public const string AppointmentsRead = "appointments:read";
    public const string AppointmentsManage = "appointments:manage";

    // Queue
    public const string QueueRead = "queue:read";
    public const string QueueCheckIn = "queue:check-in";
    public const string QueueCall = "queue:call";
    public const string QueueComplete = "queue:complete";

    // Triage
    public const string TriageRead = "triage:read";
    public const string TriageWrite = "triage:write";

    // Consultations & EMR
    public const string ConsultationsRead = "consultations:read";
    public const string ConsultationsWrite = "consultations:write";
    public const string ConsultationsSign = "consultations:sign";

    // Staff Roster
    public const string StaffRead = "staff:read";
    public const string StaffManage = "staff:manage";

    // Roles & Permissions
    public const string RolesRead = "roles:read";
    public const string RolesManage = "roles:manage";

    public static readonly IReadOnlyList<string> All = new List<string>
    {
        AppointmentsRead,
        AppointmentsManage,
        QueueRead,
        QueueCheckIn,
        QueueCall,
        QueueComplete,
        TriageRead,
        TriageWrite,
        ConsultationsRead,
        ConsultationsWrite,
        ConsultationsSign,
        StaffRead,
        StaffManage,
        RolesRead,
        RolesManage
    }.AsReadOnly();
}
