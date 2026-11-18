using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace IronLanguage.Db.Migrations
{
    /// <inheritdoc />
    public partial class CoursePracticeSession : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "SessionId",
                table: "CoursePracticeRuns",
                type: "uuid",
                nullable: true);

            migrationBuilder.Sql("""
                WITH links AS (
                    SELECT DISTINCT ON (run."Id") run."Id" AS run_id, session."Id" AS session_id
                    FROM "CourseLessonSessions" AS session
                    CROSS JOIN LATERAL jsonb_array_elements_text(
                        CASE WHEN jsonb_typeof(session."AttemptIdsJson"::jsonb) = 'array'
                            THEN session."AttemptIdsJson"::jsonb ELSE '[]'::jsonb END
                    ) AS attempt(id)
                    JOIN "CoursePracticeRuns" AS run ON run."UserId" = session."UserId" AND run."Id"::text = lower(attempt.id)
                    ORDER BY run."Id", session."StartedAt", session."Id"
                )
                UPDATE "CoursePracticeRuns" AS run SET "SessionId" = links.session_id
                FROM links WHERE run."Id" = links.run_id
                """);

            migrationBuilder.CreateIndex(
                name: "IX_CoursePracticeRuns_SessionId",
                table: "CoursePracticeRuns",
                column: "SessionId");

            migrationBuilder.AddForeignKey(
                name: "FK_CoursePracticeRuns_CourseLessonSessions_SessionId",
                table: "CoursePracticeRuns",
                column: "SessionId",
                principalTable: "CourseLessonSessions",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_CoursePracticeRuns_CourseLessonSessions_SessionId",
                table: "CoursePracticeRuns");

            migrationBuilder.DropIndex(
                name: "IX_CoursePracticeRuns_SessionId",
                table: "CoursePracticeRuns");

            migrationBuilder.DropColumn(
                name: "SessionId",
                table: "CoursePracticeRuns");
        }
    }
}
