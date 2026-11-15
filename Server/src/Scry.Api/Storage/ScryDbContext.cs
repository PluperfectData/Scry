using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;

namespace Scry.Api.Storage;

public sealed class ScryDbContext(DbContextOptions<ScryDbContext> options) : DbContext(options)
{
    public static readonly MySqlServerVersion ServerVersion = new(new Version(8, 4, 0));

    // Databases drop DateTimeKind, so every stored time is read back as UTC.
    private static readonly ValueConverter<DateTime, DateTime> Utc = new(
        value => value,
        value => DateTime.SpecifyKind(value, DateTimeKind.Utc));

    public DbSet<Source> Sources => Set<Source>();

    public DbSet<Connection> Connections => Set<Connection>();

    public DbSet<Dashboard> Dashboards => Set<Dashboard>();

    public DbSet<IngestKey> IngestKeys => Set<IngestKey>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Source>(source =>
        {
            source.ToTable("sources");
            source.HasIndex(s => s.Name).IsUnique();
            source.Property(s => s.Name).HasMaxLength(Source.MaxNameLength);
            source.Property(s => s.FileName).HasMaxLength(255);
            source.Property(s => s.StoredFile).HasMaxLength(64);
            source.Property(s => s.Stream).HasMaxLength(255);
            source.Property(s => s.SyncedAt).HasConversion(Utc);
            source.Property(s => s.Status).HasConversion<string>().HasMaxLength(16);
            source.Property(s => s.Error).HasMaxLength(1000);
            source.HasOne(s => s.Connection).WithMany().HasForeignKey(s => s.ConnectionId).OnDelete(DeleteBehavior.Restrict);
            source.HasOne(s => s.IngestKey).WithMany().HasForeignKey(s => s.IngestKeyId).OnDelete(DeleteBehavior.SetNull);
        });

        modelBuilder.Entity<IngestKey>(key =>
        {
            key.ToTable("ingest_keys");
            key.HasIndex(k => k.Hash).IsUnique();
            key.Property(k => k.Name).HasMaxLength(IngestKey.MaxNameLength);
            key.Property(k => k.Hash).HasMaxLength(64);
            key.Property(k => k.Prefix).HasMaxLength(16);
            key.Property(k => k.CreatedAt).HasConversion(Utc);
        });

        modelBuilder.Entity<Connection>(connection =>
        {
            connection.ToTable("connections");
            connection.Property(c => c.Connector).HasMaxLength(32);
            connection.Property(c => c.CreatedAt).HasConversion(Utc);
        });

        modelBuilder.Entity<Dashboard>(dashboard =>
        {
            dashboard.ToTable("dashboards");
            dashboard.Property(d => d.Name).HasMaxLength(Dashboard.MaxNameLength);
            dashboard.Property(d => d.CreatedAt).HasConversion(Utc);
            dashboard.Property(d => d.UpdatedAt).HasConversion(Utc);
            dashboard.HasIndex(d => d.Landing).IsUnique();
        });
    }
}
