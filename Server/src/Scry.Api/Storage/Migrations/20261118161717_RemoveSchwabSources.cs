using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Scry.Api.Storage.Migrations
{
    /// <inheritdoc />
    public partial class RemoveSchwabSources : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // One batch in its own transaction: MySQL stops a batch at its first error, and the rollback undoes the rest.
            migrationBuilder.Sql(
                """
                START TRANSACTION;
                DELETE s FROM `sources` AS s JOIN `connections` AS c ON c.`Id` = s.`ConnectionId` WHERE c.`Connector` = 'schwab';
                DELETE FROM `connections` WHERE `Connector` = 'schwab';
                COMMIT;
                """,
                suppressTransaction: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // The deleted sources and connections are not restored.
        }
    }
}
