using Microsoft.Extensions.Caching.Memory;

namespace IronLanguage.Web.Services;

// Only transient snapshots live here; guest activity never reaches the progress repositories.
public sealed class GuestLearningStore : IDisposable
{
    private readonly MemoryCache cache = new(new MemoryCacheOptions { SizeLimit = 1024 });
    private const string CookieName = "Adam.Guest";

    public Guid Owner(HttpContext context)
    {
        if (Guid.TryParse(context.Request.Cookies[CookieName], out var owner)) return owner;
        owner = Guid.NewGuid();
        context.Response.Cookies.Append(CookieName, owner.ToString(), new CookieOptions
        {
            HttpOnly = true, Secure = context.Request.IsHttps, SameSite = SameSiteMode.Strict,
            IsEssential = true, MaxAge = TimeSpan.FromHours(2)
        });
        return owner;
    }

    public void Add<T>(Guid owner, Guid id, T value) where T : class =>
        cache.Set((typeof(T), owner, id), new Entry<T>(value), new MemoryCacheEntryOptions
        {
            Size = 1, SlidingExpiration = TimeSpan.FromMinutes(30), AbsoluteExpirationRelativeToNow = TimeSpan.FromHours(2)
        });

    public Entry<T>? Find<T>(Guid owner, Guid id) where T : class =>
        cache.TryGetValue((typeof(T), owner, id), out Entry<T>? entry) ? entry : null;

    public sealed class Entry<T>(T value) where T : class
    {
        public T Value { get; } = value;
        public SemaphoreSlim Gate { get; } = new(1, 1);
    }

    public void Dispose() => cache.Dispose();
}