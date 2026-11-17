using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Scry.Api.Storage.Migrations
{
    /// <inheritdoc />
    public partial class FirstWorkspace : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // One batch in its own transaction: MySQL stops a batch at its first error, and the rollback undoes the rest.
            // Each statement skips what an earlier run did, so a run that stopped can be run again.
            migrationBuilder.Sql(
                """
                START TRANSACTION;
                INSERT INTO `workspaces` (`Name`, `Folder`, `CreatedAt`)
                SELECT 'Default', 'default', UTC_TIMESTAMP(6) FROM DUAL
                WHERE NOT EXISTS (SELECT 1 FROM `workspaces` WHERE `Folder` = 'default')
                  AND (EXISTS (SELECT 1 FROM `dashboards`) OR EXISTS (SELECT 1 FROM `sources`) OR EXISTS (SELECT 1 FROM `ingest_keys`) OR EXISTS (SELECT 1 FROM `nexus_link`) OR EXISTS (SELECT 1 FROM `connections`));
                UPDATE `dashboards` SET `WorkspaceId` = (SELECT `Id` FROM `workspaces` WHERE `Folder` = 'default') WHERE `WorkspaceId` IS NULL;
                UPDATE `sources` SET `WorkspaceId` = (SELECT `Id` FROM `workspaces` WHERE `Folder` = 'default') WHERE `WorkspaceId` IS NULL;
                UPDATE `ingest_keys` SET `WorkspaceId` = (SELECT `Id` FROM `workspaces` WHERE `Folder` = 'default') WHERE `WorkspaceId` IS NULL;
                UPDATE `nexus_link` SET `WorkspaceId` = (SELECT `Id` FROM `workspaces` WHERE `Folder` = 'default') WHERE `WorkspaceId` IS NULL;
                UPDATE `connections` SET `WorkspaceId` = (SELECT `Id` FROM `workspaces` WHERE `Folder` = 'default') WHERE `WorkspaceId` IS NULL;
                COMMIT;
                """,
                suppressTransaction: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(
                """
                START TRANSACTION;
                UPDATE `dashboards` SET `WorkspaceId` = NULL;
                UPDATE `sources` SET `WorkspaceId` = NULL;
                UPDATE `ingest_keys` SET `WorkspaceId` = NULL;
                UPDATE `nexus_link` SET `WorkspaceId` = NULL;
                UPDATE `connections` SET `WorkspaceId` = NULL;
                DELETE FROM `workspaces` WHERE `Folder` = 'default';
                COMMIT;
                """,
                suppressTransaction: true);
        }
    }
}
