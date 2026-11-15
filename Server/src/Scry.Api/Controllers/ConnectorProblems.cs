using Microsoft.AspNetCore.Mvc;
using Nexus;

namespace Scry.Api.Controllers;

internal static class ConnectorProblems
{
    /// <summary>A connector's failure as a problem: 503 for one worth retrying later, 400 for anything else.</summary>
    public static ObjectResult ConnectorProblem(this ControllerBase controller, ConnectorException ex) =>
        controller.Problem(
            ex.Message,
            statusCode: ex.Kind == ConnectorErrorKind.Transient
                ? StatusCodes.Status503ServiceUnavailable
                : StatusCodes.Status400BadRequest);
}
