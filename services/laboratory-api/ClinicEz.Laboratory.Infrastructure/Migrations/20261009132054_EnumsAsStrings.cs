using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ClinicEz.Laboratory.Infrastructure.Migrations
{
    /// <summary>
    /// Every enum column moves from its ordinal (integer) to its C# member name (character varying(64)). The data is converted
    /// in place with a CASE over the enum's members, so no row is lost or re-interpreted. An ordinal outside the enum (which
    /// the application never wrote) is kept as its number text rather than dropped.
    /// </summary>
    /// <inheritdoc />
    public partial class EnumsAsStrings : Migration
    {
        private const string Schema = "laboratory_dashboard";

        private static readonly string[] SpecimenStatus = { "Pending", "Collected", "ReceivedInLab", "Rejected" };
        private static readonly string[] PaymentPolicy = { "Prepaid", "Postpaid", "None" };

        /// <summary>Table, column and the enum's members in ordinal order (ordinal 0 first).</summary>
        private static readonly (string Table, string Column, string[] Members)[] EnumColumns =
        {
            ("Specimens", "StorageTemperature", new[] { "Ambient_20_25C", "Refrigerated_2_8C", "Frozen_Minus20C", "DeepFreeze_Minus80C" }),
            ("Specimens", "StorageStatus", new[] { "InTransit", "InTesting", "StoredInRack", "Disposed" }),
            ("Specimens", "Status", SpecimenStatus),
            ("Specimens", "RejectionReason", new[] { "None", "Hemolyzed", "Lipemic", "Icteric", "Clotted", "InsufficientVolume_QNS", "WrongContainer", "UnlabeledMislabeled", "Contaminated" }),
            ("Specimens", "ContainerType", new[] { "Purple_EDTA", "Yellow_SST", "Red_Serum", "Grey_Fluoride", "LightBlue_Citrate", "Urine_Cup", "Stool_Vial" }),
            ("QcRuns", "Status", new[] { "Passed", "Warning", "Rejected" }),
            ("QcLots", "Level", new[] { "Level1_Low", "Level2_Normal", "Level3_High" }),
            ("LabStaffMembers", "Role", new[] { "Pathologist", "MedicalTechnologist", "Phlebotomist", "LabAdmin", "LabClerk" }),
            ("LabSettings", "PaymentPolicy", PaymentPolicy),
            ("LabRequisitions", "Status", new[] { "PendingAccession", "SpecimenCollected", "InTesting", "AwaitingReview", "Verified", "Rejected" }),
            ("LabRequisitions", "Stage", new[] { "Routed", "Claimed", "AwaitingPayment", "Paid", "SpecimenCollected", "InProcess", "ResultFinalized", "Rejected", "Cancelled" }),
            ("LabRequisitions", "PaymentPolicy", PaymentPolicy),
            ("LabRequisitions", "PaymentCorrection", new[] { "None", "Voided", "Refunded" }),
            ("LabRequisitions", "DoctorReviewOutcome", new[] { "None", "Accepted", "Rejected" }),
            ("CriticalPanicDispatchLogs", "NotificationMethod", new[] { "Telephone", "DirectEMR", "SMS", "InPerson" }),
            ("AnalyteResults", "Flag", new[] { "Normal", "Low", "High", "Critical" })
        };

        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            foreach (var (table, column, members) in EnumColumns)
            {
                var whens = string.Join(" ", members.Select((name, ordinal) => $"WHEN {ordinal} THEN '{name}'"));

                // The integer default (ordinal 0) cannot be cast to text, and the model declares no default.
                migrationBuilder.Sql($"ALTER TABLE \"{Schema}\".\"{table}\" ALTER COLUMN \"{column}\" DROP DEFAULT;");
                migrationBuilder.Sql(
                    $"ALTER TABLE \"{Schema}\".\"{table}\" ALTER COLUMN \"{column}\" TYPE character varying(64) " +
                    $"USING (CASE \"{column}\" {whens} ELSE \"{column}\"::text END);");
            }
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            foreach (var (table, column, members) in EnumColumns)
            {
                var whens = string.Join(" ", members.Select((name, ordinal) => $"WHEN '{name}' THEN {ordinal}"));

                migrationBuilder.Sql(
                    $"ALTER TABLE \"{Schema}\".\"{table}\" ALTER COLUMN \"{column}\" TYPE integer " +
                    $"USING (CASE \"{column}\" {whens} ELSE 0 END);");
            }
        }
    }
}
