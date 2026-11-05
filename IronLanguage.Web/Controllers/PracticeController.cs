using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using IronLanguage.Db;
using IronLanguage.Web.Services;

namespace IronLanguage.Web.Controllers;

public sealed class PracticeController : Controller
{
    [HttpGet("translate")]
    public IActionResult Translate() => View("Index", "translation");

    [HttpGet("vocabulary")]
    public async Task<IActionResult> Vocabulary([FromServices] IWordReviewRepository review, [FromServices] TimeProvider clock, CancellationToken ct)
    {
        if (User.UserId() is not Guid owner) return View("VocabularyGuest");
        if (Request.Query.ContainsKey("status") || Request.Query.ContainsKey("search") ||
            Request.Query.ContainsKey("sort") || Request.Query.ContainsKey("page"))
            return Redirect("/vocabulary/all" + Request.QueryString);
        var week = await review.MasteryWeek(owner, DateOnly.FromDateTime(clock.GetUtcNow().UtcDateTime), ct);
        return View("WordsHome", week);
    }

    [Authorize, HttpGet("vocabulary/all")]
    public IActionResult AllWords() => View("Vocabulary");

    [HttpGet("vocabulary/available")]
    public IActionResult AvailableWords() => View("VocabularyList", "available");

    [HttpGet("word-practice")]
    public IActionResult WordPractice() => View(User.Identity?.IsAuthenticated == true ? "WordPractice" : "WordPracticeGuest");

    [HttpGet("books")]
    public IActionResult Books() => Redirect("/reading" + Request.QueryString);

    [HttpGet("reading")]
    public IActionResult Reading() => View();

    [HttpGet("dialogs")]
    public IActionResult Dialogs() => View();

    [HttpGet("matching")]
    public IActionResult Matching() => View();

    [HttpGet("picture")]
    public IActionResult Picture() => View();

    [HttpGet("listening")]
    public IActionResult Listening() => View();

    [HttpGet("game")]
    public IActionResult Game() => View();

    [Authorize, HttpGet("progress")]
    public IActionResult Progress() => View();
}
