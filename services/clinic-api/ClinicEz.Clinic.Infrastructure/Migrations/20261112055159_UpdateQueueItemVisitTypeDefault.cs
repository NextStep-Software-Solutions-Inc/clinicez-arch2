using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ClinicEz.Clinic.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class UpdateQueueItemVisitTypeDefault : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AlterColumn<string>(
                name: "VisitType",
                schema: "public",
                table: "QueueItems",
                type: "character varying(50)",
                maxLength: 50,
                nullable: false,
                defaultValue: "RoutineCheckup",
                oldClrType: typeof(string),
                oldType: "character varying(50)",
                oldMaxLength: 50,
                oldDefaultValue: "Consultation");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AlterColumn<string>(
                name: "VisitType",
                schema: "public",
                table: "QueueItems",
                type: "character varying(50)",
                maxLength: 50,
                nullable: false,
                defaultValue: "Consultation",
                oldClrType: typeof(string),
                oldType: "character varying(50)",
                oldMaxLength: 50,
                oldDefaultValue: "RoutineCheckup");
        }
    }
}
