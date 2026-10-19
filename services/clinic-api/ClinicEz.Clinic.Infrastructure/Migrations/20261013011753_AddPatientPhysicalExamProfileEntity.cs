using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ClinicEz.Clinic.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddPatientPhysicalExamProfileEntity : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "PatientPhysicalExamProfiles",
                schema: "clinic_dashboard",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    ClinicId = table.Column<Guid>(type: "uuid", nullable: false),
                    PatientId = table.Column<Guid>(type: "uuid", nullable: false),
                    GenSurveyId = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: false, defaultValue: "1"),
                    GenSurveyRemarks = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    SkinId = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: false, defaultValue: "1"),
                    SkinRemarks = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    HeentId = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: false, defaultValue: "11"),
                    HeentRemarks = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    ChestId = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: false, defaultValue: "6"),
                    ChestRemarks = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    HeartId = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: false, defaultValue: "5"),
                    HeartRemarks = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    AbdomenId = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: false, defaultValue: "7"),
                    AbdomenRemarks = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    NeuroId = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: false, defaultValue: "6"),
                    NeuroRemarks = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    RectalId = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: false, defaultValue: "1"),
                    RectalRemarks = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    GuId = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: false, defaultValue: "1"),
                    GuRemarks = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
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
                    table.PrimaryKey("PK_PatientPhysicalExamProfiles", x => x.Id);
                    table.ForeignKey(
                        name: "FK_PatientPhysicalExamProfiles_Patients_PatientId",
                        column: x => x.PatientId,
                        principalSchema: "clinic_dashboard",
                        principalTable: "Patients",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_PatientPhysicalExamProfiles_PatientId",
                schema: "clinic_dashboard",
                table: "PatientPhysicalExamProfiles",
                column: "PatientId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_PatientPhysicalExamProfiles_TenantId_ClinicId_PatientId",
                schema: "clinic_dashboard",
                table: "PatientPhysicalExamProfiles",
                columns: new[] { "TenantId", "ClinicId", "PatientId" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "PatientPhysicalExamProfiles",
                schema: "clinic_dashboard");
        }
    }
}
