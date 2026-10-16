using IronLanguage.Db;
using IronLanguage.Web.Services;
using Microsoft.AspNetCore.Mvc;

namespace IronLanguage.Web.Controllers;

public sealed record MatchingCheckInput(int LeftIndex, int RightIndex);

[ApiController, AutoValidateAntiforgeryToken, Route("api/v1")]
public sealed class MatchingApiController(ICatalogRepository catalog, MatchingService matching, GuestLearningStore guests) : ControllerBase
{
    [HttpGet("matching")]
    public async Task<IActionResult> List(CancellationToken ct) =>
        Ok((await catalog.Matchings(ct)).Select(x => new { x.Id, x.Title, x.Version }));

    [HttpPost("matching/{id:guid}/sessions")]
    public async Task<IActionResult> Start(Guid id, CancellationToken ct)
    {
        try
        {
            var owner = User.UserId() ?? guests.Owner(HttpContext);
            var board = await matching.Start(owner, Guid.NewGuid(), id, ct);
            return board is null ? NotFound() : Ok(board);
        }
        catch (GuestCapacityException error) { return StatusCode(503, new { error = error.Message }); }
    }

    [HttpPost("matching/sessions/{sid:guid}/check")]
    public async Task<IActionResult> Check(Guid sid, MatchingCheckInput input, CancellationToken ct)
    {
        try
        {
            var owner = User.UserId() ?? guests.Owner(HttpContext);
            var result = await matching.Check(owner, sid, input.LeftIndex, input.RightIndex, ct);
            return result is null ? NotFound() : Ok(result);
        }
        catch (ArgumentException error) { return BadRequest(new { error = error.Message }); }
    }

    [HttpGet("matching/sessions/{sid:guid}")]
    public async Task<IActionResult> Session(Guid sid, CancellationToken ct)
    {
        var owner = User.UserId() ?? guests.Owner(HttpContext);
        var board = await matching.Board(owner, sid, ct);
        return board is null ? NotFound() : Ok(board);
    }
}
