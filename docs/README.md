# Scry documentation

The detail behind Scry: how each part behaves, every setting and route, and how the code is laid out. To learn what
Scry is and get it running, start with the [README](../README.md).

## Running an instance

- **[Installing](installing.md)**: the installer for Windows, macOS, and Linux, the first run, and where everything is
- **[Running Scry in Docker](docker.md)**: the launcher, the containers, running Scry beside Nexus, and published releases
- **[Running Scry](running.md)**: starting it on your machine, and the installer that sets an instance up
  - [Starting the API and the client](running.md#starting-the-api-and-the-client)
  - [The installer](running.md#the-installer)
- **[Users and workspaces](users-and-workspaces.md)**: signing in, mail, sessions, and what a workspace holds and who may change it
  - [Users and sign-in](users-and-workspaces.md#users-and-sign-in)
  - [Workspaces](users-and-workspaces.md#workspaces)
- **[Logs](logs.md)**: the Log page, who sees what, and the developer log
- **[Configuration](configuration.md)**: every setting configuration can set in place of the pages

## Reference

- **[The API](api.md)**: every route the API answers, the chart queries, and the push API

## Working on Scry

- **[How Scry is built](architecture.md)**: the repository's layout, the technology behind each part, and the checkouts it builds against
  - [The repository](architecture.md#the-repository)
  - [The parts](architecture.md#the-parts)
  - [Sibling checkouts](architecture.md#sibling-checkouts)
- **[Building and testing](building.md)**: the SDKs, the tests, and the lock files
