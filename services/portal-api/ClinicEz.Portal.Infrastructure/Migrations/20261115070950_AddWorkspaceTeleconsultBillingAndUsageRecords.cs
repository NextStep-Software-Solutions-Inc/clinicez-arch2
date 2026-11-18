using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ClinicEz.Portal.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddWorkspaceTeleconsultBillingAndUsageRecords : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "TeleconsultUsageRecords",
                schema: "public",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    CallId = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    DurationMinutes = table.Column<int>(type: "integer", nullable: false),
                    RatePerMinutePhp = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    TotalCostPhp = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    PrepaidDeductedPhp = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    PostpaidOveragePhp = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    CallStartedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CallEndedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CreatedBy = table.Column<string>(type: "text", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    UpdatedBy = table.Column<string>(type: "text", nullable: true),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    DeletedBy = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TeleconsultUsageRecords", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "WorkspaceTeleconsultBillings",
                schema: "public",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    IsEnabled = table.Column<bool>(type: "boolean", nullable: false),
                    BillingMode = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false, defaultValue: "Postpaid"),
                    RatePerMinutePhp = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false, defaultValue: 5.00m),
                    AllocatedBudgetPhp = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false, defaultValue: 0m),
                    PrepaidBalancePhp = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false, defaultValue: 0m),
                    AllowOverageBeyondAllocation = table.Column<bool>(type: "boolean", nullable: false, defaultValue: true),
                    CurrentPeriodYearMonth = table.Column<string>(type: "character varying(7)", maxLength: 7, nullable: false),
                    CurrentPeriodMinutesUsed = table.Column<int>(type: "integer", nullable: false),
                    CurrentPeriodBilledPhp = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false, defaultValue: 0m),
                    CurrentPeriodOveragePhp = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false, defaultValue: 0m),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CreatedBy = table.Column<string>(type: "text", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    UpdatedBy = table.Column<string>(type: "text", nullable: true),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    DeletedBy = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_WorkspaceTeleconsultBillings", x => x.Id);
                    table.ForeignKey(
                        name: "FK_WorkspaceTeleconsultBillings_Tenants_TenantId",
                        column: x => x.TenantId,
                        principalSchema: "public",
                        principalTable: "Tenants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_TeleconsultUsageRecords_CallId",
                schema: "public",
                table: "TeleconsultUsageRecords",
                column: "CallId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_TeleconsultUsageRecords_TenantId_CallEndedAtUtc",
                schema: "public",
                table: "TeleconsultUsageRecords",
                columns: new[] { "TenantId", "CallEndedAtUtc" });

            migrationBuilder.CreateIndex(
                name: "IX_WorkspaceTeleconsultBillings_TenantId",
                schema: "public",
                table: "WorkspaceTeleconsultBillings",
                column: "TenantId",
                unique: true,
                filter: "\"IsDeleted\" = false");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "TeleconsultUsageRecords",
                schema: "public");

            migrationBuilder.DropTable(
                name: "WorkspaceTeleconsultBillings",
                schema: "public");
        }
    }
}
