using System.Text.Json;
using IronLanguage.Web.Models;
using IronLanguage.Web.Controllers;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using IronLanguage.Db;
using IronLanguage.Web.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.Http;
using System.Security.Claims;

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
    var imported = ReadingSeedService.Build(draft);
    Check(imported.Id == ReadingSeedService.Build(draft).Id, "Импорт должен использовать стабильный ID.");
    Check(!imported.Material.TranslationReviewed, "Черновой перевод нельзя считать проверенным.");
    Check(imported.Material.Chapters[0].Translation == draft.Translation && imported.Material.LiteraryTranslation == "",
        "Перевод импорта должен принадлежать главе.");
    Check(string.Concat(imported.Material.Chapters[0].Tokens.Select(token => token.Text)) == draft.Original,
        "Токенизация изменила пробелы или строки оригинала.");
    Check(ReadingContent.ValidIllustrations(imported.Material.Illustrations!, imported.Material.Chapters), "Иллюстрация не прошла проверку.");
}
var sample = ReadingSeedService.Build(drafts[0]).Material;
var illustration = sample.Illustrations![0];
var cover = BookCoverDesign.ForTitle(sample.Title);
Check(BookCoverDesign.IsValid(cover), "Обложка по умолчанию должна быть читаемой.");
Check(cover == BookCoverDesign.ForTitle(sample.Title), "Начальное оформление обложки должно быть стабильным.");
foreach (var draft in drafts) Check(BookCoverDesign.IsValid(BookCoverDesign.ForTitle(draft.Title)), "Нечитаемая палитра существующего произведения.");
Check(!BookCoverDesign.IsValid(cover with { Background = "url(https://example.com/image.png)" }), "Принят URL вместо цвета.");
Check(!BookCoverDesign.IsValid(cover with { TextColor = "#ffffff;display:none" }), "Принят CSS вместо цвета.");
Check(!BookCoverDesign.IsValid(cover with { Accent = "#FFFFFF\n" }), "Принят лишний перенос в цвете.");
Check(!BookCoverDesign.IsValid(cover with { Font = "unknown" }), "Принят неизвестный шрифт.");
Check(!BookCoverDesign.IsValid(cover with { Pattern = "<script>" }), "Принят неизвестный принт.");
Check(!BookCoverDesign.IsValid(cover with { Background = "#FFFFFF", TextColor = "#FFFFFF" }), "Принято нечитаемое название.");
Check(Math.Abs(BookCoverDesign.Contrast("#000000", "#FFFFFF") - 21) < .001, "Неправильно вычислен контраст.");
Check(BookCoverDesign.Read("{broken", sample.Title) == cover, "Старая повреждённая настройка должна безопасно заменяться начальным оформлением.");
var designedSample = sample with { CoverDesign = cover with { Font = "serif", Pattern = "arches" } };
var designedForm = EditorFormModel.FromPayload("book", JsonSerializer.Serialize(designedSample, new JsonSerializerOptions(JsonSerializerDefaults.Web)));
Check(designedForm.CoverFont == "serif" && designedForm.CoverPattern == "arches" && designedForm.CoverBackground == cover.Background,
    "Форма потеряла оформление обложки.");
var legacySample = sample with { LiteraryTranslation = "Старый перевод", Chapters = [sample.Chapters[0] with { Translation = "" }] };
var legacyForm = EditorFormModel.FromPayload("book", JsonSerializer.Serialize(legacySample, new JsonSerializerOptions(JsonSerializerDefaults.Web)));
Check(legacyForm.LiteraryTranslation == "" && JsonSerializer.Deserialize<MaterialChapter[]>(legacyForm.ChaptersJson,
    new JsonSerializerOptions(JsonSerializerDefaults.Web))![0].Translation == "Старый перевод", "Старый перевод единственной главы потерян.");
var untranslatedChapter = sample.Chapters[0] with { Id = Guid.NewGuid(), Number = 2, Translation = "" };
var mixedSample = sample with { Chapters = [sample.Chapters[0], untranslatedChapter], LiteraryTranslation = "Общий перевод старой книги" };
var mixedForm = EditorFormModel.FromPayload("book", JsonSerializer.Serialize(mixedSample, new JsonSerializerOptions(JsonSerializerDefaults.Web)));
var mixedChapters = JsonSerializer.Deserialize<MaterialChapter[]>(mixedForm.ChaptersJson, new JsonSerializerOptions(JsonSerializerDefaults.Web))!;
Check(mixedChapters[0].Translation == sample.Chapters[0].Translation && mixedChapters[1].Translation == "",
    "Переводы глав перемешаны или пустой перевод подменён.");
Check(mixedForm.LiteraryTranslation == mixedSample.LiteraryTranslation, "Общий перевод старой многоглавой книги должен сохраняться.");
Check(!ReadingContent.ValidIllustrations([illustration with { AfterLine = -1 }], sample.Chapters), "Принята отрицательная строка рисунка.");
Check(!ReadingContent.ValidIllustrations([illustration with { ChapterId = Guid.NewGuid() }], sample.Chapters), "Принята чужая глава рисунка.");
Check(!ReadingContent.ValidIllustrations([illustration with { AfterLine = 50000 }], sample.Chapters), "Принята строка за концом текста.");
Check(!ReadingContent.ValidImagePath("https://example.com/image.png"), "Принят внешний путь рисунка.");
Check(!ReadingContent.ValidImagePath("/media/books/../escape.png"), "Принят выход из каталога картинок.");
Check(!ReadingContent.ValidImagePath("/images/reading/schoolboy-interior-v1.png?x=1"), "Принят query в пути картинки.");
Check(!ReadingContent.ValidImagePath("/media/books/00000000000000000000000000000000.svg"), "Принят SVG вместо растрового файла.");
Check(ReadingContent.ValidImagePath("/media/books/00000000000000000000000000000000.webp"), "Отклонён допустимый путь загруженного рисунка.");
Check(EditorFormModel.FromPayload("book", JsonSerializer.Serialize(sample, new JsonSerializerOptions(JsonSerializerDefaults.Web)))
    is { TranslationReviewed: false, IllustrationsJson.Length: > 2 }, "Форма потеряла статус или иллюстрации.");

if (args.Contains("--database"))
{
    var connection = Environment.GetEnvironmentVariable("ConnectionStrings__Adam")
        ?? throw new InvalidOperationException("Загрузите локальную настройку БД.");
    await using var db = new AdamDbContext(new DbContextOptionsBuilder<AdamDbContext>().UseNpgsql(connection).Options);
    Check(!db.Database.HasPendingModelChanges(), "Снимок модели не согласован.");
    var expectedIds = drafts.Select(draft => ReadingSeedService.Build(draft).Id).ToArray();
    var books = await db.Books.AsNoTracking().Include(book => book.Chapters).Where(book => expectedIds.Contains(book.Id)).ToListAsync();
    Check(books.Count == 8 && books.All(book => book.Published && !book.Archived && !book.TranslationReviewed), "Новая подборка не загружена.");
    Check(books.All(book => book.LiteraryTranslation == "" && book.DraftTranslation.Length > 0), "Черновой перевод попал в опубликованное поле.");
    var positions = await db.ReadingPositions.AsNoTracking().ToListAsync();
    var revisionCount = await db.ContentRevisions.CountAsync();
    var editorId = await db.Users.Where(user => user.IsEditor).Select(user => user.Id).FirstAsync();
    var result = await new EfReadingLibraryRepository(db).ReplaceLibrary(drafts.Select(ReadingSeedService.Build).ToArray(), editorId, CancellationToken.None);
    Check(result is { Added: 0, Archived: 0 }, "Повторный импорт изменил библиотеку.");
    Check(await db.ContentRevisions.CountAsync() == revisionCount, "Повторный импорт изменил историю.");
    Check((await db.ReadingPositions.AsNoTracking().OrderBy(position => position.UserId).ThenBy(position => position.BookId).ToListAsync())
        .Select(position => JsonSerializer.Serialize(position)).SequenceEqual(positions.OrderBy(position => position.UserId).ThenBy(position => position.BookId)
            .Select(position => JsonSerializer.Serialize(position))), "Импорт изменил сохранённые позиции.");
    await using var transaction = await db.Database.BeginTransactionAsync();
    var repository = new EfEditorRepository(db);
    var temporaryChapterId = Guid.NewGuid();
    var temporaryMaterial = sample with { Chapters = [sample.Chapters[0] with { Id = temporaryChapterId }, untranslatedChapter],
        Illustrations = [illustration with { ChapterId = temporaryChapterId }] };
    var temporaryId = await repository.Create("book", JsonSerializer.Serialize(temporaryMaterial, new JsonSerializerOptions(JsonSerializerDefaults.Web)));
    var changedMaterial = temporaryMaterial with { Illustrations = [illustration with { ChapterId = temporaryChapterId, AfterLine = 0, Description = "Проверка рисунка" }],
        CoverDesign = designedSample.CoverDesign };
    Check(await repository.UpdateDraft("book", temporaryId, JsonSerializer.Serialize(changedMaterial, new JsonSerializerOptions(JsonSerializerDefaults.Web))),
        "Не удалось обновить черновик с рисунком.");
    var saved = await repository.Material("book", temporaryId);
    var restored = JsonSerializer.Deserialize<BookMaterial>(saved!.PayloadJson, new JsonSerializerOptions(JsonSerializerDefaults.Web))!;
    Check(restored.Illustrations![0] is { AfterLine: 0, Description: "Проверка рисунка" } && !restored.TranslationReviewed,
        "Сохранение черновика потеряло иллюстрацию или статус перевода.");
    Check(restored.CoverDesign == designedSample.CoverDesign, "Сохранение черновика потеряло обложку.");
    Check(restored.Chapters[0].Translation == sample.Chapters[0].Translation && restored.Chapters[1].Translation == "",
        "Сохранение изменило необязательные переводы глав.");
    var temporaryBook = await db.Books.Include(book => book.Chapters).SingleAsync(book => book.Id == temporaryId);
    temporaryBook.Published = true;
    await db.SaveChangesAsync();
    var api = new LearningApiController(new EfCatalogRepository(db), null!, null!, new DictionaryService(db), null!)
        { ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext() } };
    async Task<JsonElement> BookResponse()
    {
        var response = await api.Book(temporaryId, CancellationToken.None) as OkObjectResult;
        return JsonSerializer.SerializeToElement(response!.Value, new JsonSerializerOptions(JsonSerializerDefaults.Web));
    }
    var guestResponse = await BookResponse();
    Check(guestResponse.GetProperty("chapters").EnumerateArray().All(chapter => chapter.GetProperty("translation").GetString() == ""),
        "Гость получил непроверенный перевод главы.");
    api.HttpContext.User = new ClaimsPrincipal(new ClaimsIdentity([new Claim(ClaimTypes.Role, "Editor")], "test"));
    Check((await BookResponse()).GetProperty("chapters")[0].GetProperty("translation").GetString() == sample.Chapters[0].Translation,
        "Редактор не получил черновой перевод главы.");
    // Seed a revision inside the rollback transaction; StartRevision owns its own transaction.
    var revision = new ContentRevision { Kind = "book", ContentId = temporaryId, EditorId = editorId,
        Version = 2, BaseVersion = 1, PayloadJson = saved.PayloadJson };
    db.ContentRevisions.Add(revision);
    await db.SaveChangesAsync();
    var revisionMaterial = changedMaterial with { Chapters = [changedMaterial.Chapters[0] with { Translation = "Проверка новой версии" }, untranslatedChapter] };
    Check(await repository.UpdateRevision(revision.Id, JsonSerializer.Serialize(revisionMaterial,
        new JsonSerializerOptions(JsonSerializerDefaults.Web))), "Не удалось сохранить перевод новой версии.");
    Check((await BookResponse()).GetProperty("chapters")[0].GetProperty("translation").GetString() == sample.Chapters[0].Translation,
        "Черновик новой версии изменил опубликованный перевод.");
    temporaryBook.TranslationReviewed = true;
    await db.SaveChangesAsync();
    api.HttpContext.User = new ClaimsPrincipal(new ClaimsIdentity());
    var reviewedResponse = await BookResponse();
    Check(reviewedResponse.GetProperty("chapters")[0].GetProperty("translation").GetString() == sample.Chapters[0].Translation
        && reviewedResponse.GetProperty("chapters")[1].GetProperty("translation").GetString() == "",
        "После проверки переводы глав должны оставаться независимыми.");
    await transaction.RollbackAsync();
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
