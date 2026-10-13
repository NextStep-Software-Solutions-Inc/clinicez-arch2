using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ClinicEz.Patient.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddManagedDependentsToPatient : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "managed_by_patient_id",
                table: "patients",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "relationship_to_manager",
                table: "patients",
                type: "character varying(50)",
                maxLength: 50,
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "ix_patients_managed_by_patient_id",
                table: "patients",
                column: "managed_by_patient_id");

            migrationBuilder.AddForeignKey(
                name: "fk_patients_patients_managed_by_patient_id",
                table: "patients",
                column: "managed_by_patient_id",
                principalTable: "patients",
                principalColumn: "id",
                onDelete: ReferentialAction.SetNull);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "fk_patients_patients_managed_by_patient_id",
                table: "patients");

            migrationBuilder.DropIndex(
                name: "ix_patients_managed_by_patient_id",
                table: "patients");

            migrationBuilder.DropColumn(
                name: "managed_by_patient_id",
                table: "patients");

            migrationBuilder.DropColumn(
                name: "relationship_to_manager",
                table: "patients");
        }
    }
}
