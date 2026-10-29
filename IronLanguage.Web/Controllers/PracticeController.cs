using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace IronLanguage.Web.Controllers;

public sealed class PracticeController : Controller
{
    [HttpGet("translate")]
    public IActionResult Translate() => View("Index", "translation");

    [HttpGet("vocabulary")]
    public IActionResult Vocabulary() => View(User.Identity?.IsAuthenticated == true ? "Vocabulary" : "VocabularyGuest");

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
