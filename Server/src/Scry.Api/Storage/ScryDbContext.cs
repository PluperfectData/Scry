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

    private static readonly ValueConverter<DateTime?, DateTime?> NullableUtc = new(
        value => value,
        value => value.HasValue ? DateTime.SpecifyKind(value.Value, DateTimeKind.Utc) : null);

    public DbSet<Source> Sources => Set<Source>();

    public DbSet<Connection> Connections => Set<Connection>();

    public DbSet<Dashboard> Dashboards => Set<Dashboard>();

    public DbSet<IngestKey> IngestKeys => Set<IngestKey>();

    public DbSet<NexusLink> NexusLinks => Set<NexusLink>();

    public DbSet<User> Users => Set<User>();

    public DbSet<RefreshToken> RefreshTokens => Set<RefreshToken>();

    public DbSet<Workspace> Workspaces => Set<Workspace>();

    public DbSet<WorkspaceMember> WorkspaceMembers => Set<WorkspaceMember>();

    public DbSet<LogEntry> LogEntries => Set<LogEntry>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<User>(user =>
        {
            user.ToTable("users");
            user.HasIndex(u => u.Email).IsUnique();
            user.Property(u => u.Email).HasMaxLength(User.MaxEmailLength);
            user.Property(u => u.PasswordHash).HasMaxLength(255);
            user.Property(u => u.LinkStamp).HasMaxLength(64);
            user.Property(u => u.CreatedAt).HasConversion(Utc);
            user.Property(u => u.SignedInAt).HasConversion(NullableUtc);
        });

        modelBuilder.Entity<RefreshToken>(token =>
        {
            token.ToTable("refresh_tokens");
            token.HasIndex(t => t.TokenHash).IsUnique();
            token.HasIndex(t => t.UserId);
            token.Property(t => t.UserId).HasMaxLength(32);
            token.Property(t => t.Email).HasMaxLength(User.MaxEmailLength);
            token.Property(t => t.TokenHash).HasMaxLength(64);
            token.Property(t => t.IssuedForIp).HasMaxLength(64);
            token.Property(t => t.RevokedReason).HasMaxLength(200);
        });

        modelBuilder.Entity<Workspace>(workspace =>
        {
            workspace.ToTable("workspaces");
            workspace.HasIndex(w => w.Folder).IsUnique();
            workspace.Property(w => w.Name).HasMaxLength(Workspace.MaxNameLength);
            workspace.Property(w => w.Folder).HasMaxLength(64);
            workspace.Property(w => w.CreatedAt).HasConversion(Utc);
        });

        modelBuilder.Entity<LogEntry>(entry =>
        {
            entry.ToTable("log_entries");
            entry.HasIndex(e => e.At);
            entry.HasIndex(e => new { e.WorkspaceId, e.Id });
            entry.Property(e => e.At).HasConversion(Utc);
            entry.Property(e => e.Level).HasConversion<string>().HasMaxLength(16);
            entry.Property(e => e.Text).HasMaxLength(LogEntry.MaxTextLength);
            entry.Property(e => e.Actor).HasMaxLength(LogEntry.MaxActorLength);
            entry.Ignore(e => e.Pending);
            entry.HasOne(e => e.Workspace).WithMany().HasForeignKey(e => e.WorkspaceId).OnDelete(DeleteBehavior.SetNull);
            entry.HasOne(e => e.Source).WithMany().HasForeignKey(e => e.SourceId).OnDelete(DeleteBehavior.SetNull);
        });

        modelBuilder.Entity<WorkspaceMember>(member =>
        {
            member.ToTable("workspace_members");
            member.HasKey(m => new { m.WorkspaceId, m.UserId });
            member.Property(m => m.Role).HasConversion<string>().HasMaxLength(16);
            member.HasOne(m => m.Workspace).WithMany().HasForeignKey(m => m.WorkspaceId).OnDelete(DeleteBehavior.Cascade);
            member.HasOne(m => m.User).WithMany().HasForeignKey(m => m.UserId).OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<Source>(source =>
        {
            source.ToTable("sources");
            source.HasIndex(s => new { s.WorkspaceId, s.Name }).IsUnique();
            source.Property(s => s.Name).HasMaxLength(Source.MaxNameLength);
            source.Property(s => s.FileName).HasMaxLength(255);
            source.Property(s => s.StoredFile).HasMaxLength(64);
            source.Property(s => s.Stream).HasMaxLength(255);
            source.Property(s => s.Origin).HasMaxLength(Source.MaxOriginLength);
            source.Property(s => s.SyncedAt).HasConversion(Utc);
            source.Property(s => s.Status).HasConversion<string>().HasMaxLength(16);
            source.Property(s => s.Error).HasMaxLength(1000);
            source.HasOne(s => s.Connection).WithMany().HasForeignKey(s => s.ConnectionId).OnDelete(DeleteBehavior.Restrict);
            source.HasOne(s => s.IngestKey).WithMany().HasForeignKey(s => s.IngestKeyId).OnDelete(DeleteBehavior.SetNull);
            source.HasOne<Workspace>().WithMany().HasForeignKey(s => s.WorkspaceId).OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<NexusLink>(link =>
        {
            link.ToTable("nexus_link");
            link.HasIndex(l => l.WorkspaceId).IsUnique();
            link.Property(l => l.NexusUrl).HasMaxLength(2000);
            link.Property(l => l.AppName).HasMaxLength(200);
            link.Property(l => l.WorkspaceName).HasMaxLength(200);
            link.Property(l => l.LinkedAt).HasConversion(Utc);
            link.HasOne(l => l.IngestKey).WithMany().HasForeignKey(l => l.IngestKeyId).OnDelete(DeleteBehavior.SetNull);
            link.HasOne<Workspace>().WithMany().HasForeignKey(l => l.WorkspaceId).OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<IngestKey>(key =>
        {
            key.ToTable("ingest_keys");
            key.HasIndex(k => k.Hash).IsUnique();
            key.Property(k => k.Name).HasMaxLength(IngestKey.MaxNameLength);
            key.Property(k => k.Hash).HasMaxLength(64);
            key.Property(k => k.Prefix).HasMaxLength(16);
            key.Property(k => k.CreatedAt).HasConversion(Utc);
            key.HasOne<Workspace>().WithMany().HasForeignKey(k => k.WorkspaceId).OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<Connection>(connection =>
        {
            connection.ToTable("connections");
            connection.Property(c => c.Connector).HasMaxLength(32);
            connection.Property(c => c.CreatedAt).HasConversion(Utc);
            connection.HasOne<Workspace>().WithMany().HasForeignKey(c => c.WorkspaceId).OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<Dashboard>(dashboard =>
        {
            dashboard.ToTable("dashboards");
            dashboard.Property(d => d.Name).HasMaxLength(Dashboard.MaxNameLength);
            dashboard.Property(d => d.CreatedAt).HasConversion(Utc);
            dashboard.Property(d => d.UpdatedAt).HasConversion(Utc);
            dashboard.HasIndex(d => new { d.WorkspaceId, d.Landing }).IsUnique();
            dashboard.HasOne<Workspace>().WithMany().HasForeignKey(d => d.WorkspaceId).OnDelete(DeleteBehavior.Restrict);
        });
    }
}
