using IronLanguage.Db;
using IronLanguage.Web.Models;
using IronLanguage.Web.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace IronLanguage.Web.Controllers;

[ApiController, AutoValidateAntiforgeryToken, Route("api/v1")]
public sealed class DialogsApiController(ICatalogRepository catalog, DialogueService dialogs) : ControllerBase
{
    [Authorize, HttpGet("dialogs")]
    public async Task<IActionResult> Dialogs(CancellationToken ct) =>
        Ok((await catalog.Dialogues(ct)).Select(x => new { x.Id, x.Title, x.Dialect, x.Level, x.Version }));

    [Authorize, HttpGet("dialogs/{id:guid}")]
    public async Task<IActionResult> Conditions(Guid id, CancellationToken ct) =>
        await dialogs.Conditions(id, ct) is { } view ? Ok(view) : NotFound();

    [Authorize, HttpPost("dialogs/{id:guid}/sessions")]
    public async Task<IActionResult> Start(Guid id, CancellationToken ct) =>
        await dialogs.Start(User.UserId()!.Value, id, ct) is { } view ? Ok(view) : NotFound();

    [Authorize, HttpPost("dialogs/sessions/{sid:guid}/answer")]
    public async Task<IActionResult> Answer(Guid sid, DialogueAnswerInput input, CancellationToken ct)
    {
        try
        {
            var view = await dialogs.Answer(User.UserId()!.Value, sid, input, ct);
            return view is null ? NotFound() : Ok(view);
        }
        catch (ArgumentException error) { return BadRequest(new { error = error.Message }); }
    }

    [Authorize, HttpGet("dialogs/sessions/{sid:guid}")]
    public async Task<IActionResult> Session(Guid sid, CancellationToken ct) =>
        await dialogs.GetSession(User.UserId()!.Value, sid, ct) is { } view ? Ok(view) : NotFound();

    [Authorize, HttpGet("dialogs/sessions/history")]
    public async Task<IActionResult> History(CancellationToken ct) => Ok(await dialogs.History(User.UserId()!.Value, ct));
}
