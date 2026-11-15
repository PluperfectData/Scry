using System;
using Microsoft.EntityFrameworkCore.Metadata;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Scry.Api.Storage.Migrations
{
    /// <inheritdoc />
    public partial class PushApi : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "IngestKeyId",
                table: "sources",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "PrimaryKey",
                table: "sources",
                type: "longtext",
                nullable: true)
                .Annotation("MySql:CharSet", "utf8mb4");

            migrationBuilder.AddColumn<bool>(
                name: "Pushed",
                table: "sources",
                type: "tinyint(1)",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<string>(
                name: "Replacement",
                table: "sources",
                type: "longtext",
                nullable: true)
                .Annotation("MySql:CharSet", "utf8mb4");

            migrationBuilder.CreateTable(
                name: "ingest_keys",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("MySql:ValueGenerationStrategy", MySqlValueGenerationStrategy.IdentityColumn),
                    Name = table.Column<string>(type: "varchar(100)", maxLength: 100, nullable: false)
                        .Annotation("MySql:CharSet", "utf8mb4"),
                    Hash = table.Column<string>(type: "varchar(64)", maxLength: 64, nullable: false)
                        .Annotation("MySql:CharSet", "utf8mb4"),
                    Prefix = table.Column<string>(type: "varchar(16)", maxLength: 16, nullable: false)
                        .Annotation("MySql:CharSet", "utf8mb4"),
                    CreatedAt = table.Column<DateTime>(type: "datetime(6)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ingest_keys", x => x.Id);
                })
                .Annotation("MySql:CharSet", "utf8mb4");

            migrationBuilder.CreateIndex(
                name: "IX_sources_IngestKeyId",
                table: "sources",
                column: "IngestKeyId");

            migrationBuilder.CreateIndex(
                name: "IX_ingest_keys_Hash",
                table: "ingest_keys",
                column: "Hash",
                unique: true);

            migrationBuilder.AddForeignKey(
                name: "FK_sources_ingest_keys_IngestKeyId",
                table: "sources",
                column: "IngestKeyId",
                principalTable: "ingest_keys",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_sources_ingest_keys_IngestKeyId",
                table: "sources");

            migrationBuilder.DropTable(
                name: "ingest_keys");

            migrationBuilder.DropIndex(
                name: "IX_sources_IngestKeyId",
                table: "sources");

            migrationBuilder.DropColumn(
                name: "IngestKeyId",
                table: "sources");

            migrationBuilder.DropColumn(
                name: "PrimaryKey",
                table: "sources");

            migrationBuilder.DropColumn(
                name: "Pushed",
                table: "sources");

            migrationBuilder.DropColumn(
                name: "Replacement",
                table: "sources");
        }
    }
}
