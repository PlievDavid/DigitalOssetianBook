using Microsoft.AspNetCore.Mvc;

namespace IronLanguage.Web.Controllers;

public sealed class GamesController : Controller
{
    [HttpGet("games")]
    public IActionResult Index() => View();
}
