using Microsoft.EntityFrameworkCore;
using Scry.Api.Storage;

namespace Scry.Api.Controllers;

internal static class SourceNames
{
    /// <summary>
    /// Why <paramref name="names"/> cannot name new sources in the workspace, with the status to answer, or null when
    /// they can. The <paramref name="noun"/> is what each name is picked for, such as <c>table</c>.
    /// </summary>
    public static async Task<(string Detail, int Status)?> CheckAsync(
        ScryDbContext db,
        int workspaceId,
        IReadOnlyList<string> names,
        string noun,
        CancellationToken ct)
    {
        if (names.Count == 0)
        {
            return ($"Choose at least one {noun}.", StatusCodes.Status400BadRequest);
        }

        if (names.FirstOrDefault(name => !Source.IsValidName(name)) is { } invalid)
        {
            return ($"'{invalid}': {Source.NameRule}", StatusCodes.Status400BadRequest);
        }

        if (names.GroupBy(name => name).FirstOrDefault(group => group.Count() > 1) is { } repeated)
        {
            return ($"Two {noun}s are both named '{repeated.Key}'.", StatusCodes.Status400BadRequest);
        }

        return await db.Sources.Where(source => source.WorkspaceId == workspaceId && names.Contains(source.Name)).Select(source => source.Name).FirstOrDefaultAsync(ct)
            is { } taken
            ? ($"A source named '{taken}' already exists.", StatusCodes.Status409Conflict)
            : null;
    }
}
