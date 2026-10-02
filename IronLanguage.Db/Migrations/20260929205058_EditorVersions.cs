using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace IronLanguage.Db.Migrations
{
    /// <inheritdoc />
    public partial class EditorVersions : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "Version",
                table: "Words",
                type: "integer",
                nullable: false,
                defaultValue: 1);

            migrationBuilder.AddColumn<int>(
                name: "Version",
                table: "Books",
                type: "integer",
                nullable: false,
                defaultValue: 1);

            migrationBuilder.AddColumn<string>(
                name: "AudioPath",
                table: "Attempts",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Explanation",
                table: "Attempts",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "RussianPrompt",
                table: "Attempts",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "TokensJson",
                table: "Attempts",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "WordIdsJson",
                table: "Attempts",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.Sql("""
                UPDATE "Attempts" AS a
                SET "TokensJson" = e."TokensJson",
                    "WordIdsJson" = e."WordIdsJson",
                    "RussianPrompt" = e."RussianPrompt",
                    "Explanation" = e."Explanation",
                    "AudioPath" = e."AudioPath"
                FROM "Exercises" AS e
                WHERE a."ExerciseId" = e."Id";
                """);

            migrationBuilder.CreateTable(
                name: "ContentRevisions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Kind = table.Column<string>(type: "text", nullable: false),
                    ContentId = table.Column<Guid>(type: "uuid", nullable: false),
                    Version = table.Column<int>(type: "integer", nullable: false),
                    BaseVersion = table.Column<int>(type: "integer", nullable: false),
                    PayloadJson = table.Column<string>(type: "text", nullable: false),
                    Published = table.Column<bool>(type: "boolean", nullable: false),
                    EditorId = table.Column<Guid>(type: "uuid", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    PublishedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ContentRevisions", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_ContentRevisions_Kind_ContentId",
                table: "ContentRevisions",
                columns: new[] { "Kind", "ContentId" },
                unique: true,
                filter: "NOT \"Published\"");

            migrationBuilder.CreateIndex(
                name: "IX_ContentRevisions_Kind_ContentId_Version",
                table: "ContentRevisions",
                columns: new[] { "Kind", "ContentId", "Version" },
                unique: true,
                filter: "\"Published\"");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ContentRevisions");

            migrationBuilder.DropColumn(
                name: "Version",
                table: "Words");

            migrationBuilder.DropColumn(
                name: "Version",
                table: "Books");

            migrationBuilder.DropColumn(
                name: "AudioPath",
                table: "Attempts");

            migrationBuilder.DropColumn(
                name: "Explanation",
                table: "Attempts");

            migrationBuilder.DropColumn(
                name: "RussianPrompt",
                table: "Attempts");

            migrationBuilder.DropColumn(
                name: "TokensJson",
                table: "Attempts");

            migrationBuilder.DropColumn(
                name: "WordIdsJson",
                table: "Attempts");
        }
    }
}
