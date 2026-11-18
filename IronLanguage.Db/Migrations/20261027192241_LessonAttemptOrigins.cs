using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace IronLanguage.Db.Migrations
{
    /// <inheritdoc />
    public partial class LessonAttemptOrigins : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "LessonRunId",
                table: "DialogueSessions",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "LessonRunId",
                table: "Attempts",
                type: "uuid",
                nullable: true);

            // Сохраняем изоляцию уже начатых уроков при последовательном обновлении.
            migrationBuilder.Sql("""
                UPDATE "Attempts" AS attempt
                SET "LessonRunId" = lesson."Id"
                FROM "LessonRuns" AS lesson
                WHERE attempt."UserId" = lesson."UserId"
                  AND (lesson."SnapshotJson"::jsonb -> 'attemptIds') ? attempt."Id"::text;
                UPDATE "DialogueSessions" AS session
                SET "LessonRunId" = lesson."Id"
                FROM "LessonRuns" AS lesson
                WHERE session."UserId" = lesson."UserId"
                  AND (lesson."SnapshotJson"::jsonb -> 'attemptIds') ? session."Id"::text;
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "LessonRunId",
                table: "DialogueSessions");

            migrationBuilder.DropColumn(
                name: "LessonRunId",
                table: "Attempts");
        }
    }
}
