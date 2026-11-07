using Microsoft.Extensions.Caching.Memory;

namespace IronLanguage.Web.Services;

// Only transient snapshots live here; guest activity never reaches the progress repositories.
public sealed class GuestLearningStore : IDisposable
{
    private readonly MemoryCache cache;
    public GuestLearningStore() : this(new MemoryCacheOptions { SizeLimit = 1024 }) { }
    public GuestLearningStore(MemoryCacheOptions options)
    {
        cache = new MemoryCache(options);
        sizeLimit = options.SizeLimit;
    }
    private readonly long? sizeLimit;
    private readonly object capacityGate = new();
    private readonly Dictionary<(Type Type, Guid Owner, Guid Id), object> groupAliases = new();
    private const string CookieName = "Adam.Guest";

    public Guid Owner(HttpContext context)
    {
        if (!Guid.TryParse(context.Request.Cookies[CookieName], out var owner)) owner = Guid.NewGuid();
        context.Response.Cookies.Append(CookieName, owner.ToString(), new CookieOptions
        {
            HttpOnly = true, Secure = context.Request.IsHttps, SameSite = SameSiteMode.Strict,
            IsEssential = true, MaxAge = TimeSpan.FromHours(2)
        });
        return owner;
    }

    public void Add<T>(Guid owner, Guid id, T value) where T : class
    {
        // Set may reject a new entry at capacity; verify admission before returning its ID.
        lock (capacityGate)
        {
            if (cache.Count >= 1024) CompactForAdmission();
            var key = (typeof(T), owner, id);
            if (HasLiveGroupAlias(key)) throw new InvalidOperationException("Идентификатор принадлежит гостевому уроку.");
            var entry = new Entry<T>(value);
            cache.Set(key, entry, new MemoryCacheEntryOptions
            {
                Size = 1, SlidingExpiration = TimeSpan.FromMinutes(30), AbsoluteExpirationRelativeToNow = TimeSpan.FromHours(2)
            });
            if (!cache.TryGetValue(key, out Entry<T>? stored) || !ReferenceEquals(stored, entry))
            {
                CompactForAdmission();
                cache.Set(key, entry, new MemoryCacheEntryOptions
                {
                    Size = 1, SlidingExpiration = TimeSpan.FromMinutes(30), AbsoluteExpirationRelativeToNow = TimeSpan.FromHours(2)
                });
                if (!cache.TryGetValue(key, out stored) || !ReferenceEquals(stored, entry)) throw new GuestCapacityException();
            }
        }
    }

    // A lesson and all of its attempts share one cache entry and one expiration.
    public void AddGroup(Guid owner, Action<GroupBuilder> build)
    {
        var builder = new GroupBuilder(owner);
        build(builder);
        if (builder.Entries.Count == 0 || builder.Entries.Count > 1024 || (sizeLimit is long limit && builder.Entries.Count > limit)) throw new GuestCapacityException();
        lock (capacityGate)
        {
            foreach (var alias in builder.Entries.Keys)
                if (HasLiveGroupAlias(alias) || cache.TryGetValue(alias, out _))
                    throw new InvalidOperationException("Повторный идентификатор гостевого занятия.");
            var group = builder.Entries;
            object? Store()
            {
                var key = new object();
                var options = new MemoryCacheEntryOptions
                {
                    Size = group.Count, SlidingExpiration = TimeSpan.FromMinutes(30), AbsoluteExpirationRelativeToNow = TimeSpan.FromHours(2)
                };
                options.RegisterPostEvictionCallback((_, _, _, _) =>
                {
                    lock (capacityGate)
                        foreach (var alias in group.Keys)
                            if (groupAliases.TryGetValue(alias, out var current) && ReferenceEquals(current, key))
                                groupAliases.Remove(alias);
                });
                cache.Set(key, group, options);
                return cache.TryGetValue(key, out Dictionary<(Type Type, Guid Owner, Guid Id), object>? stored) && ReferenceEquals(stored, group) ? key : null;
            }
            var groupKey = Store();
            if (groupKey is null)
            {
                CompactForAdmission();
                groupKey = Store() ?? throw new GuestCapacityException();
            }
            foreach (var alias in group.Keys) groupAliases.Add(alias, groupKey);
        }
    }

    // MemoryCache rounds the target entry count down; always request at least one entry.
    private void CompactForAdmission()
    {
        var count = cache.Count;
        if (count > 0) cache.Compact(Math.Min(1d, Math.Max(0.1d, Math.BitIncrement(1d / count))));
    }

    // Eviction callbacks are asynchronous. A stale alias must not block a new entry.
    private bool HasLiveGroupAlias((Type Type, Guid Owner, Guid Id) alias)
    {
        if (!groupAliases.TryGetValue(alias, out var key)) return false;
        if (cache.TryGetValue(key, out _)) return true;
        groupAliases.Remove(alias);
        return false;
    }

    public sealed class GroupBuilder(Guid owner)
    {
        internal Dictionary<(Type Type, Guid Owner, Guid Id), object> Entries { get; } = new();
        public void Add<T>(Guid id, T value) where T : class => Entries.Add((typeof(T), owner, id), new Entry<T>(value));
    }

    public Entry<T>? Find<T>(Guid owner, Guid id) where T : class
    {
        lock (capacityGate)
        {
            var alias = (typeof(T), owner, id);
            if (cache.TryGetValue(alias, out Entry<T>? entry)) return entry;
            if (!groupAliases.TryGetValue(alias, out var groupKey)) return null;
            if (cache.TryGetValue(groupKey, out Dictionary<(Type Type, Guid Owner, Guid Id), object>? group)
                && group is not null && group.TryGetValue(alias, out var value)) return (Entry<T>)value;
            // The eviction callback also removes the other aliases.
            groupAliases.Remove(alias);
            return null;
        }
    }

    public Entry<T> GetOrAdd<T>(Guid owner, Guid id, Func<T> create) where T : class
    {
        lock (capacityGate)
        {
            var existing = Find<T>(owner, id);
            if (existing is not null) return existing;
            Add(owner, id, create());
            return Find<T>(owner, id) ?? throw new GuestCapacityException();
        }
    }

    public sealed class Entry<T>(T value) where T : class
    {
        public T Value { get; } = value;
        public SemaphoreSlim Gate { get; } = new(1, 1);
    }

    public void Dispose() => cache.Dispose();
}
public sealed class GuestCapacityException() : Exception("Сейчас слишком много гостевых занятий. Попробуйте начать задание позже.");
