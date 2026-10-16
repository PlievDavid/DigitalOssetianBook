using System.Security.Claims;
using System.Text.Json;
using IronLanguage.Db;
using IronLanguage.Web.Models;
using IronLanguage.Web.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace IronLanguage.Web.Controllers;

public sealed class AvatarController(IAccountRepository accounts, AvatarService avatars) : Controller
{
    [Authorize, HttpGet("/profile/avatar")]
    public async Task<IActionResult> Edit(bool onboarding = false) =>
        View(new AvatarEditorModel { Options = await avatars.Current(User), Onboarding = onboarding });

    [Authorize, HttpPost("/profile/avatar"), ValidateAntiForgeryToken]
    public async Task<IActionResult> Edit(AvatarEditorModel model, CancellationToken ct)
    {
        if (!ModelState.IsValid)
        {
            model.Options = model.Options?.Sanitize() ?? new();
            return View(model);
        }
        if (!Guid.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var id)) return Unauthorized();
        if (!await accounts.SaveAvatar(id, JsonSerializer.Serialize(model.Options), ct)) return NotFound();
        TempData["AvatarSaved"] = true;
        return Redirect(model.Onboarding ? "/" : "/profile");
    }

    // Only catalog keys are accepted; no user IDs, uploaded SVG or arbitrary CSS enter the renderer.
    [HttpGet("/avatars/render"), ResponseCache(Duration = 86400, Location = ResponseCacheLocation.Any)]
    public IActionResult Render([FromQuery] AvatarOptions options, AvatarEmotion emotion = AvatarEmotion.Neutral, bool portrait = false)
    {
        if (!ModelState.IsValid || !Enum.IsDefined(emotion)) return BadRequest();
        Response.Headers.XContentTypeOptions = "nosniff";
        Response.Headers.ContentSecurityPolicy = "default-src 'none'; style-src 'unsafe-inline'; sandbox";
        return Content(AvatarRenderer.Svg(options, emotion, portrait), "image/svg+xml; charset=utf-8");
    }
}
