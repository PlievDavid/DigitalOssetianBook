using IronLanguage.Web.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace IronLanguage.Web.Controllers;

public sealed record WordleInput(DateOnly Day, int Revision, string? Guess);

[AutoValidateAntiforgeryToken]
public sealed class WordleController(WordleService service, GuestLearningStore guests) : Controller
{
    private Guid GuestOwner() => User.UserId() is null ? guests.Owner(HttpContext) : Guid.Empty;
    [HttpGet("games/wordle")]
    public IActionResult Index() => View();
    [HttpGet("api/v1/wordle"), ResponseCache(NoStore = true, Location = ResponseCacheLocation.None)]
    public async Task<IActionResult> Open(CancellationToken ct)
    {
        try { return Ok(await service.Open(User.UserId(), GuestOwner(), ct)); }
        catch (GuestCapacityException error) { return StatusCode(503, new { error = error.Message }); }
    }
    [HttpPost("api/v1/wordle/guess"), RequestSizeLimit(1024)]
    public async Task<IActionResult> Guess([FromBody] WordleInput? input, CancellationToken ct)
    {
        if (!ModelState.IsValid || input?.Guess is null || input.Guess.Length > 32) return BadRequest(new { error = "Введите слово из пяти букв." });
        try { return Ok(await service.Guess(User.UserId(), GuestOwner(), input.Day, input.Revision, input.Guess, ct)); }
        catch (ArgumentException error) { return BadRequest(new { error = error.Message }); }
        catch (WordleConflictException error) { return Conflict(new { error = error.Message }); }
        catch (GuestCapacityException error) { return StatusCode(503, new { error = error.Message }); }
    }
    [Authorize, HttpGet("api/v1/wordle/statistics"), ResponseCache(NoStore = true, Location = ResponseCacheLocation.None)]
    public async Task<IActionResult> Statistics(CancellationToken ct) => Ok(await service.Statistics(User.UserId()!.Value, ct));
}
