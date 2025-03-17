# CLAUDE.md - dotnet-async-nightmare

## Build & Run Commands
```bash
# Build
dotnet restore
dotnet build -c Release

# Run (various configurations)
./src/web/bin/Release/net8.0/web
DOTNET_ThreadPool_UnfairSemaphoreSpinLimit=0 ./src/web/bin/Release/net8.0/web
LAMBDA_DISPATCH_MaxWorkerThreads=1 DOTNET_ThreadPool_UnfairSemaphoreSpinLimit=0 ./src/web/bin/Release/net8.0/web

# Test
curl http://localhost:5001/user/1234
oha -c 20 -z 60s http://localhost:5001/user/1234
```

## Code Style Guidelines
- **Project Structure**: Minimal ASP.NET Core API style
- **C# Features**: Use top-level statements, implicit usings, string interpolation
- **Naming**: Use camelCase for variables, PascalCase for methods
- **Documentation**: XML comments for methods with `<summary>` tags
- **Error Handling**: Use exceptions with descriptive messages
- **Thread Management**: Use environment variables for configuring thread pools
- **Logging**: Use string interpolation for console logging
- **API Endpoints**: Use minimal API style with lambda expressions