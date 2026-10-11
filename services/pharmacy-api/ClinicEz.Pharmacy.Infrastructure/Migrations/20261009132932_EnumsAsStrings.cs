using System.Linq;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ClinicEz.Pharmacy.Infrastructure.Migrations
{
    /// <summary>
    /// Persists every enum column as its C# member name (varchar(64)) instead of its integer value. The generated
    /// AlterColumn calls cannot convert data (PostgreSQL has no implicit integer-to-text mapping of names), so each
    /// column is altered with an explicit USING CASE over the member list below. The lists are frozen copies of the
    /// enums as they were when the columns were integers, indexed by their integer value; they must not be derived
    /// from the live enums. A value outside the list maps to NULL, which the NOT NULL constraint rejects, so the
    /// whole migration fails and rolls back instead of silently losing data.
    /// </summary>
    /// <inheritdoc />
    public partial class EnumsAsStrings : Migration
    {
        private const string Schema = "pharmacy_dashboard";

        private static readonly string[] PrescriptionStatus =
        {
            "Pending", "InPreparation", "ReadyForPickup", "Dispensed", "Cancelled", "Accepted", "PartiallyAccepted", "Rejected"
        };

        private static readonly string[] PaymentPolicy = { "Prepaid", "Postpaid", "None" };

        private static readonly string[] PaymentStatus = { "NotRequired", "AwaitingPayment", "Paid", "Voided", "Refunded" };

        private static readonly string[] ItemDispenseStatus = { "Pending", "Dispensed", "OutOfStock", "Substituted", "Rejected" };

        private static readonly string[] BatchStatus = { "Active", "Depleted", "Expired", "Quarantined" };

        private static readonly string[] StaffRole =
        {
            "ChiefPharmacist", "StaffPharmacist", "PharmacyAssistant", "Cashier", "InventoryClerk"
        };

        private static readonly string[] GamotTransactionStatus = { "Allocated", "Dispensed", "Claimed", "Reversed", "Rejected" };

        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            ToText(migrationBuilder, "PrescriptionOrders", "Status", PrescriptionStatus);
            ToText(migrationBuilder, "PrescriptionOrders", "PaymentStatus", PaymentStatus);
            ToText(migrationBuilder, "PrescriptionOrders", "PaymentPolicy", PaymentPolicy);
            ToText(migrationBuilder, "PrescriptionOrderItems", "Status", ItemDispenseStatus);
            ToText(migrationBuilder, "PharmacyStaffMembers", "Role", StaffRole);
            ToText(migrationBuilder, "PharmacySettings", "PaymentPolicy", PaymentPolicy);
            ToText(migrationBuilder, "InventoryBatches", "Status", BatchStatus);
            ToText(migrationBuilder, "GamotLedgerTransactions", "Status", GamotTransactionStatus);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            ToInteger(migrationBuilder, "PrescriptionOrders", "Status", PrescriptionStatus);
            ToInteger(migrationBuilder, "PrescriptionOrders", "PaymentStatus", PaymentStatus);
            ToInteger(migrationBuilder, "PrescriptionOrders", "PaymentPolicy", PaymentPolicy);
            ToInteger(migrationBuilder, "PrescriptionOrderItems", "Status", ItemDispenseStatus);
            ToInteger(migrationBuilder, "PharmacyStaffMembers", "Role", StaffRole);
            ToInteger(migrationBuilder, "PharmacySettings", "PaymentPolicy", PaymentPolicy);
            ToInteger(migrationBuilder, "InventoryBatches", "Status", BatchStatus);
            ToInteger(migrationBuilder, "GamotLedgerTransactions", "Status", GamotTransactionStatus);
        }

        private static void ToText(MigrationBuilder migrationBuilder, string table, string column, string[] names)
        {
            var branches = string.Join(" ", names.Select((name, value) => $"WHEN {value} THEN '{name}'"));
            migrationBuilder.Sql(
                $"ALTER TABLE \"{Schema}\".\"{table}\" ALTER COLUMN \"{column}\" TYPE character varying(64) " +
                $"USING CASE \"{column}\" {branches} END;");
        }

        private static void ToInteger(MigrationBuilder migrationBuilder, string table, string column, string[] names)
        {
            var branches = string.Join(" ", names.Select((name, value) => $"WHEN '{name}' THEN {value}"));
            migrationBuilder.Sql(
                $"ALTER TABLE \"{Schema}\".\"{table}\" ALTER COLUMN \"{column}\" TYPE integer " +
                $"USING CASE \"{column}\" {branches} END;");
        }
    }
}
