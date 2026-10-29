using IronLanguage.Web.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace IronLanguage.Web.Controllers;

[Authorize(Roles = "Editor"), Route("editor/reading-preview")]
[ResponseCache(NoStore = true, Location = ResponseCacheLocation.None)]
public sealed class ReadingPreviewController(IWebHostEnvironment environment) : Controller
{
    [HttpGet]
    public IActionResult Index()
    {
        var path = Path.Combine(environment.ContentRootPath, "Data", "reading", "drafts.json");
        var drafts = ReadingDraftCatalog.Read(path).Select(draft => draft with
        {
            CoverReady = Exists(draft.CoverImagePath),
            IllustrationReady = Exists(draft.IllustrationImagePath)
        }).ToArray();
        return View("~/Views/Practice/ReadingPreview.cshtml", drafts);
    }

    private bool Exists(string path) =>
        System.IO.File.Exists(Path.Combine(environment.WebRootPath, path.TrimStart('/').Replace('/', Path.DirectorySeparatorChar)));
}
