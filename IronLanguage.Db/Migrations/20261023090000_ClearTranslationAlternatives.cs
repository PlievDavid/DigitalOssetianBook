using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace IronLanguage.Db.Migrations;

[DbContext(typeof(AdamDbContext))]
[Migration("20261023090000_ClearTranslationAlternatives")]
public sealed class ClearTranslationAlternatives : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        // Поле «Другие допустимые ответы» убрано из конструктора «Собери фразу»: чистим сохранённые альтернативы.
        migrationBuilder.Sql("UPDATE \"Exercises\" SET \"AlternativesJson\" = '[]' WHERE \"Kind\" = 'translation'");
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        // Восстановить альтернативы после Down невозможно.
    }
}
