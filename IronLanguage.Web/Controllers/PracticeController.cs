using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace IronLanguage.Web.Controllers;

public sealed class PracticeController : Controller
{
    [HttpGet("translate")]
    public IActionResult Translate() => View("Index", "translation");

    [HttpGet("vocabulary")]
    public IActionResult Vocabulary() => View();

    [HttpGet("word-practice")]
    public IActionResult WordPractice() => View();

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

    [HttpGet("grammar")]
    public IActionResult Grammar() => View();
    [HttpGet("listening")]
    public IActionResult Listening() => View();

    [HttpGet("game")]
    public IActionResult Game() => View();

    [Authorize, HttpGet("progress")]
    public IActionResult Progress() => View();
}
