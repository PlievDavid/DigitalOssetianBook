using System.Text.Json;
using IronLanguage.Db;
using IronLanguage.Web.Services;
using IronLanguage.Web.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace IronLanguage.Web.Controllers;

[Authorize(Roles = "Editor"), Route("editor")]
public sealed class EditorController(ICatalogRepository catalog, IEditorRepository editor, IWebHostEnvironment environment) : Controller
{
    [HttpGet("")]
    public async Task<IActionResult> Index(CancellationToken ct) => View(new EditorIndexModel(await editor.Items(ct)));

    [HttpPost("exercise"), ValidateAntiForgeryToken, RequestSizeLimit(12_000_000)]
    public async Task<IActionResult> Exercise(string kind, string russianPrompt, string ossetianAnswer, string tokens, string? alternatives, string? explanation, string? wordIds, IFormFile? audio, CancellationToken ct)
    {
        if (kind is not ("audio" or "translation") || string.IsNullOrWhiteSpace(russianPrompt) || string.IsNullOrWhiteSpace(ossetianAnswer)) return BadRequest();
        var pieces = tokens.Split('\n', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries);
        if (pieces.Length < 2 || pieces.Length > 30 || pieces.Any(x => x.Length > 80)) return BadRequest("Укажите от 2 до 30 слов, каждое с новой строки.");
        var accepted = (alternatives ?? "").Split('\n', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries);
        var linkedWords = (wordIds ?? "").Split(',', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries);
        if (linkedWords.Any(x => !Guid.TryParse(x, out _))) return BadRequest("Неверный идентификатор слова.");
        if (!CanAssemble(ossetianAnswer, pieces)) return BadRequest("Ответ должен собираться из указанных слов.");
        if (kind == "audio" && audio is null) return BadRequest("Для аудиопазла нужна запись.");
        var audioPath = audio is null ? null : await SaveAudio(audio, ct);
        if (kind == "audio" && audioPath is null) return BadRequest("Поддерживаются MP3, OGG и WAV до 10 МБ.");
        await catalog.AddExercise(new Exercise { Kind = kind, RussianPrompt = russianPrompt.Trim(), OssetianAnswer = ossetianAnswer.Trim(),
            TokensJson = JsonSerializer.Serialize(pieces), WordIdsJson = JsonSerializer.Serialize(linkedWords.Select(Guid.Parse)),
            AlternativesJson = JsonSerializer.Serialize(accepted), Explanation = (explanation ?? "").Trim(), AudioPath = audioPath }, ct);
        return RedirectToAction(nameof(Index));
    }

    [HttpPost("word"), ValidateAntiForgeryToken, RequestSizeLimit(12_000_000)]
    public async Task<IActionResult> Word(string ossetian, string russian, string? example, IFormFile? audio, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(ossetian) || string.IsNullOrWhiteSpace(russian)) return BadRequest();
        var audioPath = audio is null ? null : await SaveAudio(audio, ct);
        if (audio is not null && audioPath is null) return BadRequest("Неверный аудиофайл.");
        await catalog.AddWord(new WordEntry { Ossetian = ossetian.Trim(), Russian = russian.Trim(), Example = (example ?? "").Trim(), AudioPath = audioPath }, ct);
        return RedirectToAction(nameof(Index));
    }

    [HttpPost("book"), ValidateAntiForgeryToken]
    public async Task<IActionResult> Book(string title, string? description, string chapterTitle, string tokensJson, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(title) || string.IsNullOrWhiteSpace(chapterTitle)) return BadRequest();
        BookToken[]? tokens;
        try { tokens = JsonSerializer.Deserialize<BookToken[]>(tokensJson, new JsonSerializerOptions { PropertyNameCaseInsensitive = true }); }
        catch (JsonException) { return BadRequest("Неверный JSON главы."); }
        if (tokens is null || tokens.Length == 0 || tokens.Length > 10000 || tokens.Any(x => string.IsNullOrWhiteSpace(x.Text))) return BadRequest("Глава пуста или неверно размечена.");
        var book = new Book { Title = title.Trim(), Description = (description ?? "").Trim() };
        book.Chapters.Add(new BookChapter { Number = 1, Title = chapterTitle.Trim(), TokensJson = JsonSerializer.Serialize(tokens) });
        await catalog.AddBook(book, ct);
        return RedirectToAction(nameof(Index));
    }

    [HttpPost("book/{id:guid}/chapter"), ValidateAntiForgeryToken]
    public async Task<IActionResult> Chapter(Guid id, int number, string title, string tokensJson, CancellationToken ct)
    {
        if (number < 1 || string.IsNullOrWhiteSpace(title) || !ValidTokens(tokensJson)) return BadRequest();
        var draft = (await catalog.DraftBooks(ct)).SingleOrDefault(x => x.Id == id);
        if (draft is null) return NotFound();
        if (draft.Chapters.Any(x => x.Number == number)) return BadRequest("Номер главы уже занят.");
        var parsed = JsonSerializer.Deserialize<BookToken[]>(tokensJson, new JsonSerializerOptions { PropertyNameCaseInsensitive = true })!;
        if (!await catalog.AddChapter(new BookChapter { BookId = id, Number = number, Title = title.Trim(), TokensJson = JsonSerializer.Serialize(parsed) }, ct)) return NotFound();
        return RedirectToAction(nameof(Index));
    }

    [HttpPost("publish/{kind}/{id:guid}"), ValidateAntiForgeryToken]
    public async Task<IActionResult> Publish(string kind, Guid id, bool confirmReviewed, CancellationToken ct)
    {
        if (!confirmReviewed) return BadRequest("Подтвердите проверку материала и прав на публикацию.");
        if (kind == "exercise") kind = (await catalog.Exercise(id, true, ct))?.Kind ?? kind;
        if (kind is "audio" or "translation")
        {
            var exercise = await catalog.Exercise(id, true, ct);
            if (exercise is null || (exercise.Kind == "audio" && string.IsNullOrEmpty(exercise.AudioPath))) return BadRequest();
            var publishedWords = (await catalog.Words(ct)).Select(x => x.Id).ToHashSet();
            if ((JsonSerializer.Deserialize<Guid[]>(exercise.WordIdsJson) ?? []).Any(x => !publishedWords.Contains(x)))
                return BadRequest("Сначала опубликуйте связанные слова.");
        }
        else if (kind == "book")
        {
            var book = (await catalog.DraftBooks(ct)).SingleOrDefault(x => x.Id == id);
            if (book is null) return NotFound();
            if (book.Chapters.Count == 0 || book.Chapters.Any(x => !ValidTokens(x.TokensJson))) return BadRequest("Проверьте разметку глав.");
            var publishedWords = (await catalog.Words(ct)).Select(x => x.Id).ToHashSet();
            if (book.Chapters.SelectMany(x => JsonSerializer.Deserialize<BookToken[]>(x.TokensJson) ?? []).Any(x => x.WordId is Guid wordId && !publishedWords.Contains(wordId)))
                return BadRequest("Сначала опубликуйте слова, на которые ссылается текст.");
        }
        else if (kind == "word")
        {
            if (!(await editor.Material(kind, id, ct) is { Published: false })) return NotFound();
        }
        else return NotFound();
        if (!await editor.PublishDraft(kind, id, User.UserId()!.Value, ct)) return Conflict();
        return Redirect($"/editor/{kind}/{id}/preview");
    }

    private static bool CanAssemble(string answer, string[] pieces)
    {
        var available = pieces.GroupBy(LearningService.Normalize).ToDictionary(x => x.Key, x => x.Count());
        foreach (var token in answer.Split(' ', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries).Select(LearningService.Normalize))
        {
            if (!available.TryGetValue(token, out var count) || count == 0) return false;
            available[token] = count - 1;
        }
        return true;
    }

    private static bool ValidTokens(string json)
    {
        try
        {
            var tokens = JsonSerializer.Deserialize<BookToken[]>(json, new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
            return tokens is { Length: > 0 and <= 10000 } && tokens.Any(x => !string.IsNullOrWhiteSpace(x.Text)) && tokens.All(x => x.Text is not null);
        }
        catch (JsonException) { return false; }
    }

    private async Task<string?> SaveAudio(IFormFile audio, CancellationToken ct)
    {
        var extension = Path.GetExtension(audio.FileName).ToLowerInvariant();
        if (audio.Length == 0 || audio.Length > 10_000_000 || extension is not (".mp3" or ".ogg" or ".wav")) return null;
        var folder = Path.Combine(environment.WebRootPath, "media");
        Directory.CreateDirectory(folder);
        var name = Guid.NewGuid().ToString("N") + extension;
        await using var output = System.IO.File.Create(Path.Combine(folder, name));
        await audio.CopyToAsync(output, ct);
        return "/media/" + name;
    }
}
