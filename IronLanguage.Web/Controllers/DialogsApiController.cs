using IronLanguage.Db;
using IronLanguage.Web.Models;
using IronLanguage.Web.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace IronLanguage.Web.Controllers;

[ApiController, AutoValidateAntiforgeryToken, Route("api/v1")]
public sealed class DialogsApiController(ICatalogRepository catalog, DialogueService dialogs, DictionaryService dictionary, GuestLearningStore guests) : ControllerBase
{
    [HttpGet("dialogs")]
    public async Task<IActionResult> Dialogs(CancellationToken ct) =>
        Ok((await catalog.Dialogues(ct)).Select(x => new { x.Id, x.Title, x.Dialect, x.Level, x.Version }));

    [HttpGet("dialogs/{id:guid}")]
    public async Task<IActionResult> Conditions(Guid id, CancellationToken ct) =>
        await dialogs.Conditions(id, ct) is { } view ? Ok(view) : NotFound();

    [HttpPost("dialogs/{id:guid}/sessions")]
    public async Task<IActionResult> Start(Guid id, CancellationToken ct)
    {
        var view = User.UserId() is Guid userId ? await dialogs.Start(userId, id, ct)
            : await dialogs.StartGuest(guests.Owner(HttpContext), id, ct);
        return view is null ? NotFound() : Ok(await WithDictionary(view, ct));
    }

    [HttpPost("dialogs/sessions/{sid:guid}/answer")]
    public async Task<IActionResult> Answer(Guid sid, DialogueAnswerInput input, CancellationToken ct)
    {
        try
        {
            var view = User.UserId() is Guid userId ? await dialogs.Answer(userId, sid, input, ct)
                : await dialogs.AnswerGuest(guests.Owner(HttpContext), sid, input, ct);
            return view is null ? NotFound() : Ok(await WithDictionary(view, ct));
        }
        catch (ArgumentException error) { return BadRequest(new { error = error.Message }); }
        catch (DialogueConflictException error) { return Conflict(new { error = error.Message }); }
    }

    [HttpGet("dialogs/sessions/{sid:guid}")]
    public async Task<IActionResult> Session(Guid sid, CancellationToken ct)
    {
        var view = User.UserId() is Guid userId ? await dialogs.GetSession(userId, sid, ct)
            : await dialogs.GetGuestSession(guests.Owner(HttpContext), sid, ct);
        return view is null ? NotFound() : Ok(await WithDictionary(view, ct));
    }

    [Authorize, HttpGet("dialogs/sessions/history")]
    public async Task<IActionResult> History(CancellationToken ct) => Ok(await dialogs.History(User.UserId()!.Value, ct));

    private async Task<DialogueLineView[]> LinesWithMatches(DialogueLineView[] lines, CancellationToken ct)
    {
        var byKey = await dictionary.Matches(lines.SelectMany(line => line.Words).Select(word => word.Text), ct);
        return DialogueDictionary.WithMatches(lines, byKey);
    }

    private async Task<DialogueMeaningView[]> Meanings(DialogueLineView[] lines, CancellationToken ct) =>
        DialogueDictionary.Meanings(await dictionary.Meanings(DialogueDictionary.SenseIds(lines), ct));

    private async Task<DialogueSessionView> WithDictionary(DialogueSessionView view, CancellationToken ct)
    {
        var lines = await LinesWithMatches(view.Lines, ct);
        return view with { Lines = lines, Dictionary = await Meanings(lines, ct) };
    }

    private async Task<DialogueAnswerView> WithDictionary(DialogueAnswerView view, CancellationToken ct)
    {
        var lines = await LinesWithMatches(view.Lines, ct);
        return view with { Lines = lines, Dictionary = await Meanings(lines, ct) };
    }
}
