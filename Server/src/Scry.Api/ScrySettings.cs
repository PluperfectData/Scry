namespace Scry.Api;

/// <summary>
/// The <c>Scry</c> configuration section. Apart from the data folder, each value is an operator's way around the
/// installer and the Settings page: one set here wins over the one stored, and the pages cannot change it.
/// </summary>
public sealed class ScrySettings
{
    public const string Section = "Scry";

    /// <summary>Where uploads and DuckDB files live, relative to the content root unless absolute.</summary>
    public string DataDirectory { get; set; } = "data";

    /// <summary>The one origin CORS allows: the client's.</summary>
    public string? ClientOrigin { get; set; }

    /// <summary>This API's own origin, which Scry gives Nexus for its push API and its pairing callback.</summary>
    public string? ApiOrigin { get; set; }

    /// <summary>The Nexus address Scry's server reaches, which the Link Nexus form starts with.</summary>
    public string? NexusUrl { get; set; }

    /// <summary>The origin Nexus pushes rows to, where it reaches this API at another address than browsers do.</summary>
    public string? IngestOrigin { get; set; }

    /// <summary>The address mail comes from, on a domain the mail transport may send as.</summary>
    public string? MailFrom { get; set; }

    public string? MailFromName { get; set; }

    /// <summary>How many days the operator log keeps an entry, from 1 to 365.</summary>
    public int? LogDays { get; set; }
}
