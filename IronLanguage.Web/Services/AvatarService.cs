using System.Security.Claims;
using IronLanguage.Db;
using IronLanguage.Web.Models;

namespace IronLanguage.Web.Services;

public sealed class AvatarService(IAccountRepository accounts)
{
    private Task<AvatarOptions>? current;

    // Scoped service: the profile and header share one account lookup per request.
    public Task<AvatarOptions> Current(ClaimsPrincipal principal) => current ??= Load(principal);

    private async Task<AvatarOptions> Load(ClaimsPrincipal principal)
    {
        if (!Guid.TryParse(principal.FindFirstValue(ClaimTypes.NameIdentifier), out var id)) return new();
        return await ForUser(id);
    }

    public async Task<AvatarOptions> ForUser(Guid id, CancellationToken ct = default)
    {
        var user = await accounts.FindById(id, ct);
        return AvatarOptions.Read(user?.AvatarJson);
    }
}
