using System.Security.Claims;
using IronLanguage.Db;
using Microsoft.AspNetCore.Identity;
using Microsoft.Extensions.Options;

namespace IronLanguage.Web.Services;

public sealed class AdamClaimsFactory(UserManager<UserAccount> users, RoleManager<IdentityRole<Guid>> roles,
    IOptions<IdentityOptions> options) : UserClaimsPrincipalFactory<UserAccount, IdentityRole<Guid>>(users, roles, options)
{
    protected override async Task<ClaimsIdentity> GenerateClaimsAsync(UserAccount user)
    {
        var identity = await base.GenerateClaimsAsync(user);
        if (identity.HasClaim(Options.ClaimsIdentity.RoleClaimType, "Admin") && !identity.HasClaim(Options.ClaimsIdentity.RoleClaimType, "Editor"))
            identity.AddClaim(new Claim(Options.ClaimsIdentity.RoleClaimType, "Editor"));
        return identity;
    }
}

public sealed class AdamSignInManager(UserManager<UserAccount> users, IHttpContextAccessor accessor,
    IUserClaimsPrincipalFactory<UserAccount> factory, IOptions<IdentityOptions> options, ILogger<SignInManager<UserAccount>> logger,
    Microsoft.AspNetCore.Authentication.IAuthenticationSchemeProvider schemes, IUserConfirmation<UserAccount> confirmation)
    : SignInManager<UserAccount>(users, accessor, factory, options, logger, schemes, confirmation)
{
    public override async Task<bool> CanSignInAsync(UserAccount user) => !user.IsBlocked && await base.CanSignInAsync(user);
    public override async Task<UserAccount?> ValidateSecurityStampAsync(ClaimsPrincipal? principal)
    {
        var user = await base.ValidateSecurityStampAsync(principal);
        return user is { IsBlocked: false } ? user : null;
    }
}
