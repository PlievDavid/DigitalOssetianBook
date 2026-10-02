using System;
using System.Linq;
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace IronLanguage.Db.Migrations;

[DbContext(typeof(AdamDbContext))]
[Migration("20260930121000_AzarBook")]
public sealed class AzarBook : Migration
{
    private static readonly Guid BookId = Guid.Parse("674c57f8-8512-4a3b-95ad-e99591b79c1d");
    private static readonly Guid ChapterId = Guid.Parse("391de731-ed1f-4b85-897b-d51221b67a6e");

    private const string Ossetian = """
        Æз дæ зарынмæ куы хъусын,
        Уæд хъæлдзæгдæрæй фæкусын,
             О, мæ хуры хай, –
             Азар-ма, чызгай!..

        Мах бар нал ысты нæ сæртæ...
        Азар, цалынмæ дæ зæрдæ
             Не ссау фырмæстæй,
             Адæмы мæтæй!..

        Адæмæн зæхх у сæ дарæг...
        Азар!.. Ракæ мыл-иу хъарæг, –
             "О, мæ бон, – иу зæгъ, –
             Байстой нын нæ зæхх!.."

        Нал дæ бахъæудзæн ныр рувын..
        Азар!.. Сахуыр мæ кæ кувын!..
             Ма фæлидз тæргай,
             О, мæ хуры хай!..
        """;

    private const string Russian = """
        Слыша песнь твою, родная,
        Я тружусь, не уставая,
             Ты – луч солнца мой, –
             Спой, девица, спой!..

        Отнял враг свободу нашу...
        Спой! Уже страданий чаша
             До краев полна...
             Как горька она!

        Весь народ земля питает...
        Ты оплачь меня, родная, –
             «Как теперь, – скажи, –
             Без земли нам жить?!»

        Нам над пашней не трудиться.
        Спой! Учи меня молиться!..
             Не оставь меня,
             Ты – сиянье дня!..
        """;

    protected override void Up(MigrationBuilder migrationBuilder)
    {
        var tokens = Regex.Matches(Ossetian, @"\s+|[\p{L}\p{M}\p{N}]+(?:-[\p{L}\p{M}\p{N}]+)*|[^\s\p{L}\p{M}\p{N}]+")
            .Select(match => new MaterialToken(match.Value, null)).ToArray();
        static string Quote(string value) => "'" + value.Replace("'", "''") + "'";
        migrationBuilder.Sql($"INSERT INTO \"Books\" (\"Id\", \"Title\", \"Description\", \"LiteraryTranslation\", \"Published\", \"Version\") VALUES ('{BookId}', {Quote("Азар!")}, {Quote("Стихотворение")}, {Quote(Russian)}, TRUE, 1)");
        migrationBuilder.Sql($"INSERT INTO \"Chapters\" (\"Id\", \"BookId\", \"Number\", \"Title\", \"TokensJson\") VALUES ('{ChapterId}', '{BookId}', 1, {Quote("Азар!")}, {Quote(JsonSerializer.Serialize(tokens))})");
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql($"DELETE FROM \"Books\" WHERE \"Id\" = '{BookId}'");
    }
}
