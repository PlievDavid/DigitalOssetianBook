using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace IronLanguage.Db.Migrations;

[DbContext(typeof(AdamDbContext))]
[Migration("20261027020000_ChapterTranslations")]
public sealed class ChapterTranslations : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<string>("Translation", "Chapters", type: "text", nullable: false, defaultValue: "");
        // A whole-book translation can be assigned safely only when there is a single chapter.
        // Keep the legacy fields intact for old revisions and ambiguous multi-chapter books.
        migrationBuilder.Sql("""
            UPDATE "Chapters" AS c SET "Translation" = CASE WHEN b."TranslationReviewed"
                THEN b."LiteraryTranslation" ELSE b."DraftTranslation" END
            FROM "Books" AS b WHERE c."BookId" = b."Id"
                AND (SELECT count(*) FROM "Chapters" AS siblings WHERE siblings."BookId" = b."Id") = 1;
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        // Preserve edited chapter translations before dropping the chapter column.
        migrationBuilder.Sql("""
            UPDATE "Books" AS b SET
                "LiteraryTranslation" = CASE WHEN b."TranslationReviewed" THEN t.text ELSE b."LiteraryTranslation" END,
                "DraftTranslation" = CASE WHEN b."TranslationReviewed" THEN b."DraftTranslation" ELSE t.text END
            FROM (SELECT "BookId", string_agg("Translation", E'\n\n' ORDER BY "Number") AS text
                FROM "Chapters" WHERE "Translation" <> '' GROUP BY "BookId") AS t
            WHERE b."Id" = t."BookId";
            """);
        migrationBuilder.DropColumn("Translation", "Chapters");
    }
}
