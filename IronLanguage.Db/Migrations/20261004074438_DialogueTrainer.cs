using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace IronLanguage.Db.Migrations
{
    /// <inheritdoc />
    public partial class DialogueTrainer : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "DialogueRewards",
                columns: table => new
                {
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    DialogueId = table.Column<Guid>(type: "uuid", nullable: false),
                    Day = table.Column<DateOnly>(type: "date", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_DialogueRewards", x => new { x.UserId, x.DialogueId, x.Day });
                });

            migrationBuilder.CreateTable(
                name: "Dialogues",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Title = table.Column<string>(type: "text", nullable: false),
                    Dialect = table.Column<string>(type: "text", nullable: false),
                    Level = table.Column<int>(type: "integer", nullable: false),
                    ScriptJson = table.Column<string>(type: "text", nullable: false),
                    Published = table.Column<bool>(type: "boolean", nullable: false),
                    Archived = table.Column<bool>(type: "boolean", nullable: false),
                    Version = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Dialogues", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "DialogueSessions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    DialogueId = table.Column<Guid>(type: "uuid", nullable: false),
                    DialogueVersion = table.Column<int>(type: "integer", nullable: false),
                    DialogueTitle = table.Column<string>(type: "text", nullable: false),
                    ScriptJson = table.Column<string>(type: "text", nullable: false),
                    StateJson = table.Column<string>(type: "text", nullable: false),
                    Attempts = table.Column<int>(type: "integer", nullable: false),
                    Errors = table.Column<int>(type: "integer", nullable: false),
                    Hints = table.Column<int>(type: "integer", nullable: false),
                    TurnsCompleted = table.Column<int>(type: "integer", nullable: false),
                    StartedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CompletedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_DialogueSessions", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_DialogueSessions_UserId_DialogueId_CompletedAt",
                table: "DialogueSessions",
                columns: new[] { "UserId", "DialogueId", "CompletedAt" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "DialogueRewards");

            migrationBuilder.DropTable(
                name: "Dialogues");

            migrationBuilder.DropTable(
                name: "DialogueSessions");
        }
    }
}
