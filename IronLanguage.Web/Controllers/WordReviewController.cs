using IronLanguage.Db;
using IronLanguage.Web.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace IronLanguage.Web.Controllers;

public sealed record ReviewStartInput(string Mode);
public sealed record ReviewSettingsInput(string Format, bool DirectInput);
public sealed record TopicSaveInput(Guid[] SenseIds);

[ApiController, Authorize, AutoValidateAntiforgeryToken, Route("api/v1/word-review")]
public sealed class WordReviewController(IWordReviewRepository repository, WordReviewService service, TimeProvider clock, VocabularyTopicService topics) : ControllerBase
{
    private Guid Owner => User.UserId()!.Value;

    [AllowAnonymous, HttpGet("topics")]
    public async Task<IActionResult> Topics(CancellationToken ct) => Ok(await topics.Topics(User.UserId(), ct));

    [HttpPost("topics/{id:int}/words")]
    public async Task<IActionResult> AddTopicWords(int id, TopicSaveInput input, CancellationToken ct)
    {
        try { return Ok(new { added = await topics.Add(Owner, id, input.SenseIds, ct) }); }
        catch (ArgumentException error) { return BadRequest(new { error = error.Message }); }
    }

    [HttpGet("summary")]
    public async Task<IActionResult> Summary(CancellationToken ct) => Ok(await repository.Counts(Owner, clock.GetUtcNow(), ct));

    [HttpGet("words")]
    public async Task<IActionResult> Words(string search = "", string status = "all", string sort = "due", int page = 1, int size = 30, CancellationToken ct = default)
    {
        if (search.Length > 100 || status is not ("all" or "new" or "learning" or "mastered") || sort is not ("due" or "recent" or "alphabet" or "errors")) return BadRequest();
        if (status == "new") status = "learning";
        return Ok(await repository.Page(Owner, WordReviewRules.Normalize(search), status, sort, page, Math.Clamp(size, 1, 30), ct));
    }

    [HttpGet("settings")]
    public async Task<IActionResult> Settings(CancellationToken ct)
    {
        var settings = await repository.Settings(Owner, ct);
        return Ok(new { settings.Format, settings.DirectInput });
    }

    [AllowAnonymous, HttpGet("available")]
    public async Task<IActionResult> Available(string search = "", int page = 1, CancellationToken ct = default)
    {
        if (search.Length > 100) return BadRequest();
        return Ok(await repository.Available(User.UserId(), search.Trim().Replace('æ', 'ӕ').Replace('Æ', 'Ӕ'), page, ct));
    }

    [HttpPut("settings")]
    public async Task<IActionResult> SaveSettings(ReviewSettingsInput input, CancellationToken ct)
    {
        if (input.Format is not ("auto" or "cards" or "test")) return BadRequest();
        await repository.SaveSettings(new() { UserId = Owner, Format = input.Format, DirectInput = input.DirectInput }, ct);
        return NoContent();
    }

    [HttpGet("session")]
    public async Task<IActionResult> Session(CancellationToken ct) => Ok(await service.Current(Owner, ct));

    [HttpPost("sessions")]
    public async Task<IActionResult> Start(ReviewStartInput input, CancellationToken ct)
    {
        try { return Ok(await service.Start(Owner, input.Mode, ct)); }
        catch (ArgumentException error) { return BadRequest(new { error = error.Message }); }
    }

    [HttpPost("sessions/{id:guid}")]
    public async Task<IActionResult> Command(Guid id, ReviewCommand input, CancellationToken ct)
    {
        try
        {
            var result = await service.Command(Owner, id, input, ct);
            return result is null ? NotFound(new { error = "Занятие не найдено. Начните новое." }) : Ok(result);
        }
        catch (ArgumentException error) { return BadRequest(new { error = error.Message }); }
        catch (InvalidOperationException error) { return Conflict(new { error = error.Message }); }
    }
}
