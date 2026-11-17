using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Scry.Api.Storage.Migrations
{
    /// <inheritdoc />
    public partial class WorkspaceRequired : Migration
    {
        private static readonly string[] NamePerWorkspace = ["WorkspaceId", "Name"];

        private static readonly string[] LandingPerWorkspace = ["WorkspaceId", "Landing"];

        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AlterColumn<int>(
                name: "WorkspaceId",
                table: "sources",
                type: "int",
                nullable: false,
                oldClrType: typeof(int),
                oldType: "int",
                oldNullable: true);

            migrationBuilder.AlterColumn<int>(
                name: "WorkspaceId",
                table: "nexus_link",
                type: "int",
                nullable: false,
                oldClrType: typeof(int),
                oldType: "int",
                oldNullable: true);

            migrationBuilder.AlterColumn<int>(
                name: "WorkspaceId",
                table: "ingest_keys",
                type: "int",
                nullable: false,
                oldClrType: typeof(int),
                oldType: "int",
                oldNullable: true);

            migrationBuilder.AlterColumn<int>(
                name: "WorkspaceId",
                table: "dashboards",
                type: "int",
                nullable: false,
                oldClrType: typeof(int),
                oldType: "int",
                oldNullable: true);

            migrationBuilder.AlterColumn<int>(
                name: "WorkspaceId",
                table: "connections",
                type: "int",
                nullable: false,
                oldClrType: typeof(int),
                oldType: "int",
                oldNullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_sources_WorkspaceId_Name",
                table: "sources",
                columns: NamePerWorkspace,
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_nexus_link_WorkspaceId",
                table: "nexus_link",
                column: "WorkspaceId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_ingest_keys_WorkspaceId",
                table: "ingest_keys",
                column: "WorkspaceId");

            migrationBuilder.CreateIndex(
                name: "IX_dashboards_WorkspaceId_Landing",
                table: "dashboards",
                columns: LandingPerWorkspace,
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_connections_WorkspaceId",
                table: "connections",
                column: "WorkspaceId");

            migrationBuilder.AddForeignKey(
                name: "FK_connections_workspaces_WorkspaceId",
                table: "connections",
                column: "WorkspaceId",
                principalTable: "workspaces",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_dashboards_workspaces_WorkspaceId",
                table: "dashboards",
                column: "WorkspaceId",
                principalTable: "workspaces",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_ingest_keys_workspaces_WorkspaceId",
                table: "ingest_keys",
                column: "WorkspaceId",
                principalTable: "workspaces",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_nexus_link_workspaces_WorkspaceId",
                table: "nexus_link",
                column: "WorkspaceId",
                principalTable: "workspaces",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_sources_workspaces_WorkspaceId",
                table: "sources",
                column: "WorkspaceId",
                principalTable: "workspaces",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.DropIndex(
                name: "IX_sources_Name",
                table: "sources");

            migrationBuilder.DropIndex(
                name: "IX_dashboards_Landing",
                table: "dashboards");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_connections_workspaces_WorkspaceId",
                table: "connections");

            migrationBuilder.DropForeignKey(
                name: "FK_dashboards_workspaces_WorkspaceId",
                table: "dashboards");

            migrationBuilder.DropForeignKey(
                name: "FK_ingest_keys_workspaces_WorkspaceId",
                table: "ingest_keys");

            migrationBuilder.DropForeignKey(
                name: "FK_nexus_link_workspaces_WorkspaceId",
                table: "nexus_link");

            migrationBuilder.DropForeignKey(
                name: "FK_sources_workspaces_WorkspaceId",
                table: "sources");

            migrationBuilder.DropIndex(
                name: "IX_sources_WorkspaceId_Name",
                table: "sources");

            migrationBuilder.DropIndex(
                name: "IX_nexus_link_WorkspaceId",
                table: "nexus_link");

            migrationBuilder.DropIndex(
                name: "IX_ingest_keys_WorkspaceId",
                table: "ingest_keys");

            migrationBuilder.DropIndex(
                name: "IX_dashboards_WorkspaceId_Landing",
                table: "dashboards");

            migrationBuilder.DropIndex(
                name: "IX_connections_WorkspaceId",
                table: "connections");

            migrationBuilder.AlterColumn<int>(
                name: "WorkspaceId",
                table: "sources",
                type: "int",
                nullable: true,
                oldClrType: typeof(int),
                oldType: "int");

            migrationBuilder.AlterColumn<int>(
                name: "WorkspaceId",
                table: "nexus_link",
                type: "int",
                nullable: true,
                oldClrType: typeof(int),
                oldType: "int");

            migrationBuilder.AlterColumn<int>(
                name: "WorkspaceId",
                table: "ingest_keys",
                type: "int",
                nullable: true,
                oldClrType: typeof(int),
                oldType: "int");

            migrationBuilder.AlterColumn<int>(
                name: "WorkspaceId",
                table: "dashboards",
                type: "int",
                nullable: true,
                oldClrType: typeof(int),
                oldType: "int");

            migrationBuilder.AlterColumn<int>(
                name: "WorkspaceId",
                table: "connections",
                type: "int",
                nullable: true,
                oldClrType: typeof(int),
                oldType: "int");

            migrationBuilder.CreateIndex(
                name: "IX_sources_Name",
                table: "sources",
                column: "Name",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_dashboards_Landing",
                table: "dashboards",
                column: "Landing",
                unique: true);
        }
    }
}
