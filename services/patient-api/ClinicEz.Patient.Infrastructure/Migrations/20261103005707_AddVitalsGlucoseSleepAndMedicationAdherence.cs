using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ClinicEz.Patient.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddVitalsGlucoseSleepAndMedicationAdherence : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AlterColumn<Guid>(
                name: "clinic_id",
                table: "vital_signs",
                type: "uuid",
                nullable: true,
                oldClrType: typeof(Guid),
                oldType: "uuid");

            migrationBuilder.AddColumn<decimal>(
                name: "blood_glucose_mg_dl",
                table: "vital_signs",
                type: "numeric(5,1)",
                precision: 5,
                scale: 1,
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "sleep_hours",
                table: "vital_signs",
                type: "numeric(4,2)",
                precision: 4,
                scale: 2,
                nullable: true);

            migrationBuilder.CreateTable(
                name: "patient_medication_adherences",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    patient_id = table.Column<Guid>(type: "uuid", nullable: false),
                    patient_medication_id = table.Column<Guid>(type: "uuid", nullable: false),
                    taken_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    is_taken = table.Column<bool>(type: "boolean", nullable: false),
                    dose_slot = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    notes = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    xmin = table.Column<uint>(type: "xid", rowVersion: true, nullable: false),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    created_by = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    updated_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    updated_by = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true),
                    is_deleted = table.Column<bool>(type: "boolean", nullable: false),
                    deleted_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    deleted_by = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_patient_medication_adherences", x => x.id);
                    table.ForeignKey(
                        name: "fk_patient_medication_adherences_patient_medications_patient_m",
                        column: x => x.patient_medication_id,
                        principalTable: "patient_medications",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "fk_patient_medication_adherences_patients_patient_id",
                        column: x => x.patient_id,
                        principalTable: "patients",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "ix_patient_medication_adherences_patient_id_taken_at",
                table: "patient_medication_adherences",
                columns: new[] { "patient_id", "taken_at" });

            migrationBuilder.CreateIndex(
                name: "ix_patient_medication_adherences_patient_medication_id_taken_at",
                table: "patient_medication_adherences",
                columns: new[] { "patient_medication_id", "taken_at" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "patient_medication_adherences");

            migrationBuilder.DropColumn(
                name: "blood_glucose_mg_dl",
                table: "vital_signs");

            migrationBuilder.DropColumn(
                name: "sleep_hours",
                table: "vital_signs");

            migrationBuilder.AlterColumn<Guid>(
                name: "clinic_id",
                table: "vital_signs",
                type: "uuid",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"),
                oldClrType: typeof(Guid),
                oldType: "uuid",
                oldNullable: true);
        }
    }
}
