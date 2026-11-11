# Scry

Drag-and-drop dashboards over data synced by [Nexus](https://github.com/PluperfectData/Nexus).

Status: not started. No projects yet; CI and releases are added with the first one.

## Planned

| Part | Choice |
|---|---|
| API | .NET 10, MVC controllers |
| Client | React |
| Application data | MySQL: accounts, dashboards, settings |
| Synced data | DuckDB, in process, one file per workspace, written by the Nexus DuckDB destination |
| Charts | Pie, line, scatter, table, candlestick |
| Layout | Drag and drop, one layout per breakpoint |

Nexus is consumed as a sibling checkout through a `ProjectReference`: clone both repositories into the
same parent directory.

## License

AGPL-3.0-only. See `LICENSE`.
