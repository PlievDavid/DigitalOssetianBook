using System.ComponentModel.DataAnnotations;
using System.Security.Claims;
using IronLanguage.Db;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;

namespace IronLanguage.Web.Controllers;

public sealed class AccountInput
{
    [Required, EmailAddress, MaxLength(254)] public string Email { get; set; } = "";
    [Required, MinLength(8, ErrorMessage = "Пароль должен содержать хотя бы 8 символов."), MaxLength(128)] public string Password { get; set; } = "";
}

[Route("account")]
public sealed class AccountController(IAccountRepository accounts) : Controller
{
    private readonly PasswordHasher<UserAccount> hasher = new();

    [HttpGet("login")]
    public IActionResult Login(string? returnUrl = null) { ViewData["ReturnUrl"] = returnUrl; return View(new AccountInput()); }

    [HttpPost("login"), ValidateAntiForgeryToken]
    public async Task<IActionResult> Login(AccountInput input, string? returnUrl, CancellationToken ct)
    {
        ViewData["ReturnUrl"] = returnUrl;
        if (!ModelState.IsValid) return View(input);
        var user = await accounts.FindByEmail(input.Email.Trim().ToLowerInvariant(), ct);
        if (user is null || hasher.VerifyHashedPassword(user, user.PasswordHash, input.Password) == PasswordVerificationResult.Failed)
        { ModelState.AddModelError("", "Неверный адрес или пароль."); return View(input); }
        await SignIn(user);
        return LocalRedirect(Url.IsLocalUrl(returnUrl) ? returnUrl! : "/");
    }

    [HttpGet("register")]
    public IActionResult Register() => View(new AccountInput());

    [HttpGet("access-denied")]
    public IActionResult AccessDenied() => View();

    [Authorize, HttpGet("/profile")]
    public IActionResult Profile() => View();

    [HttpPost("register"), ValidateAntiForgeryToken]
    public async Task<IActionResult> Register(AccountInput input, CancellationToken ct)
    {
        if (!ModelState.IsValid) return View(input);
        var user = new UserAccount { Email = input.Email.Trim().ToLowerInvariant() };
        user.PasswordHash = hasher.HashPassword(user, input.Password);
        if (!await accounts.Create(user, ct))
        { ModelState.AddModelError(nameof(input.Email), "Этот адрес уже зарегистрирован."); return View(input); }
        await SignIn(user);
        return Redirect("/");
    }

    [Authorize, HttpPost("logout"), ValidateAntiForgeryToken]
    public async Task<IActionResult> Logout() { await HttpContext.SignOutAsync(); return Redirect("/"); }

    private Task SignIn(UserAccount user)
    {
        var claims = new List<Claim> { new(ClaimTypes.NameIdentifier, user.Id.ToString()), new(ClaimTypes.Name, user.Email) };
        if (user.IsEditor) claims.Add(new Claim(ClaimTypes.Role, "Editor"));
        return HttpContext.SignInAsync(CookieAuthenticationDefaults.AuthenticationScheme, new ClaimsPrincipal(new ClaimsIdentity(claims, CookieAuthenticationDefaults.AuthenticationScheme)));
    }
}
