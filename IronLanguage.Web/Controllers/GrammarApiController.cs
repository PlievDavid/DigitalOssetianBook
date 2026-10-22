using IronLanguage.Db;
using IronLanguage.Web.Services;
using Microsoft.AspNetCore.Mvc;

namespace IronLanguage.Web.Controllers;

public sealed record GrammarCheckInput(int? OptionIndex);

[ApiController, AutoValidateAntiforgeryToken, Route("api/v1")]
public sealed class GrammarApiController(ICatalogRepository catalog, GrammarService grammars, DictionaryService dictionary, GuestLearningStore guests) : ControllerBase
{
    [HttpGet("grammars")]
    public async Task<IActionResult> List(CancellationToken ct) =>
        Ok((await catalog.Grammars(ct)).Select(x => new { x.Id, x.Title, x.Version }));

    [HttpPost("grammars/{id:guid}/sessions")]
    public async Task<IActionResult> Start(Guid id, CancellationToken ct)
    {
        try
        {
            var owner = User.UserId() ?? guests.Owner(HttpContext);
            var board = await grammars.Start(owner, Guid.NewGuid(), id, ct);
            return board is null ? NotFound() : Ok(await WithDictionary(board, ct));
        }
        catch (GuestCapacityException error) { return StatusCode(503, new { error = error.Message }); }
    }

    [HttpPost("grammars/sessions/{sid:guid}/check")]
    public async Task<IActionResult> Check(Guid sid, GrammarCheckInput input, CancellationToken ct)
    {
        try
        {
            var owner = User.UserId() ?? guests.Owner(HttpContext);
            var result = await grammars.Check(owner, sid, input.OptionIndex, ct);
            return result is null ? NotFound() : Ok(await WithDictionary(result, ct));
        }
        catch (ArgumentException error) { return BadRequest(new { error = error.Message }); }
    }

    [HttpGet("grammars/sessions/{sid:guid}")]
    public async Task<IActionResult> Session(Guid sid, CancellationToken ct)
    {
        var owner = User.UserId() ?? guests.Owner(HttpContext);
        var board = await grammars.Board(owner, sid, ct);
        return board is null ? NotFound() : Ok(await WithDictionary(board, ct));
    }

    private async Task<GrammarSessionState> WithDictionary(GrammarSessionState view, CancellationToken ct)
    {
        var (sentence, meanings) = await Enrich(view.Sentence, ct);
        return view with { Sentence = sentence, Dictionary = meanings };
    }

    private async Task<GrammarCheckResult> WithDictionary(GrammarCheckResult view, CancellationToken ct)
    {
        var (sentence, meanings) = await Enrich(view.Sentence, ct);
        return view with { Sentence = sentence, Dictionary = meanings };
    }

    private async Task<(GrammarSentenceWord[] Sentence, GrammarMeaningView[] Meanings)> Enrich(
        GrammarSentenceWord[] sentence, CancellationToken ct)
    {
        if (sentence.Length == 0) return ([], []);
        var byKey = await dictionary.Matches(sentence.Select(x => x.Text), ct);
        var withMatches = sentence.Select(word => word with
        {
            Matches = byKey.GetValueOrDefault(DictionaryService.Key(word.Text), [])
        }).ToArray();
        var senseIds = withMatches.SelectMany(x => x.Matches).Select(x => x.SenseId).Distinct().ToArray();
        var meanings = DialogueDictionary.Meanings(await dictionary.Meanings(senseIds, ct))
            .Select(x => new GrammarMeaningView(x.Id, x.Ossetian, x.Russian, x.RussianHeadword, x.Note))
            .ToArray();
        return (withMatches, meanings);
    }
}
