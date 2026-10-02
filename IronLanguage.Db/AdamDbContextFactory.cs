using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace IronLanguage.Db;

public sealed class AdamDbContextFactory : IDesignTimeDbContextFactory<AdamDbContext>
{
    public AdamDbContext CreateDbContext(string[] args)
    {
        var options = new DbContextOptionsBuilder<AdamDbContext>()
            .UseNpgsql(Environment.GetEnvironmentVariable("ConnectionStrings__Adam") ?? "Host=localhost;Database=adam;Username=adam")
            .Options;
        return new AdamDbContext(options);
    }
}
