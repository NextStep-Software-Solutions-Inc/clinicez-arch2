using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ClinicEz.Clinic.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddClinicAnalyticsIndicesAndDoctorShare : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<decimal>(
                name: "DefaultDoctorSharePercentage",
                schema: "public",
                table: "ClinicSettings",
                type: "numeric",
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.CreateIndex(
                name: "IX_QueueItems_TenantId_ClinicId_CheckInTime",
                schema: "public",
                table: "QueueItems",
                columns: new[] { "TenantId", "ClinicId", "CheckInTime" });

            migrationBuilder.CreateIndex(
                name: "IX_Procedures_TenantId_ClinicId_ScheduledAt",
                schema: "public",
                table: "Procedures",
                columns: new[] { "TenantId", "ClinicId", "ScheduledAt" });

            migrationBuilder.CreateIndex(
                name: "IX_Payments_TenantId_ClinicId_PaymentDate",
                schema: "public",
                table: "Payments",
                columns: new[] { "TenantId", "ClinicId", "PaymentDate" });

            migrationBuilder.CreateIndex(
                name: "IX_LabOrders_TenantId_ClinicId_OrderDate",
                schema: "public",
                table: "LabOrders",
                columns: new[] { "TenantId", "ClinicId", "OrderDate" });

            migrationBuilder.CreateIndex(
                name: "IX_Consultations_TenantId_ClinicId_EncounterDate",
                schema: "public",
                table: "Consultations",
                columns: new[] { "TenantId", "ClinicId", "EncounterDate" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_QueueItems_TenantId_ClinicId_CheckInTime",
                schema: "public",
                table: "QueueItems");

            migrationBuilder.DropIndex(
                name: "IX_Procedures_TenantId_ClinicId_ScheduledAt",
                schema: "public",
                table: "Procedures");

            migrationBuilder.DropIndex(
                name: "IX_Payments_TenantId_ClinicId_PaymentDate",
                schema: "public",
                table: "Payments");

            migrationBuilder.DropIndex(
                name: "IX_LabOrders_TenantId_ClinicId_OrderDate",
                schema: "public",
                table: "LabOrders");

            migrationBuilder.DropIndex(
                name: "IX_Consultations_TenantId_ClinicId_EncounterDate",
                schema: "public",
                table: "Consultations");

            migrationBuilder.DropColumn(
                name: "DefaultDoctorSharePercentage",
                schema: "public",
                table: "ClinicSettings");
        }
    }
}
