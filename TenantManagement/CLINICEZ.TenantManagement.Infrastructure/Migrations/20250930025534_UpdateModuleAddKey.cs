using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ERP_EZ.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class UpdateModuleAddKey : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Key",
                schema: "catalog",
                table: "Modules",
                type: "text",
                nullable: false,
                defaultValue: "");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Key",
                schema: "catalog",
                table: "Modules");
        }
    }
}
