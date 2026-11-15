using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Scry.Api.Storage.Migrations
{
    /// <inheritdoc />
    public partial class DashboardPresentation : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Presentation",
                table: "dashboards",
                type: "longtext",
                nullable: true)
                .Annotation("MySql:CharSet", "utf8mb4");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Presentation",
                table: "dashboards");
        }
    }
}
