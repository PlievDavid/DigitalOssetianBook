using System.Text.Json;
using IronLanguage.Web.Models;
using IronLanguage.Web.Controllers;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

var path = Path.Combine(Directory.GetCurrentDirectory(), "IronLanguage.Web", "Data", "reading", "drafts.json");
var drafts = ReadingDraftCatalog.Read(path);
var checks = 0;
void Check(bool condition, string message)
{
    checks++;
    if (!condition) throw new InvalidOperationException(message);
}

Check(drafts.Length == 8, "Ожидались восемь произведений.");
var authorization = Attribute.GetCustomAttribute(typeof(ReadingPreviewController), typeof(AuthorizeAttribute)) as AuthorizeAttribute;
Check(authorization?.Roles == "Editor", "Непроверенные переводы должны быть доступны только редактору.");
var cache = Attribute.GetCustomAttribute(typeof(ReadingPreviewController), typeof(ResponseCacheAttribute)) as ResponseCacheAttribute;
Check(cache is { NoStore: true, Location: ResponseCacheLocation.None }, "Нельзя кешировать защищённый предпросмотр.");
Check(drafts.Select(draft => draft.Title).SequenceEqual(new[]
{
    "Школьник", "Шалун", "Завещание", "Раздумье", "Надежда", "Желание", "Прощай!", "Мать сирот"
}), "Состав произведений изменился.");
Check(drafts.Sum(draft => draft.Original.Split('\n').Count(line => line.Length > 0)) == 214,
    "Потеряны строки оригинала.");
foreach (var draft in drafts)
{
    Check(!draft.Original.Contains('æ') && !draft.Original.Contains('Æ'), "В оригинале осталась латинская буква-двойник.");
    Check(!draft.Original.Contains('⚠'), "Замечание попало в оригинал.");
    Check(draft.CoverImagePath != draft.IllustrationImagePath, "Обложка и рисунок внутри должны отличаться.");
    Check(draft.Original.Split('\n').Length == draft.Translation.Split('\n').Length, "Нарушена построчность.");
}
var temporary = Path.GetTempFileName();
try
{
    void Reject(ReadingDraft[] value, string message)
    {
        File.WriteAllText(temporary, JsonSerializer.Serialize(value, new JsonSerializerOptions(JsonSerializerDefaults.Web)));
        try { ReadingDraftCatalog.Read(temporary); }
        catch (InvalidDataException) { checks++; return; }
        throw new InvalidOperationException(message);
    }

    Reject(drafts[..7], "Не отклонена неполная подборка.");
    Reject([drafts[0], .. drafts[1..7], drafts[0]], "Не отклонён повтор произведения.");
    var changed = drafts.ToArray();
    changed[0] = drafts[0] with { Slug = "../escape" };
    Reject(changed, "Не отклонён неверный идентификатор.");
    changed[0] = drafts[0] with { Translation = drafts[0].Translation + "\n" };
    Reject(changed, "Не отклонён лишний перенос.");
    changed[0] = drafts[0] with { IllustrationAfterLine = -1 };
    Reject(changed, "Не отклонена неверная позиция рисунка.");
    changed[0] = drafts[0] with { CoverImagePath = "https://example.com/cover.png" };
    Reject(changed, "Не отклонена внешняя обложка.");
    changed[0] = drafts[0] with { SourceUrl = "javascript:alert(1)" };
    Reject(changed, "Не отклонён опасный источник.");
    changed[0] = drafts[0] with { Original = "" };
    Reject(changed, "Не отклонён пустой оригинал.");
    changed[0] = drafts[0] with { Title = "</script><script>alert(1)</script>" };
    var json = JsonSerializer.Serialize(changed, new JsonSerializerOptions(JsonSerializerDefaults.Web));
    Check(!json.Contains("</script>", StringComparison.OrdinalIgnoreCase), "JSON должен безопасно встраиваться в Razor.");
}
finally { File.Delete(temporary); }
Console.WriteLine($"Reading checks: {checks} passed.");
