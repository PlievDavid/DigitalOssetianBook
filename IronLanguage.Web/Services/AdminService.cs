using IronLanguage.Db;
using Microsoft.AspNetCore.Identity;
namespace IronLanguage.Web.Services;

public sealed class AdminService(IAdminRepository repository, UserManager<UserAccount> users)
{
    public static readonly string[] Actions = ["grant-admin", "revoke-admin", "grant-editor", "revoke-editor", "block", "unblock", "signout"];
    public async Task Change(Guid? actor, Guid target, string action, string reason, string expectedStamp, CancellationToken ct, bool bootstrap = false)
    {
        reason = reason.Trim();
        if (!Actions.Contains(action) || reason.Length is < 3 or > 500) throw new ArgumentException("Выберите действие и укажите причину от 3 до 500 символов.");
        if (bootstrap && (actor is not null || action != "grant-admin")) throw new InvalidOperationException("Недопустимая серверная операция.");
        await repository.Mutate(async () =>
        {
            if (!bootstrap && (actor is null || !await repository.IsActiveAdmin(actor.Value, ct))) throw new UnauthorizedAccessException("Права администратора отозваны.");
            var user = await users.FindByIdAsync(target.ToString()) ?? throw new ArgumentException("Пользователь не найден.");
            if (!bootstrap && user.ConcurrencyStamp != expectedStamp) throw new ArgumentException("Данные пользователя изменились. Обновите страницу и повторите действие.");
            var roles = await users.GetRolesAsync(user);
            if (actor == target && (action is "block" or "revoke-admin")) throw new ArgumentException("Нельзя заблокировать себя или снять собственную роль Admin.");
            if (!user.IsBlocked && roles.Contains("Admin") && (action is "block" or "revoke-admin") && await repository.ActiveAdmins(ct) <= 1)
                throw new ArgumentException("На платформе должен остаться хотя бы один действующий администратор.");
            var before = State(user, roles);
            IdentityResult? result = null;
            switch (action)
            {
                case "grant-admin": if (!roles.Contains("Admin")) result = await users.AddToRoleAsync(user, "Admin"); break;
                case "revoke-admin": if (roles.Contains("Admin")) result = await users.RemoveFromRoleAsync(user, "Admin"); break;
                case "grant-editor": if (!roles.Contains("Editor")) result = await users.AddToRoleAsync(user, "Editor"); break;
                case "revoke-editor": if (roles.Contains("Editor")) result = await users.RemoveFromRoleAsync(user, "Editor"); break;
                case "block": user.IsBlocked = true; break;
                case "unblock": user.IsBlocked = false; user.LockoutEnd = null; user.AccessFailedCount = 0; break;
            }
            Ensure(result);
            var after = State(user, await users.GetRolesAsync(user));
            if (before == after && action != "signout") return;
            Ensure(await users.UpdateSecurityStampAsync(user));
            await repository.AddAudit(new AdminAudit { ActorId = actor, TargetId = target, Action = action, Reason = reason,
                Before = before, After = action == "signout" ? after + "; все сеансы завершены" : after }, ct);
        }, ct);
    }
    private static string State(UserAccount user, IEnumerable<string> roles) => $"Роли: {string.Join(", ", roles.Order())}; {(user.IsBlocked ? "заблокирован" : "активен")}";
    private static void Ensure(IdentityResult? result)
    {
        if (result is { Succeeded: false }) throw new ArgumentException("Не удалось сохранить изменение. Обновите страницу и повторите действие.");
    }
}
