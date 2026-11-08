using System.ComponentModel.DataAnnotations;
using IronLanguage.Db;
using IronLanguage.Web.Services;
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

    [Required(ErrorMessage = "Повторите пароль."), Compare(nameof(Password), ErrorMessage = "Пароли не совпадают."), MaxLength(128)]
    public string ConfirmPassword { get; set; } = "";
}

[Route("account")]
public sealed class AccountController(IAccountRepository accounts, AvatarService avatars, UserManager<UserAccount> users, SignInManager<UserAccount> signIn) : Controller
{

    [HttpGet("login")]
    public IActionResult Login(string? returnUrl = null) { ViewData["ReturnUrl"] = returnUrl; return View(new AccountInput()); }

    [HttpPost("login"), ValidateAntiForgeryToken]
    public async Task<IActionResult> Login(AccountInput input, string? returnUrl, CancellationToken ct)
    {
        ViewData["ReturnUrl"] = returnUrl;
        if (!ModelState.IsValid) return View(input);
        var user = await users.FindByEmailAsync(input.Email.Trim());
        if (user is null || !(await signIn.PasswordSignInAsync(user, input.Password, isPersistent: false, lockoutOnFailure: true)).Succeeded)
        { ModelState.AddModelError("", "Неверный адрес или пароль."); return View(input); }
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
        var email = input.Email.Trim().ToLowerInvariant();
        var user = new UserAccount { Email = email, UserName = email, PublicName = input.PublicName.Trim() };
        if (!(await users.CreateAsync(user, input.Password)).Succeeded)
        { ModelState.AddModelError(nameof(input.Email), "Этот адрес уже зарегистрирован."); return View(input); }
        await signIn.SignInAsync(user, isPersistent: false);
        return Redirect("/profile/avatar?onboarding=true");
    }

    [Authorize, HttpPost("logout"), ValidateAntiForgeryToken]
    public async Task<IActionResult> Logout() { await signIn.SignOutAsync(); return Redirect("/"); }

}
