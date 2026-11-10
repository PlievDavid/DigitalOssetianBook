using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace IronLanguage.Db.Migrations
{
    /// <inheritdoc />
    public partial class CoursePracticeAnalyticsAndAccess : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                UPDATE "Attempts" AS attempt
                SET "LessonRunId" = session."Id"
                FROM "CourseLessonSessions" AS session
                CROSS JOIN LATERAL jsonb_array_elements_text(session."AttemptIdsJson"::jsonb) AS ids(value)
                WHERE attempt."UserId" = session."UserId" AND attempt."Id"::text = ids.value
                    AND attempt."LessonRunId" IS NULL
                """);
            migrationBuilder.AddColumn<string>(
                name: "BlockReason",
                table: "Courses",
                type: "text",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "CourseBlockActivities",
                columns: table => new
                {
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    VersionId = table.Column<Guid>(type: "uuid", nullable: false),
                    BlockId = table.Column<Guid>(type: "uuid", nullable: false),
                    Key = table.Column<string>(type: "text", nullable: false),
                    CourseId = table.Column<Guid>(type: "uuid", nullable: false),
                    At = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    Correct = table.Column<bool>(type: "boolean", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CourseBlockActivities", x => new { x.UserId, x.VersionId, x.BlockId, x.Key });
                    table.ForeignKey(
                        name: "FK_CourseBlockActivities_Users_UserId",
                        column: x => x.UserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "CoursePracticeRuns",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    StateJson = table.Column<string>(type: "text", nullable: false),
                    Revision = table.Column<int>(type: "integer", nullable: false),
                    Complete = table.Column<bool>(type: "boolean", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CoursePracticeRuns", x => x.Id);
                    table.ForeignKey(
                        name: "FK_CoursePracticeRuns_Users_UserId",
                        column: x => x.UserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_CourseBlockActivities_CourseId_At",
                table: "CourseBlockActivities",
                columns: new[] { "CourseId", "At" });

            migrationBuilder.CreateIndex(
                name: "IX_CoursePracticeRuns_UserId",
                table: "CoursePracticeRuns",
                column: "UserId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "CourseBlockActivities");

            migrationBuilder.DropTable(
                name: "CoursePracticeRuns");

            migrationBuilder.DropColumn(
                name: "BlockReason",
                table: "Courses");
        }
    }
}
