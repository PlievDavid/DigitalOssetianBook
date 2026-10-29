using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace IronLanguage.Db.Migrations;

[DbContext(typeof(AdamDbContext))]
[Migration("20261019010000_ReadingIllustrations")]
public sealed class ReadingIllustrations : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<string>("IllustrationsJson", "Books", type: "text", nullable: false, defaultValue: "[]");
        migrationBuilder.AddColumn<bool>("TranslationReviewed", "Books", type: "boolean", nullable: false, defaultValue: true);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropColumn("IllustrationsJson", "Books");
        migrationBuilder.DropColumn("TranslationReviewed", "Books");
    }
}
