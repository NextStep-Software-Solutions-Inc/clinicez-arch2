using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ClinicEz.Clinic.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddDoctorSchedulingAndGistExclusion : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // 1. Enable PostgreSQL btree_gist extension
            migrationBuilder.AlterDatabase()
                .Annotation("Npgsql:PostgresExtension:btree_gist", ",,");
            migrationBuilder.Sql("CREATE EXTENSION IF NOT EXISTS btree_gist;");

            // 2. Add EndTimeUtc to Appointments (nullable initially for backfill)
            migrationBuilder.AddColumn<DateTime>(
                name: "EndTimeUtc",
                schema: "clinic_dashboard",
                table: "Appointments",
                type: "timestamp with time zone",
                nullable: true);

            // 3. Backfill EndTimeUtc
            migrationBuilder.Sql(@"
                UPDATE clinic_dashboard.""Appointments""
                SET ""EndTimeUtc"" = ""ScheduledAt"" + (""DurationMinutes"" || ' minutes')::interval
                WHERE ""EndTimeUtc"" IS NULL;
            ");

            // 4. Set EndTimeUtc to NOT NULL
            migrationBuilder.AlterColumn<DateTime>(
                name: "EndTimeUtc",
                schema: "clinic_dashboard",
                table: "Appointments",
                type: "timestamp with time zone",
                nullable: false,
                defaultValue: new DateTime(1, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc),
                oldClrType: typeof(DateTime),
                oldType: "timestamp with time zone",
                oldNullable: true);

            // 5. Add xmin rowversion column
            migrationBuilder.AddColumn<uint>(
                name: "xmin",
                schema: "clinic_dashboard",
                table: "Appointments",
                type: "xid",
                rowVersion: true,
                nullable: false,
                defaultValue: 0u);

            // 6. Create DoctorScheduleTemplates
            migrationBuilder.CreateTable(
                name: "DoctorScheduleTemplates",
                schema: "clinic_dashboard",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    TenantId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    ClinicId = table.Column<Guid>(type: "uuid", nullable: false),
                    BranchId = table.Column<Guid>(type: "uuid", nullable: true),
                    DoctorId = table.Column<Guid>(type: "uuid", nullable: false),
                    DoctorName = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: false),
                    DayOfWeek = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    StartTime = table.Column<TimeOnly>(type: "time without time zone", nullable: false),
                    EndTime = table.Column<TimeOnly>(type: "time without time zone", nullable: false),
                    IsOvernightShift = table.Column<bool>(type: "boolean", nullable: false, defaultValue: false),
                    SlotDurationMinutes = table.Column<int>(type: "integer", nullable: false, defaultValue: 30),
                    MaxPatientsPerSlot = table.Column<int>(type: "integer", nullable: false, defaultValue: 1),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false, defaultValue: true),
                    EffectiveStartDate = table.Column<DateOnly>(type: "date", nullable: false),
                    EffectiveEndDate = table.Column<DateOnly>(type: "date", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CreatedBy = table.Column<string>(type: "text", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    UpdatedBy = table.Column<string>(type: "text", nullable: true),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false, defaultValue: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    DeletedBy = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_DoctorScheduleTemplates", x => x.Id);
                });

            // 7. Create DoctorBreakTimes
            migrationBuilder.CreateTable(
                name: "DoctorBreakTimes",
                schema: "clinic_dashboard",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    TemplateId = table.Column<Guid>(type: "uuid", nullable: false),
                    Description = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: false),
                    StartTime = table.Column<TimeOnly>(type: "time without time zone", nullable: false),
                    EndTime = table.Column<TimeOnly>(type: "time without time zone", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CreatedBy = table.Column<string>(type: "text", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    UpdatedBy = table.Column<string>(type: "text", nullable: true),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false, defaultValue: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    DeletedBy = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_DoctorBreakTimes", x => x.Id);
                    table.ForeignKey(
                        name: "FK_DoctorBreakTimes_DoctorScheduleTemplates_TemplateId",
                        column: x => x.TemplateId,
                        principalSchema: "clinic_dashboard",
                        principalTable: "DoctorScheduleTemplates",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            // 8. Create DoctorLeaves
            migrationBuilder.CreateTable(
                name: "DoctorLeaves",
                schema: "clinic_dashboard",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    TenantId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    ClinicId = table.Column<Guid>(type: "uuid", nullable: false),
                    DoctorId = table.Column<Guid>(type: "uuid", nullable: true),
                    DoctorName = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: false),
                    StartDate = table.Column<DateOnly>(type: "date", nullable: false),
                    EndDate = table.Column<DateOnly>(type: "date", nullable: false),
                    PartialDayStartTime = table.Column<TimeOnly>(type: "time without time zone", nullable: true),
                    PartialDayEndTime = table.Column<TimeOnly>(type: "time without time zone", nullable: true),
                    Reason = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    Status = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false, defaultValue: "Approved"),
                    LeaveType = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false, defaultValue: "Vacation"),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CreatedBy = table.Column<string>(type: "text", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    UpdatedBy = table.Column<string>(type: "text", nullable: true),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false, defaultValue: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    DeletedBy = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_DoctorLeaves", x => x.Id);
                });

            // 9. Create DoctorScheduleOverrides
            migrationBuilder.CreateTable(
                name: "DoctorScheduleOverrides",
                schema: "clinic_dashboard",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    TenantId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    ClinicId = table.Column<Guid>(type: "uuid", nullable: false),
                    DoctorId = table.Column<Guid>(type: "uuid", nullable: false),
                    DoctorName = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: false),
                    Date = table.Column<DateOnly>(type: "date", nullable: false),
                    IsWorking = table.Column<bool>(type: "boolean", nullable: false, defaultValue: true),
                    StartTime = table.Column<TimeOnly>(type: "time without time zone", nullable: false),
                    EndTime = table.Column<TimeOnly>(type: "time without time zone", nullable: false),
                    IsOvernightShift = table.Column<bool>(type: "boolean", nullable: false, defaultValue: false),
                    SlotDurationMinutes = table.Column<int>(type: "integer", nullable: false, defaultValue: 30),
                    Reason = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CreatedBy = table.Column<string>(type: "text", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    UpdatedBy = table.Column<string>(type: "text", nullable: true),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false, defaultValue: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    DeletedBy = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_DoctorScheduleOverrides", x => x.Id);
                });

            // Indexes
            migrationBuilder.CreateIndex(
                name: "IX_Appointments_ClinicId_DoctorId_ScheduledAt_EndTimeUtc",
                schema: "clinic_dashboard",
                table: "Appointments",
                columns: new[] { "ClinicId", "DoctorId", "ScheduledAt", "EndTimeUtc" });

            migrationBuilder.CreateIndex(
                name: "IX_DoctorScheduleTemplates_ClinicId_DoctorId_DayOfWeek_IsActive",
                schema: "clinic_dashboard",
                table: "DoctorScheduleTemplates",
                columns: new[] { "ClinicId", "DoctorId", "DayOfWeek", "IsActive" });

            migrationBuilder.CreateIndex(
                name: "IX_DoctorBreakTimes_TemplateId",
                schema: "clinic_dashboard",
                table: "DoctorBreakTimes",
                column: "TemplateId");

            migrationBuilder.CreateIndex(
                name: "IX_DoctorLeaves_ClinicId_DoctorId_StartDate_EndDate",
                schema: "clinic_dashboard",
                table: "DoctorLeaves",
                columns: new[] { "ClinicId", "DoctorId", "StartDate", "EndDate" });

            migrationBuilder.CreateIndex(
                name: "IX_DoctorScheduleOverrides_ClinicId_DoctorId_Date",
                schema: "clinic_dashboard",
                table: "DoctorScheduleOverrides",
                columns: new[] { "ClinicId", "DoctorId", "Date" });

            // 10. PostgreSQL GiST Exclusion Constraint on Appointments
            migrationBuilder.Sql(@"
                ALTER TABLE clinic_dashboard.""Appointments""
                ADD CONSTRAINT ""UQ_Doctor_No_Overlapping_Appointments""
                EXCLUDE USING gist (
                    ""ClinicId"" WITH =,
                    ""DoctorId"" WITH =,
                    tstzrange(""ScheduledAt"", ""EndTimeUtc"", '[)') WITH &&
                )
                WHERE (""Status"" != 'Cancelled' AND ""IsDeleted"" = false AND ""DoctorId"" IS NOT NULL);
            ");

            // 11. Grant schedules:read and schedules:manage permissions to Doctor and Admin roles
            migrationBuilder.Sql(@"
                UPDATE clinic_dashboard.""ClinicRoles""
                SET ""Permissions"" = regexp_replace(""Permissions"", '\]\s*$', ',""schedules:read"",""schedules:manage""]')
                WHERE ""IsSystem"" AND ""Name"" IN ('Attending Physician / Doctor', 'Clinic Administrator')
                  AND ""Permissions"" LIKE '[""%'
                  AND ""Permissions"" NOT LIKE '%schedules:read%';
            ");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(@"
                ALTER TABLE clinic_dashboard.""Appointments""
                DROP CONSTRAINT IF EXISTS ""UQ_Doctor_No_Overlapping_Appointments"";
            ");

            migrationBuilder.DropTable(
                name: "DoctorBreakTimes",
                schema: "clinic_dashboard");

            migrationBuilder.DropTable(
                name: "DoctorScheduleTemplates",
                schema: "clinic_dashboard");

            migrationBuilder.DropTable(
                name: "DoctorLeaves",
                schema: "clinic_dashboard");

            migrationBuilder.DropTable(
                name: "DoctorScheduleOverrides",
                schema: "clinic_dashboard");

            migrationBuilder.DropIndex(
                name: "IX_Appointments_ClinicId_DoctorId_ScheduledAt_EndTimeUtc",
                schema: "clinic_dashboard",
                table: "Appointments");

            migrationBuilder.DropColumn(
                name: "xmin",
                schema: "clinic_dashboard",
                table: "Appointments");

            migrationBuilder.DropColumn(
                name: "EndTimeUtc",
                schema: "clinic_dashboard",
                table: "Appointments");
        }
    }
}
