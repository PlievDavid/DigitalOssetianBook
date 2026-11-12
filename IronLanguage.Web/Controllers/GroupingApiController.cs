using IronLanguage.Db;
using IronLanguage.Web.Services;
using Microsoft.AspNetCore.Mvc;

namespace IronLanguage.Web.Controllers;

public sealed record GroupingCheckInput(int WordIndex, int GroupIndex);

[ApiController, AutoValidateAntiforgeryToken, Route("api/v1")]
public sealed class GroupingApiController(ICatalogRepository catalog, GroupingService grouping, GuestLearningStore guests) : ControllerBase
{
    [HttpGet("groupings")]
    public async Task<IActionResult> List(CancellationToken ct) =>
        Ok((await catalog.Groupings(ct)).Select(x => new { x.Id, x.Title, x.Version }));

    [HttpPost("groupings/{id:guid}/sessions")]
    public async Task<IActionResult> Start(Guid id, CancellationToken ct)
    {
        try
        {
            var owner = User.UserId() ?? guests.Owner(HttpContext);
            var board = await grouping.Start(owner, Guid.NewGuid(), id, ct);
            return board is null ? NotFound() : Ok(board);
        }
        catch (GuestCapacityException error) { return StatusCode(503, new { error = error.Message }); }
        catch (InvalidOperationException error) { return UnprocessableEntity(new { error = error.Message }); }
    }

    [HttpPost("groupings/sessions/{sid:guid}/check")]
    public async Task<IActionResult> Check(Guid sid, GroupingCheckInput input, CancellationToken ct)
    {
        try
        {
            var owner = User.UserId() ?? guests.Owner(HttpContext);
            var result = await grouping.Check(owner, sid, input.WordIndex, input.GroupIndex, ct);
            return result is null ? NotFound() : Ok(result);
        }
        catch (ArgumentException error) { return BadRequest(new { error = error.Message }); }
    }

    [HttpGet("groupings/sessions/{sid:guid}")]
    public async Task<IActionResult> Session(Guid sid, CancellationToken ct)
    {
        var owner = User.UserId() ?? guests.Owner(HttpContext);
        var board = await grouping.Board(owner, sid, ct);
        return board is null ? NotFound() : Ok(board);
    }
}
