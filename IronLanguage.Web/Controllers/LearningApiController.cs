using System.Text.Json;
using IronLanguage.Db;
using IronLanguage.Web.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace IronLanguage.Web.Controllers;

public sealed record AnswerInput(int[] TokenIndices);
public sealed record ReadingInput(Guid ChapterId, int TokenIndex);
public sealed record ReviewInput(string Translation);
public sealed record BookToken(string Text, Guid? WordId, DictionaryMatch[]? Matches = null);

[ApiController, AutoValidateAntiforgeryToken, Route("api/v1")]
public sealed class LearningApiController(ICatalogRepository catalog, IProgressRepository progress, LearningService learning, DictionaryService dictionary, GuestLearningStore guests) : ControllerBase
{
    private static readonly JsonSerializerOptions BookJsonOptions = new(JsonSerializerDefaults.Web);
    [HttpGet("catalog")]
    public async Task<IActionResult> Catalog(CancellationToken ct)
    {
        var exercises = await catalog.Exercises(ct: ct);
        var books = await catalog.Books(ct);
        return Ok(new { exercises = exercises.Select(x => new { x.Id, x.Kind, x.RussianPrompt, x.AudioPath }),
            books = books.Select(x => new { x.Id, x.Title, x.Authors, x.Difficulty, x.Description, x.CoverImagePath }) });
    }

    [HttpGet("exercises/{id:guid}")]
    public async Task<IActionResult> Exercise(Guid id, CancellationToken ct)
    {
        var x = await catalog.Exercise(id, ct: ct);
        return x is null ? NotFound() : Ok(new { x.Id, x.Kind, x.RussianPrompt, x.AudioPath, tokens = LearningService.ParseTokens(x.TokensJson) });
    }

    [HttpPost("exercises/{id:guid}/attempts")]
    public async Task<IActionResult> Start(Guid id, CancellationToken ct)
    {
        if (User.UserId() is null)
        {
            var guest = await learning.StartGuest(guests.Owner(HttpContext), id, ct);
            return guest is null ? NotFound() : Ok(new { guest.Value.Card, attemptId = guest.Value.Attempt.Id, draftIndices = Array.Empty<int>() });
        }
        var result = await learning.Start(User.UserId(), id, ct);
        return result is null ? NotFound() : Ok(new { result.Value.Card, attemptId = result.Value.Attempt!.Id,
            draftIndices = JsonSerializer.Deserialize<int[]>(result.Value.Attempt.DraftIndicesJson) ?? [] });
    }

    [Authorize, HttpGet("attempts/{id:guid}")]
    public async Task<IActionResult> Attempt(Guid id, CancellationToken ct)
    {
        var attempt = await progress.Attempt(User.UserId()!.Value, id, ct);
        return attempt is null ? NotFound() : Ok(new { attempt.Id, attempt.ExerciseId, attempt.StartedAt, attempt.CompletedAt, attempt.Correct, attempt.SubmittedAnswer });
    }

    [HttpPost("attempts/{id:guid}/answer")]
    public async Task<IActionResult> Answer(Guid id, AnswerInput input, CancellationToken ct)
    {
        try
        {
            var answer = User.UserId() is Guid userId
                ? await learning.Answer(userId, id, input.TokenIndices ?? [], ct)
                : await learning.AnswerGuest(guests.Owner(HttpContext), id, input.TokenIndices ?? [], ct);
            return answer is null ? NotFound() : Ok(answer);
        }
        catch (ArgumentException error) { return BadRequest(new { error = error.Message }); }
    }

    [Authorize, HttpPut("attempts/{id:guid}/draft")]
    public async Task<IActionResult> SaveDraft(Guid id, AnswerInput input, CancellationToken ct)
    {
        try
        {
            var saved = await learning.SaveDraft(User.UserId()!.Value, id, input.TokenIndices ?? [], ct);
            return saved is null ? NotFound() : saved.Value ? NoContent() : Conflict();
        }
        catch (ArgumentException error) { return BadRequest(new { error = error.Message }); }
    }

    [HttpGet("words")]
    public async Task<IActionResult> Words(CancellationToken ct) => Ok((await catalog.Words(ct)).Select(x => new { x.Id, x.Ossetian, x.Russian, x.Example, x.AudioPath }));

    [Authorize, HttpGet("vocabulary")]
    public async Task<IActionResult> Vocabulary(CancellationToken ct) => Ok((await progress.SavedWords(User.UserId()!.Value, ct)).Select(x =>
        new { x.WordId, x.Word.Ossetian, x.Word.Russian, x.Word.Example, x.Word.AudioPath, x.Word.DictionaryNote, x.Errors, x.ReviewedAt }));

    [Authorize, HttpPost("vocabulary/{id:guid}")]
    public async Task<IActionResult> SaveWord(Guid id, CancellationToken ct) => await progress.AddWord(User.UserId()!.Value, id, ct) ? Ok() : NotFound();

    [Authorize, HttpPost("vocabulary/dictionary/{id:guid}")]
    public async Task<IActionResult> SaveDictionaryWord(Guid id, CancellationToken ct)
    {
        var wordId = await dictionary.EnsureSavedWord(id, ct);
        return wordId is Guid value && await progress.AddWord(User.UserId()!.Value, value, ct) ? Ok() : NotFound();
    }

    [Authorize, HttpDelete("vocabulary/{id:guid}")]
    public async Task<IActionResult> RemoveWord(Guid id, CancellationToken ct) => await progress.RemoveWord(User.UserId()!.Value, id, ct) ? NoContent() : NotFound();

    [Authorize, HttpPost("vocabulary/{id:guid}/review")]
    public async Task<IActionResult> Review(Guid id, ReviewInput input, CancellationToken ct)
    {
        var word = await catalog.Word(id, ct);
        if (word is null) return NotFound();
        var answer = word.DictionarySenseId is null ? input.Translation : input.Translation.Replace("\u0301", "");
        var expected = word.DictionarySenseId is null ? word.Russian : word.Russian.Replace("\u0301", "");
        var correct = LearningService.Normalize(answer) == LearningService.Normalize(expected);
        return await progress.ReviewWord(User.UserId()!.Value, id, correct, ct) ? Ok(new { correct, expected = word.Russian }) : NotFound();
    }

    [HttpPost("words/{id:guid}/review")]
    public async Task<IActionResult> GuestReview(Guid id, ReviewInput input, CancellationToken ct)
    {
        var word = await catalog.Word(id, ct);
        if (word is null) return NotFound();
        var answer = word.DictionarySenseId is null ? input.Translation : input.Translation.Replace("\u0301", "");
        var expected = word.DictionarySenseId is null ? word.Russian : word.Russian.Replace("\u0301", "");
        return Ok(new { correct = LearningService.Normalize(answer) == LearningService.Normalize(expected), expected = word.Russian });
    }

    [HttpGet("books")]
    public async Task<IActionResult> Books(CancellationToken ct) => Ok((await catalog.Books(ct)).Select(x =>
        new { x.Id, x.Title, x.Authors, x.Difficulty, x.Description, x.CoverImagePath }));

    [HttpGet("books/{id:guid}")]
    public async Task<IActionResult> Book(Guid id, CancellationToken ct)
    {
        var book = await catalog.Book(id, ct);
        if (book is null) return NotFound();
        var chapters = book.Chapters.OrderBy(x => x.Number).Select(x => new
            { x.Id, x.Number, x.Title, tokens = JsonSerializer.Deserialize<BookToken[]>(x.TokensJson, BookJsonOptions) ?? [] }).ToArray();
        var senseIds = chapters.SelectMany(x => x.tokens).SelectMany(x => x.Matches ?? []).Select(x => x.SenseId).Distinct().ToArray();
        var meanings = await dictionary.Meanings(senseIds, ct);
        return Ok(new { book.Id, book.Title, book.Authors, book.Difficulty, book.Description, book.CoverImagePath,
            book.LiteraryTranslation, chapters, dictionary = meanings });
    }

    [Authorize, HttpGet("books/{id:guid}/position")]
    public async Task<IActionResult> Position(Guid id, CancellationToken ct)
    {
        var book = await catalog.Book(id, ct);
        if (book is null) return NotFound();
        return Ok(await progress.ReadingPosition(User.UserId()!.Value, id, ct));
    }

    [Authorize, HttpPut("books/{id:guid}/position")]
    public async Task<IActionResult> SavePosition(Guid id, ReadingInput input, CancellationToken ct)
    {
        var book = await catalog.Book(id, ct);
        if (book is null) return NotFound();
        var chapter = book.Chapters.SingleOrDefault(x => x.Id == input.ChapterId);
        if (chapter is null || input.TokenIndex < 0 || input.TokenIndex >= (JsonSerializer.Deserialize<BookToken[]>(chapter.TokensJson, BookJsonOptions)?.Length ?? 0)) return BadRequest();
        await progress.SaveReadingPosition(User.UserId()!.Value, id, chapter.Id, input.TokenIndex, ct);
        return NoContent();
    }

    [Authorize, HttpGet("progress")]
    public async Task<IActionResult> Progress(CancellationToken ct)
    {
        var userId = User.UserId()!.Value;
        return Ok(LearningService.Summarize(await progress.Activities(userId, ct), await progress.Achievements(userId, ct)));
    }
}
