using IronLanguage.Web.Services;
using Microsoft.AspNetCore.Mvc;

namespace IronLanguage.Web.Controllers;

public sealed record CrosswordInput(Dictionary<string, string?>? Cells);

[AutoValidateAntiforgeryToken]
public sealed class CrosswordsController(CrosswordService service) : Controller
{
    [HttpGet("games/crosswords")]
    public IActionResult Index() => View();

    [HttpGet("api/v1/crosswords")]
    public async Task<IActionResult> Levels(CancellationToken ct) => Ok(await service.Levels(User.UserId(), ct));

    [HttpGet("api/v1/crosswords/{id:int}/{version:int}")]
    public async Task<IActionResult> Open(int id, int version, CancellationToken ct)
    {
        var result = await service.Open(User.UserId(), id, version, ct);
        return result is null ? NotFound() : Ok(result);
    }

    [HttpPost("api/v1/crosswords/{id:int}/{version:int}/check"), RequestSizeLimit(16384)]
    public async Task<IActionResult> Check(int id, int version, [FromBody] CrosswordInput? input, CancellationToken ct)
    {
        if (!ModelState.IsValid || input?.Cells is null) return BadRequest(new { error = "Передайте заполненное поле кроссворда." });
        try
        {
            var result = await service.Check(User.UserId(), id, version, input.Cells, ct);
            return result is null ? NotFound() : Ok(result);
        }
        catch (ArgumentException error) { return BadRequest(new { error = error.Message }); }
    }
}
