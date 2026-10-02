using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace IronLanguage.Web.Controllers;

[Authorize]
public sealed class AudioPuzzlesController : Controller
{
    [HttpGet("audio-puzzles")]
    public IActionResult Index() => View("~/Views/Practice/Index.cshtml", "audio");
}
