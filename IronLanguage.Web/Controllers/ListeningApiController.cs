using IronLanguage.Db;
using IronLanguage.Web.Services;
using Microsoft.AspNetCore.Mvc;

namespace IronLanguage.Web.Controllers;

public sealed record ListeningAnswerInput(int? OptionIndex);

[ApiController, AutoValidateAntiforgeryToken, Route("api/v1")]
public sealed class ListeningApiController(ICatalogRepository catalog, ListeningService listening, GuestLearningStore guests) : ControllerBase
{
    [HttpGet("listening")]
    public async Task<IActionResult> Catalog(CancellationToken ct) =>
        Ok((await catalog.Exercises("listening", ct)).Select(x => new { x.Id, Question = x.RussianPrompt, x.AudioPath }));

    [HttpPost("listening/{id:guid}/attempts")]
    public async Task<IActionResult> Start(Guid id, CancellationToken ct)
    {
        try
        {
            if (User.UserId() is not Guid userId)
            {
                var guest = await listening.StartGuest(guests.Owner(HttpContext), id, ct);
                return guest is null ? NotFound() : Ok(new { card = guest.Value.Card, attemptId = guest.Value.Attempt.Id });
            }
            var result = await listening.Start(userId, id, ct);
            return result is null ? NotFound() : Ok(new { card = result.Value.Card, attemptId = result.Value.Attempt.Id });
        }
        catch (GuestCapacityException error) { return StatusCode(503, new { error = error.Message }); }
    }

    [HttpPost("listening/attempts/{id:guid}/answer")]
    public async Task<IActionResult> Answer(Guid id, ListeningAnswerInput input, CancellationToken ct)
    {
        if (input.OptionIndex is not int option) return BadRequest(new { error = "Выберите один из четырёх вариантов ответа." });
        try
        {
            var result = User.UserId() is Guid userId
                ? await listening.Answer(userId, id, option, ct)
                : await listening.AnswerGuest(guests.Owner(HttpContext), id, option, ct);
            return result is null ? NotFound() : Ok(result);
        }
        catch (ArgumentException error) { return BadRequest(new { error = error.Message }); }
    }
}
