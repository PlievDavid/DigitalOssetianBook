using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace IronLanguage.Db.Migrations;

[DbContext(typeof(AdamDbContext))]
[Migration("20261019020000_ReadingDraftTranslation")]
public sealed class ReadingDraftTranslation : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<string>("DraftTranslation", "Books", type: "text", nullable: false, defaultValue: "");
        migrationBuilder.Sql("UPDATE \"Books\" SET \"DraftTranslation\" = \"LiteraryTranslation\", \"LiteraryTranslation\" = '' WHERE NOT \"TranslationReviewed\"");
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropColumn("DraftTranslation", "Books");
    }
}
