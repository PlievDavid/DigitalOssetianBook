using System.ComponentModel.DataAnnotations;
using System.Security.Claims;
using IronLanguage.Db;
using IronLanguage.Web.Services;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;

namespace IronLanguage.Web.Controllers;

public class AccountInput
{
    [Required, EmailAddress, MaxLength(254)] public string Email { get; set; } = "";
    [Required, MinLength(8, ErrorMessage = "Пароль должен содержать хотя бы 8 символов."), MaxLength(128)] public string Password { get; set; } = "";
}

public sealed class RegistrationInput : AccountInput
{
    [Required(ErrorMessage = "Введите имя."), MaxLength(100, ErrorMessage = "Имя должно содержать не более 100 символов.")]
    public string PublicName { get; set; } = "";
}

[Route("account")]
public sealed class AccountController(IAccountRepository accounts, AvatarService avatars) : Controller
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
    public IActionResult Register() => View(new RegistrationInput());

    [HttpGet("access-denied")]
    public IActionResult AccessDenied() => View();

    [Authorize, HttpGet("/profile")]
    public async Task<IActionResult> Profile(CancellationToken ct)
    {
        var user = await accounts.FindById(User.UserId()!.Value, ct);
        if (user is null) return NotFound();
        ViewData["PublicName"] = user.PublicName;
        return View(await avatars.Current(User));
    }

    [Authorize, HttpPost("/profile/name"), ValidateAntiForgeryToken]
    public async Task<IActionResult> SavePublicName(string? publicName, CancellationToken ct)
    {
        var name = publicName?.Trim();
        if (string.IsNullOrWhiteSpace(name)) { TempData["PublicNameError"] = "Введите имя."; return Redirect("/profile"); }
        if (name?.Length > 100) { TempData["PublicNameError"] = "Имя должно содержать не более 100 символов."; return Redirect("/profile"); }
        await accounts.SavePublicName(User.UserId()!.Value, name, ct);
        TempData["PublicNameSaved"] = true;
        return Redirect("/profile");
    }

    [HttpPost("register"), ValidateAntiForgeryToken]
    public async Task<IActionResult> Register(RegistrationInput input, CancellationToken ct)
    {
        if (!ModelState.IsValid) return View(input);
        var user = new UserAccount { Email = input.Email.Trim().ToLowerInvariant(), PublicName = input.PublicName.Trim() };
        user.PasswordHash = hasher.HashPassword(user, input.Password);
        if (!await accounts.Create(user, ct))
        { ModelState.AddModelError(nameof(input.Email), "Этот адрес уже зарегистрирован."); return View(input); }
        await SignIn(user);
        return Redirect("/profile/avatar?onboarding=true");
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
