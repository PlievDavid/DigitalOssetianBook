using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace IronLanguage.Db.Migrations;

[DbContext(typeof(AdamDbContext))]
[Migration("20260930220000_BookMetadata")]
public sealed class BookMetadata : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<string>("Authors", "Books", type: "text", nullable: false, defaultValue: "");
        migrationBuilder.AddColumn<string>("Difficulty", "Books", type: "text", nullable: false, defaultValue: "");
        migrationBuilder.AddColumn<string>("CoverImagePath", "Books", type: "text", nullable: true);
        migrationBuilder.Sql("UPDATE \"Books\" SET \"Authors\" = 'Коста Хетагуров', \"Difficulty\" = 'Продвинутый', \"Description\" = 'Стихотворение о песне, труде и родной земле.', \"CoverImagePath\" = '/images/books/azar.svg' WHERE \"Id\" = '674c57f8-8512-4a3b-95ad-e99591b79c1d'");
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropColumn("CoverImagePath", "Books");
        migrationBuilder.DropColumn("Difficulty", "Books");
        migrationBuilder.DropColumn("Authors", "Books");
    }
}
