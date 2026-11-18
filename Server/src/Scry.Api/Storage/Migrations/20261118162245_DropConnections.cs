using System;
using Microsoft.EntityFrameworkCore.Metadata;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Scry.Api.Storage.Migrations
{
    /// <inheritdoc />
    public partial class DropConnections : Migration
    {
        private static readonly string[] DroppedColumns = ["ConnectionId", "Error", "Incremental", "State", "Status", "Stream"];

        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Each step checks information_schema first, so a run that stopped partway can be run again.
            string[] steps =
            [
                IfFound(
                    "TABLE_CONSTRAINTS",
                    "TABLE_NAME = 'sources' AND CONSTRAINT_NAME = 'FK_sources_connections_ConnectionId'",
                    "ALTER TABLE `sources` DROP FOREIGN KEY `FK_sources_connections_ConnectionId`"),
                "DROP TABLE IF EXISTS `connections`;",
                IfFound(
                    "STATISTICS",
                    "TABLE_NAME = 'sources' AND INDEX_NAME = 'IX_sources_ConnectionId'",
                    "ALTER TABLE `sources` DROP INDEX `IX_sources_ConnectionId`"),
                .. DroppedColumns.Select(column => IfFound(
                    "COLUMNS",
                    $"TABLE_NAME = 'sources' AND COLUMN_NAME = '{column}'",
                    $"ALTER TABLE `sources` DROP COLUMN `{column}`")),
            ];
            migrationBuilder.Sql(string.Join("\n", steps), suppressTransaction: true);
        }

        // Runs the statement only when information_schema's view has a row matching it in this database.
        private static string IfFound(string view, string match, string statement) =>
            $"""
            SET @step = IF((SELECT COUNT(*) FROM information_schema.{view} WHERE TABLE_SCHEMA = DATABASE() AND {match}) > 0, '{statement}', 'DO 0');
            PREPARE step FROM @step;
            EXECUTE step;
            DEALLOCATE PREPARE step;
            """;

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "ConnectionId",
                table: "sources",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Error",
                table: "sources",
                type: "varchar(1000)",
                maxLength: 1000,
                nullable: true)
                .Annotation("MySql:CharSet", "utf8mb4");

            migrationBuilder.AddColumn<bool>(
                name: "Incremental",
                table: "sources",
                type: "tinyint(1)",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<string>(
                name: "State",
                table: "sources",
                type: "longtext",
                nullable: true)
                .Annotation("MySql:CharSet", "utf8mb4");

            migrationBuilder.AddColumn<string>(
                name: "Status",
                table: "sources",
                type: "varchar(16)",
                maxLength: 16,
                nullable: false,
                defaultValue: "")
                .Annotation("MySql:CharSet", "utf8mb4");

            migrationBuilder.AddColumn<string>(
                name: "Stream",
                table: "sources",
                type: "varchar(255)",
                maxLength: 255,
                nullable: true)
                .Annotation("MySql:CharSet", "utf8mb4");

            migrationBuilder.CreateTable(
                name: "connections",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("MySql:ValueGenerationStrategy", MySqlValueGenerationStrategy.IdentityColumn),
                    Connector = table.Column<string>(type: "varchar(32)", maxLength: 32, nullable: false)
                        .Annotation("MySql:CharSet", "utf8mb4"),
                    CreatedAt = table.Column<DateTime>(type: "datetime(6)", nullable: false),
                    Settings = table.Column<string>(type: "longtext", nullable: false)
                        .Annotation("MySql:CharSet", "utf8mb4"),
                    Tokens = table.Column<string>(type: "longtext", nullable: true)
                        .Annotation("MySql:CharSet", "utf8mb4"),
                    WorkspaceId = table.Column<int>(type: "int", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_connections", x => x.Id);
                    table.ForeignKey(
                        name: "FK_connections_workspaces_WorkspaceId",
                        column: x => x.WorkspaceId,
                        principalTable: "workspaces",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                })
                .Annotation("MySql:CharSet", "utf8mb4");

            migrationBuilder.CreateIndex(
                name: "IX_sources_ConnectionId",
                table: "sources",
                column: "ConnectionId");

            migrationBuilder.CreateIndex(
                name: "IX_connections_WorkspaceId",
                table: "connections",
                column: "WorkspaceId");

            migrationBuilder.AddForeignKey(
                name: "FK_sources_connections_ConnectionId",
                table: "sources",
                column: "ConnectionId",
                principalTable: "connections",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }
    }
}
