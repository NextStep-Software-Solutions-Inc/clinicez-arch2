using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ClinicEz.Portal.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddTvDisplayPinToFacilityQueueBoard : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            if (migrationBuilder.ActiveProvider == "Npgsql.EntityFrameworkCore.PostgreSQL")
            {
                migrationBuilder.Sql(
                    """ALTER TABLE public."FacilityQueueBoards" ADD COLUMN IF NOT EXISTS "TvDisplayPin" character varying(50);""");
            }
            else
            {
                migrationBuilder.AddColumn<string>(
                    name: "TvDisplayPin",
                    schema: "public",
                    table: "FacilityQueueBoards",
                    type: "character varying(50)",
                    maxLength: 50,
                    nullable: true);
            }
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            if (migrationBuilder.ActiveProvider == "Npgsql.EntityFrameworkCore.PostgreSQL")
            {
                migrationBuilder.Sql(
                    """ALTER TABLE public."FacilityQueueBoards" DROP COLUMN IF EXISTS "TvDisplayPin";""");
            }
            else
            {
                migrationBuilder.DropColumn(
                    name: "TvDisplayPin",
                    schema: "public",
                    table: "FacilityQueueBoards");
            }
        }
    }
}
