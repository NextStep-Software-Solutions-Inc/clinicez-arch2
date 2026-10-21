using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ClinicEz.Clinic.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class NormalizeLegacyDentalToothStatuses : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                UPDATE public."DentalToothRecords" SET "Status" = 'Decayed' WHERE "Status" = 'Decay';
                UPDATE public."DentalToothRecords" SET "Status" = 'Crowned' WHERE "Status" = 'Crown';
                UPDATE public."DentalToothRecords" SET "Status" = 'ForExtraction' WHERE "Status" = 'Extraction';
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                UPDATE public."DentalToothRecords" SET "Status" = 'Decay' WHERE "Status" = 'Decayed';
                UPDATE public."DentalToothRecords" SET "Status" = 'Crown' WHERE "Status" = 'Crowned';
                UPDATE public."DentalToothRecords" SET "Status" = 'Extraction' WHERE "Status" = 'ForExtraction';
                """);
        }
    }
}
