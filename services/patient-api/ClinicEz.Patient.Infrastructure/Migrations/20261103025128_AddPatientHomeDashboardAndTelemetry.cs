using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ClinicEz.Patient.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddPatientHomeDashboardAndTelemetry : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "deep_sleep_minutes",
                table: "vital_signs",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "fasting_blood_glucose_mg_dl",
                table: "vital_signs",
                type: "numeric(6,1)",
                precision: 6,
                scale: 1,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "sleep_duration_minutes",
                table: "vital_signs",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "source",
                table: "vital_signs",
                type: "character varying(40)",
                maxLength: 40,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "welcome_visited_steps_json",
                table: "patients",
                type: "character varying(256)",
                maxLength: 256,
                nullable: false,
                defaultValue: "[]");

            migrationBuilder.AddColumn<DateTime>(
                name: "checked_in_at",
                table: "appointments",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "patient_medication_logs",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    patient_id = table.Column<Guid>(type: "uuid", nullable: false),
                    patient_medication_id = table.Column<Guid>(type: "uuid", nullable: false),
                    log_date = table.Column<DateOnly>(type: "date", nullable: false),
                    scheduled_time_label = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: true),
                    taken_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    notes = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    xmin = table.Column<uint>(type: "xid", rowVersion: true, nullable: false),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    created_by = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    updated_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    updated_by = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true),
                    is_deleted = table.Column<bool>(type: "boolean", nullable: false),
                    deleted_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    deleted_by = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_patient_medication_logs", x => x.id);
                    table.ForeignKey(
                        name: "fk_patient_medication_logs_patient_medications_patient_medicat",
                        column: x => x.patient_medication_id,
                        principalTable: "patient_medications",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "fk_patient_medication_logs_patients_patient_id",
                        column: x => x.patient_id,
                        principalTable: "patients",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "ix_patient_medication_logs_patient_id_patient_medication_id_lo",
                table: "patient_medication_logs",
                columns: new[] { "patient_id", "patient_medication_id", "log_date" },
                unique: true,
                filter: "is_deleted = false");

            migrationBuilder.CreateIndex(
                name: "ix_patient_medication_logs_patient_medication_id",
                table: "patient_medication_logs",
                column: "patient_medication_id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "patient_medication_logs");

            migrationBuilder.DropColumn(
                name: "deep_sleep_minutes",
                table: "vital_signs");

            migrationBuilder.DropColumn(
                name: "fasting_blood_glucose_mg_dl",
                table: "vital_signs");

            migrationBuilder.DropColumn(
                name: "sleep_duration_minutes",
                table: "vital_signs");

            migrationBuilder.DropColumn(
                name: "source",
                table: "vital_signs");

            migrationBuilder.DropColumn(
                name: "welcome_visited_steps_json",
                table: "patients");

            migrationBuilder.DropColumn(
                name: "checked_in_at",
                table: "appointments");
        }
    }
}
