using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace Scry.Api.Storage;

/// <summary>Lets <c>dotnet ef</c> build the model without a database or the app's configuration.</summary>
public sealed class DesignTimeDbContextFactory : IDesignTimeDbContextFactory<ScryDbContext>
{
    public ScryDbContext CreateDbContext(string[] args) => new(
        new DbContextOptionsBuilder<ScryDbContext>()
            .UseMySql("Server=localhost;Database=scry", ScryDbContext.ServerVersion)
            .Options);
}
