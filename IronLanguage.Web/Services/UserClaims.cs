using System.Security.Claims;

namespace IronLanguage.Web.Services;

public static class UserClaims
{
    public static Guid? UserId(this ClaimsPrincipal principal) => Guid.TryParse(principal.FindFirstValue(ClaimTypes.NameIdentifier), out var id) ? id : null;
}
