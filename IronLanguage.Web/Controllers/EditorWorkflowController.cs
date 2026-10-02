using System.Text.Json;
using IronLanguage.Db;
using IronLanguage.Web.Models;
using IronLanguage.Web.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace IronLanguage.Web.Controllers;

[Authorize(Roles = "Editor"), Route("editor")]
public sealed class EditorWorkflowController(IEditorRepository editor, ICatalogRepository catalog, DictionaryService dictionary, IWebHostEnvironment environment) : Controller
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    private static readonly string[] Kinds = ["word", "audio", "translation", "book"];

    [HttpGet("new/{kind}")]
    public IActionResult New(string kind) => Kinds.Contains(kind) ? View("Form", new EditorFormModel { Kind = kind }) : NotFound();

    [HttpPost("new/{kind}"), ValidateAntiForgeryToken, RequestSizeLimit(12_000_000)]
    public async Task<IActionResult> New(string kind, EditorFormModel model, CancellationToken ct)
    {
        if (!Kinds.Contains(kind)) return NotFound();
        model.Kind = kind;
        var payload = await BuildPayload(model, null, null, ct);
        if (payload is null) return View("Form", model);
        var id = await editor.Create(kind, payload, ct);
        return Redirect($"/editor/{kind}/{id}/preview");
    }

    [HttpGet("draft/{kind}/{id:guid}")]
    public async Task<IActionResult> EditDraft(string kind, Guid id, CancellationToken ct)
    {
        var material = await editor.Material(kind, id, ct);
        return material is null || material.Published ? NotFound() : View("Form", EditorFormModel.FromPayload(kind, material.PayloadJson, id));
    }

    [HttpPost("draft/{kind}/{id:guid}"), ValidateAntiForgeryToken, RequestSizeLimit(12_000_000)]
    public async Task<IActionResult> EditDraft(string kind, Guid id, EditorFormModel model, CancellationToken ct)
    {
        var material = await editor.Material(kind, id, ct);
        if (material is null || material.Published) return NotFound();
        model.Kind = kind; model.ContentId = id;
        var audio = AudioPath(kind, material.PayloadJson);
        model.ExistingAudioPath = audio;
        var cover = CoverPath(kind, material.PayloadJson);
        model.ExistingCoverImagePath = cover;
        var payload = await BuildPayload(model, audio, cover, ct);
        if (payload is null) return View("Form", model);
        if (!await editor.UpdateDraft(kind, id, payload, ct)) return Conflict();
        return Redirect($"/editor/{kind}/{id}/preview");
    }

    [HttpPost("published/{kind}/{id:guid}/revise"), ValidateAntiForgeryToken]
    public async Task<IActionResult> Revise(string kind, Guid id, CancellationToken ct)
    {
        if (!Kinds.Contains(kind)) return NotFound();
        var revisionId = await editor.StartRevision(kind, id, User.UserId()!.Value, ct);
        return revisionId is null ? NotFound() : Redirect($"/editor/revisions/{revisionId}/edit");
    }

    [HttpPost("draft/{kind}/{id:guid}/delete"), ValidateAntiForgeryToken]
    public async Task<IActionResult> DeleteDraft(string kind, Guid id, CancellationToken ct) =>
        await editor.DeleteDraft(kind, id, ct) ? Redirect("/editor") : NotFound();

    [HttpPost("revisions/{id:guid}/delete"), ValidateAntiForgeryToken]
    public async Task<IActionResult> DeleteRevision(Guid id, CancellationToken ct) =>
        await editor.DeleteRevision(id, ct) ? Redirect("/editor") : NotFound();

    [HttpPost("published/{kind}/{id:guid}/archive"), ValidateAntiForgeryToken]
    public async Task<IActionResult> Archive(string kind, Guid id, CancellationToken ct) =>
        await editor.SetArchived(kind, id, true, ct) ? Redirect("/editor") : NotFound();

    [HttpPost("archived/{kind}/{id:guid}/restore"), ValidateAntiForgeryToken]
    public async Task<IActionResult> Restore(string kind, Guid id, CancellationToken ct) =>
        await editor.SetArchived(kind, id, false, ct) ? Redirect("/editor") : NotFound();

    [HttpGet("revisions/{id:guid}/edit")]
    public async Task<IActionResult> EditRevision(Guid id, CancellationToken ct)
    {
        var revision = await editor.Revision(id, ct);
        return revision is null || revision.Published ? NotFound() : View("Form", EditorFormModel.FromPayload(revision.Kind, revision.PayloadJson, revision.ContentId, id));
    }

    [HttpPost("revisions/{id:guid}/edit"), ValidateAntiForgeryToken, RequestSizeLimit(12_000_000)]
    public async Task<IActionResult> EditRevision(Guid id, EditorFormModel model, CancellationToken ct)
    {
        var revision = await editor.Revision(id, ct);
        if (revision is null || revision.Published) return NotFound();
        model.Kind = revision.Kind; model.ContentId = revision.ContentId; model.RevisionId = id;
        var audio = AudioPath(revision.Kind, revision.PayloadJson);
        model.ExistingAudioPath = audio;
        var cover = CoverPath(revision.Kind, revision.PayloadJson);
        model.ExistingCoverImagePath = cover;
        var payload = await BuildPayload(model, audio, cover, ct);
        if (payload is null) return View("Form", model);
        if (!await editor.UpdateRevision(id, payload, ct)) return Conflict();
        return Redirect($"/editor/revisions/{id}/preview");
    }

    [HttpGet("{kind}/{id:guid}/preview")]
    public async Task<IActionResult> Preview(string kind, Guid id, CancellationToken ct)
    {
        var material = await editor.Material(kind, id, ct);
        return material is null ? NotFound() : View("Preview", await PreviewModel(kind, id, null, material.Version, material.Published, false, material.PayloadJson, ct));
    }

    [HttpGet("revisions/{id:guid}/preview")]
    public async Task<IActionResult> PreviewRevision(Guid id, CancellationToken ct)
    {
        var revision = await editor.Revision(id, ct);
        return revision is null ? NotFound() : View("Preview", await PreviewModel(revision.Kind, revision.ContentId, id, revision.Version, revision.Published, revision.Published, revision.PayloadJson, ct));
    }

    [HttpGet("history/{kind}/{id:guid}/{version:int}")]
    public async Task<IActionResult> History(string kind, Guid id, int version, CancellationToken ct)
    {
        var revision = (await editor.History(kind, id, ct)).SingleOrDefault(x => x.Version == version);
        return revision is null ? NotFound() : View("Preview", await PreviewModel(kind, id, revision.Id, version, true, true, revision.PayloadJson, ct));
    }

    [HttpPost("revisions/{id:guid}/publish"), ValidateAntiForgeryToken]
    public async Task<IActionResult> PublishRevision(Guid id, bool confirmReviewed, CancellationToken ct)
    {
        var revision = await editor.Revision(id, ct);
        if (revision is null || revision.Published) return NotFound();
        var model = await PreviewModel(revision.Kind, revision.ContentId, id, revision.Version, false, false, revision.PayloadJson, ct);
        if (!confirmReviewed) { model.Error = "Подтвердите проверку текста, перевода и прав на материал."; return View("Preview", model); }
        if (!PublishedLinksValid(revision.Kind, revision.PayloadJson, model.Words.Keys.ToHashSet()))
        { model.Error = "Сначала опубликуйте связанные слова."; return View("Preview", model); }
        if (!await editor.PublishRevision(id))
        { model.Error = "Материал уже изменился. Откройте его заново перед публикацией."; return View("Preview", model); }
        return Redirect($"/editor/{revision.Kind}/{revision.ContentId}/preview");
    }

    private async Task<EditorPreviewModel> PreviewModel(string kind, Guid id, Guid? revisionId, int version, bool published, bool historical, string payload, CancellationToken ct)
    {
        var words = (await catalog.Words(ct)).ToDictionary(x => x.Id);
        return new EditorPreviewModel
        {
            Kind = kind, ContentId = id, RevisionId = revisionId, Version = version, Published = published, Historical = historical,
            Word = kind == "word" ? JsonSerializer.Deserialize<WordMaterial>(payload, JsonOptions) : null,
            Exercise = kind is "audio" or "translation" ? JsonSerializer.Deserialize<ExerciseMaterial>(payload, JsonOptions) : null,
            Book = kind == "book" ? JsonSerializer.Deserialize<BookMaterial>(payload, JsonOptions) : null,
            History = await editor.History(kind, id, ct), Words = words
        };
    }

    private async Task<string?> BuildPayload(EditorFormModel model, string? originalAudioPath, string? originalCoverPath, CancellationToken ct)
    {
        ModelState.Clear();
        model.Ossetian ??= ""; model.Russian ??= ""; model.Example ??= ""; model.LiteraryTranslation ??= "";
        model.Authors ??= ""; model.Difficulty ??= "";
        model.RussianPrompt ??= ""; model.OssetianAnswer ??= ""; model.TokensText ??= "";
        model.AlternativesText ??= ""; model.Explanation ??= ""; model.WordIdsCsv ??= ""; model.ChaptersJson ??= "[]";
        var kind = model.Kind;
        var publishedWords = (await catalog.Words(ct)).Select(x => x.Id).ToHashSet();
        if (model.Audio is { Length: > 0 } && (model.Audio.Length > 10_000_000 || Path.GetExtension(model.Audio.FileName).ToLowerInvariant() is not (".mp3" or ".ogg" or ".wav")))
            ModelState.AddModelError(nameof(model.Audio), "Выберите MP3, OGG или WAV до 10 МБ.");
        string? payload = null;
        if (kind == "word")
        {
            if (string.IsNullOrWhiteSpace(model.Ossetian)) ModelState.AddModelError(nameof(model.Ossetian), "Укажите слово.");
            if (string.IsNullOrWhiteSpace(model.Russian)) ModelState.AddModelError(nameof(model.Russian), "Укажите перевод.");
            if (model.Ossetian.Length > 200 || model.Russian.Length > 200) ModelState.AddModelError("", "Слово и перевод должны быть короче 200 символов.");
            if (ModelState.IsValid)
            {
                var audio = model.Audio is { Length: > 0 } ? await SaveAudio(model.Audio, ct) : originalAudioPath;
                payload = JsonSerializer.Serialize(new WordMaterial(model.Ossetian.Trim(), model.Russian.Trim(), model.Example.Trim(), audio), JsonOptions);
            }
        }
        else if (kind is "audio" or "translation")
        {
            var tokens = model.TokensText.Split('\n', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries);
            var alternatives = model.AlternativesText.Split('\n', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries);
            var wordIds = new List<Guid>();
            foreach (var value in model.WordIdsCsv.Split(',', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries))
            {
                if (!Guid.TryParse(value, out var id) || !publishedWords.Contains(id)) ModelState.AddModelError(nameof(model.WordIdsCsv), "Выберите опубликованные слова из списка.");
                else wordIds.Add(id);
            }
            if (string.IsNullOrWhiteSpace(model.RussianPrompt)) ModelState.AddModelError(nameof(model.RussianPrompt), "Укажите русскую подсказку.");
            if (string.IsNullOrWhiteSpace(model.OssetianAnswer)) ModelState.AddModelError(nameof(model.OssetianAnswer), "Укажите осетинский ответ.");
            if (tokens.Length is < 2 or > 30 || tokens.Any(x => x.Length > 80)) ModelState.AddModelError(nameof(model.TokensText), "Нужно от 2 до 30 слов, каждое с новой строки.");
            else if (!CanAssemble(model.OssetianAnswer, tokens) || alternatives.Any(x => !CanAssemble(x, tokens)))
                ModelState.AddModelError(nameof(model.TokensText), "Ответ и допустимые варианты должны собираться из этих слов.");
            if (kind == "audio" && model.Audio is not { Length: > 0 } && string.IsNullOrEmpty(originalAudioPath))
                ModelState.AddModelError(nameof(model.Audio), "Для аудиопазла нужна запись.");
            if (ModelState.IsValid)
            {
                var audio = kind == "audio" ? model.Audio is { Length: > 0 } ? await SaveAudio(model.Audio, ct) : originalAudioPath : null;
                payload = JsonSerializer.Serialize(new ExerciseMaterial(kind, model.RussianPrompt.Trim(), model.OssetianAnswer.Trim(), tokens,
                    alternatives, model.Explanation.Trim(), wordIds.Distinct().ToArray(), audio), JsonOptions);
            }
        }
        else if (kind == "book")
        {
            if (string.IsNullOrWhiteSpace(model.Russian)) ModelState.AddModelError(nameof(model.Russian), "Укажите название книги.");
            if (string.IsNullOrWhiteSpace(model.Authors) || model.Authors.Length > 240) ModelState.AddModelError(nameof(model.Authors), "Укажите автора или авторов (до 240 символов).");
            if (model.Difficulty is not ("Начальный" or "Средний" or "Продвинутый")) ModelState.AddModelError(nameof(model.Difficulty), "Выберите уровень сложности.");
            if (string.IsNullOrWhiteSpace(model.Example) || model.Example.Length > 1000) ModelState.AddModelError(nameof(model.Example), "Добавьте описание до 1000 символов.");
            if (model.CoverImage is { Length: > 0 } coverFile &&
                (coverFile.Length > 5_000_000 || Path.GetExtension(coverFile.FileName).ToLowerInvariant() is not (".png" or ".jpg" or ".jpeg" or ".webp")))
                ModelState.AddModelError(nameof(model.CoverImage), "Выберите PNG, JPEG или WebP до 5 МБ.");
            MaterialChapter[] chapters = [];
            try { chapters = JsonSerializer.Deserialize<MaterialChapter[]>(model.ChaptersJson, JsonOptions) ?? []; }
            catch (JsonException) { ModelState.AddModelError(nameof(model.ChaptersJson), "Не удалось прочитать разметку глав."); }
            if (chapters.Length == 0 || chapters.Length > 100) ModelState.AddModelError(nameof(model.ChaptersJson), "Добавьте хотя бы одну главу.");
            if (chapters.Any(x => x.Id == Guid.Empty || x.Number < 1 || string.IsNullOrWhiteSpace(x.Title) || x.Tokens is null || x.Tokens.Length is < 1 or > 10000 || x.Tokens.All(t => string.IsNullOrWhiteSpace(t.Text))))
                ModelState.AddModelError(nameof(model.ChaptersJson), "У каждой главы должны быть название и текст.");
            if (chapters.Select(x => x.Id).Distinct().Count() != chapters.Length || chapters.Select(x => x.Number).Distinct().Count() != chapters.Length)
                ModelState.AddModelError(nameof(model.ChaptersJson), "Номера и идентификаторы глав не должны повторяться.");
            if (chapters.SelectMany(x => x.Tokens ?? []).Any(x => x.Text is null || x.WordId is Guid wordId && !publishedWords.Contains(wordId)))
                ModelState.AddModelError(nameof(model.ChaptersJson), "Связанные слова должны быть опубликованы.");
            if (ModelState.IsValid)
            {
                var coverPath = model.CoverImage is { Length: > 0 } ? await SaveCover(model.CoverImage, ct) : originalCoverPath;
                if (model.CoverImage is { Length: > 0 } && coverPath is null)
                {
                    ModelState.AddModelError(nameof(model.CoverImage), "Файл не является допустимым изображением.");
                    return null;
                }
                var prepared = await dictionary.Prepare(new BookMaterial(model.Russian.Trim(), model.Example.Trim(),
                    chapters.OrderBy(x => x.Number).ToArray(), model.LiteraryTranslation.Trim(), model.Authors.Trim(),
                    model.Difficulty, coverPath), ct);
                payload = JsonSerializer.Serialize(prepared, JsonOptions);
            }
        }
        else return null;
        return payload;
    }

    private static string? AudioPath(string kind, string payload)
    {
        return kind switch
        {
            "word" => JsonSerializer.Deserialize<WordMaterial>(payload, JsonOptions)?.AudioPath,
            "audio" => JsonSerializer.Deserialize<ExerciseMaterial>(payload, JsonOptions)?.AudioPath,
            _ => null
        };
    }

    private static string? CoverPath(string kind, string payload) => kind == "book"
        ? JsonSerializer.Deserialize<BookMaterial>(payload, JsonOptions)?.CoverImagePath : null;

    private async Task<string?> SaveCover(IFormFile cover, CancellationToken ct)
    {
        await using var input = cover.OpenReadStream();
        await using var buffer = new MemoryStream();
        await input.CopyToAsync(buffer, ct);
        var bytes = buffer.ToArray();
        var extension = Path.GetExtension(cover.FileName).ToLowerInvariant();
        var valid = extension switch
        {
            ".png" => bytes.Length >= 8 && bytes.AsSpan(0, 8).SequenceEqual(new byte[] { 137, 80, 78, 71, 13, 10, 26, 10 }),
            ".jpg" or ".jpeg" => bytes.Length >= 3 && bytes[0] == 255 && bytes[1] == 216 && bytes[2] == 255,
            ".webp" => bytes.Length >= 12 && System.Text.Encoding.ASCII.GetString(bytes, 0, 4) == "RIFF"
                && System.Text.Encoding.ASCII.GetString(bytes, 8, 4) == "WEBP",
            _ => false
        };
        if (!valid) return null;
        var folder = Path.Combine(environment.WebRootPath, "media", "books");
        Directory.CreateDirectory(folder);
        var name = Guid.NewGuid().ToString("N") + extension;
        await System.IO.File.WriteAllBytesAsync(Path.Combine(folder, name), bytes, ct);
        return "/media/books/" + name;
    }

    private static bool PublishedLinksValid(string kind, string payload, HashSet<Guid> words) => kind switch
    {
        "audio" or "translation" => (JsonSerializer.Deserialize<ExerciseMaterial>(payload, JsonOptions)?.WordIds ?? []).All(words.Contains),
        "book" => (JsonSerializer.Deserialize<BookMaterial>(payload, JsonOptions)?.Chapters ?? []).SelectMany(x => x.Tokens).All(x => x.WordId is null || words.Contains(x.WordId.Value)),
        _ => true
    };

    private static bool CanAssemble(string answer, string[] pieces)
    {
        var available = pieces.GroupBy(LearningService.Normalize).ToDictionary(x => x.Key, x => x.Count());
        foreach (var token in answer.Split(' ', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries).Select(LearningService.Normalize))
        {
            if (!available.TryGetValue(token, out var count) || count == 0) return false;
            available[token] = count - 1;
        }
        return !string.IsNullOrWhiteSpace(answer);
    }

    private async Task<string> SaveAudio(IFormFile audio, CancellationToken ct)
    {
        var folder = Path.Combine(environment.WebRootPath, "media");
        Directory.CreateDirectory(folder);
        var name = Guid.NewGuid().ToString("N") + Path.GetExtension(audio.FileName).ToLowerInvariant();
        await using var output = System.IO.File.Create(Path.Combine(folder, name));
        await audio.CopyToAsync(output, ct);
        return "/media/" + name;
    }
}
