using System;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace IronLanguage.Db.Migrations;

[DbContext(typeof(AdamDbContext))]
[Migration("20260930120000_DictionaryLookup")]
public sealed class DictionaryLookup : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<string>("LiteraryTranslation", "Books", type: "text", nullable: false, defaultValue: "");
        migrationBuilder.AddColumn<Guid>("DictionarySenseId", "Words", type: "uuid", nullable: true);
        migrationBuilder.AddColumn<string>("DictionaryNote", "Words", type: "text", nullable: false, defaultValue: "");
        migrationBuilder.CreateTable("DictionarySenses", table => new
        {
            Id = table.Column<Guid>(type: "uuid", nullable: false),
            SourceRow = table.Column<int>(type: "integer", nullable: false),
            SourceColumn = table.Column<int>(type: "integer", nullable: false),
            Ossetian = table.Column<string>(type: "text", nullable: false),
            Russian = table.Column<string>(type: "text", nullable: false),
            RussianHeadword = table.Column<string>(type: "text", nullable: false),
            Note = table.Column<string>(type: "text", nullable: false),
            Active = table.Column<bool>(type: "boolean", nullable: false)
        }, constraints: table => table.PrimaryKey("PK_DictionarySenses", x => x.Id));
        migrationBuilder.CreateTable("DictionaryForms", table => new
        {
            SenseId = table.Column<Guid>(type: "uuid", nullable: false),
            SearchKey = table.Column<string>(type: "text", nullable: false)
        }, constraints: table =>
        {
            table.PrimaryKey("PK_DictionaryForms", x => new { x.SenseId, x.SearchKey });
            table.ForeignKey("FK_DictionaryForms_DictionarySenses_SenseId", x => x.SenseId,
                "DictionarySenses", "Id", onDelete: ReferentialAction.Cascade);
        });
        migrationBuilder.CreateIndex("IX_DictionaryForms_SearchKey", "DictionaryForms", "SearchKey");
        migrationBuilder.CreateIndex("IX_DictionarySenses_SourceRow_SourceColumn", "DictionarySenses", new[] { "SourceRow", "SourceColumn" });
        migrationBuilder.CreateIndex("IX_Words_DictionarySenseId", "Words", "DictionarySenseId", unique: true);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropTable("DictionaryForms");
        migrationBuilder.DropTable("DictionarySenses");
        migrationBuilder.DropIndex("IX_Words_DictionarySenseId", "Words");
        migrationBuilder.DropColumn("DictionarySenseId", "Words");
        migrationBuilder.DropColumn("DictionaryNote", "Words");
        migrationBuilder.DropColumn("LiteraryTranslation", "Books");
    }
}
