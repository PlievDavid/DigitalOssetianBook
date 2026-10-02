using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace IronLanguage.Web.Controllers;

[Authorize]
public sealed class PracticeController : Controller
{
    [HttpGet("translate")]
    public IActionResult Translate() => View("Index", "translation");

    [HttpGet("vocabulary")]
    public IActionResult Vocabulary() => View();

    [HttpGet("word-practice")]
    public IActionResult WordPractice() => View();

    [HttpGet("books")]
    public IActionResult Books() => View();

    [HttpGet("game")]
    public IActionResult Game() => View();

    [HttpGet("progress")]
    public IActionResult Progress() => View();
}
