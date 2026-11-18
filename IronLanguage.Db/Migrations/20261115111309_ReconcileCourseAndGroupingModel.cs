using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace IronLanguage.Db.Migrations
{
    /// <inheritdoc />
    public partial class ReconcileCourseAndGroupingModel : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                DO $cleanup$
                BEGIN
                    IF EXISTS (SELECT 1 FROM "CourseLessonSessions"
                               WHERE jsonb_typeof("AttemptIdsJson"::jsonb) IS DISTINCT FROM 'array') THEN
                        RAISE NOTICE 'Course practice cleanup skipped: unexpected session format.';
                        RETURN;
                    END IF;

                    WITH refs AS MATERIALIZED (
                        SELECT s."Id" AS session_id, s."UserId" AS user_id, s."StartedAt" AS started_at, a.id::uuid AS attempt_id
                        FROM "CourseLessonSessions" s
                        CROSS JOIN LATERAL jsonb_array_elements_text(s."AttemptIdsJson"::jsonb) a(id)
                        WHERE a.id IS NOT NULL
                    ), links AS (
                        SELECT DISTINCT ON (user_id, attempt_id) user_id, attempt_id, session_id
                        FROM refs
                        ORDER BY user_id, attempt_id, started_at, session_id
                    ), repaired AS (
                        UPDATE "CoursePracticeRuns" r SET "SessionId" = l.session_id
                        FROM links l
                        WHERE r."SessionId" IS NULL AND r."UserId" = l.user_id AND r."Id" = l.attempt_id
                    )
                    DELETE FROM "CoursePracticeRuns" r
                    WHERE r."SessionId" IS NULL AND NOT EXISTS (SELECT 1 FROM refs WHERE refs.attempt_id = r."Id");
                EXCEPTION WHEN invalid_text_representation THEN
                    RAISE NOTICE 'Course practice cleanup skipped: malformed session references.';
                END $cleanup$;
                """);
        }

        /// <inheritdoc />
        // This migration only repairs links and removes records with no references.
        protected override void Down(MigrationBuilder migrationBuilder) { }
    }
}
