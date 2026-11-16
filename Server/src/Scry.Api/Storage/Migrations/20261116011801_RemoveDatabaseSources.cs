using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Scry.Api.Storage.Migrations
{
    /// <inheritdoc />
    public partial class RemoveDatabaseSources : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(
                "DELETE s FROM `sources` AS s JOIN `connections` AS c ON c.`Id` = s.`ConnectionId` WHERE c.`Connector` IN ('mysql', 'postgres', 'sqlserver');");
            migrationBuilder.Sql("DELETE FROM `connections` WHERE `Connector` IN ('mysql', 'postgres', 'sqlserver');");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // The deleted sources and connections are not restored.
        }
    }
}
