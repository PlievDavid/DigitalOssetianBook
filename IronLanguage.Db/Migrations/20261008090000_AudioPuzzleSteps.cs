using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace IronLanguage.Db.Migrations;

[DbContext(typeof(AdamDbContext))]
[Migration("20261008090000_AudioPuzzleSteps")]
public sealed class AudioPuzzleSteps : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<string>("DistractorsJson", "Exercises", type: "text", nullable: false, defaultValue: "[]");
        migrationBuilder.AddColumn<string>("DistractorsJson", "Attempts", type: "text", nullable: false, defaultValue: "[]");
        // Старый формат аудиопазлов (сборка из общего набора плиток) больше не поддерживается: удаляем такие материалы и попытки.
        migrationBuilder.Sql("DELETE FROM \"Attempts\" WHERE \"ExerciseId\" IN (SELECT \"Id\" FROM \"Exercises\" WHERE \"Kind\" = 'audio')");
        migrationBuilder.Sql("DELETE FROM \"ContentRevisions\" WHERE \"Kind\" = 'audio'");
        migrationBuilder.Sql("DELETE FROM \"Exercises\" WHERE \"Kind\" = 'audio'");
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropColumn("DistractorsJson", "Attempts");
        migrationBuilder.DropColumn("DistractorsJson", "Exercises");
    }
}
