using IronLanguage.Db;
using IronLanguage.Web.Services;
using Microsoft.AspNetCore.Mvc;

namespace IronLanguage.Web.Controllers;

public sealed record PictureCheckInput(int? OptionIndex, string? Answer);

[ApiController, AutoValidateAntiforgeryToken, Route("api/v1")]
public sealed class PictureApiController(ICatalogRepository catalog, PictureService pictures, GuestLearningStore guests) : ControllerBase
{
    [HttpGet("pictures")]
    public async Task<IActionResult> List(CancellationToken ct) =>
        Ok((await catalog.Pictures(ct)).Select(x => new { x.Id, x.Title, x.Version }));

    [HttpPost("pictures/{id:guid}/sessions")]
    public async Task<IActionResult> Start(Guid id, CancellationToken ct)
    {
        try
        {
            var owner = User.UserId() ?? guests.Owner(HttpContext);
            var board = await pictures.Start(owner, Guid.NewGuid(), id, ct);
            return board is null ? NotFound() : Ok(board);
        }
        catch (GuestCapacityException error) { return StatusCode(503, new { error = error.Message }); }
    }

    [HttpPost("pictures/sessions/{sid:guid}/check")]
    public async Task<IActionResult> Check(Guid sid, PictureCheckInput input, CancellationToken ct)
    {
        try
        {
            var owner = User.UserId() ?? guests.Owner(HttpContext);
            var result = await pictures.Check(owner, sid, input.OptionIndex, input.Answer, ct);
            return result is null ? NotFound() : Ok(result);
        }
        catch (ArgumentException error) { return BadRequest(new { error = error.Message }); }
    }

    [HttpGet("pictures/sessions/{sid:guid}")]
    public async Task<IActionResult> Session(Guid sid, CancellationToken ct)
    {
        var owner = User.UserId() ?? guests.Owner(HttpContext);
        var board = await pictures.Board(owner, sid, ct);
        return board is null ? NotFound() : Ok(board);
    }
}
