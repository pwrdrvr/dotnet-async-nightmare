var cmdArgs = Environment.GetCommandLineArgs();
bool showVersionInfo = cmdArgs.Contains("--version");

if (showVersionInfo)
{
    PrintVersionInfo();
    return;
}

AdjustThreadPool();

var builder = WebApplication.CreateBuilder();
builder.WebHost.ConfigureKestrel(o => { o.AddServerHeader = false; o.ListenAnyIP(5001); });
builder.Logging.ClearProviders();

var app = builder.Build();

app.MapGet("/", () => { });

app.MapGet("user/{id}", (string id) => id);

app.MapPost("user", () => { });

app.MapGet("version", () => {
    return new {
        RuntimeVersion = Environment.Version.ToString(),
        FrameworkDescription = System.Runtime.InteropServices.RuntimeInformation.FrameworkDescription,
        OSDescription = System.Runtime.InteropServices.RuntimeInformation.OSDescription,
        ProcessArchitecture = System.Runtime.InteropServices.RuntimeInformation.ProcessArchitecture.ToString()
    };
});

app.Run();


/// <summary>
/// Adjust the ThreadPool settings based on environment variables
/// LAMBDA_DISPATCH_MinWorkerThreads
/// LAMBDA_DISPATCH_MinCompletionPortThreads
/// LAMBDA_DISPATCH_MaxWorkerThreads
/// LAMBDA_DISPATCH_MaxCompletionPortThreads
/// 
/// Related to: DOTNET_ThreadPool_UnfairSemaphoreSpinLimit
/// </summary>
/// <exception cref="Exception"></exception>
static void AdjustThreadPool()
{
  // Get the default min and max number of worker and completionport threads
  ThreadPool.GetMinThreads(out var minWorkerThreads, out var minCompletionPortThreads);
  ThreadPool.GetMaxThreads(out var maxWorkerThreads, out var maxCompletionPortThreads);

  Console.WriteLine($"Default min threads: {minWorkerThreads} worker threads, {minCompletionPortThreads} completion port threads");
  Console.WriteLine($"Default max threads: {maxWorkerThreads} worker threads, {maxCompletionPortThreads} completion port threads");

  // Check for LAMBDA_DISPATCH_MaxWorkerThreads and LAMBDA_DISPATCH_MaxCompletionPortThreads and apply those new max limits if set
  var maxWorkerThreadsEnv = Environment.GetEnvironmentVariable("LAMBDA_DISPATCH_MaxWorkerThreads");
  var maxCompletionPortThreadsEnv = Environment.GetEnvironmentVariable("LAMBDA_DISPATCH_MaxCompletionPortThreads");
  if (int.TryParse(maxWorkerThreadsEnv, out var newMaxWorkerThreads))
  {
      maxWorkerThreads = newMaxWorkerThreads;
  }
  if (int.TryParse(maxCompletionPortThreadsEnv, out var newMaxCompletionPortThreads))
  {
      maxCompletionPortThreads = newMaxCompletionPortThreads;
  }

  // Ensure min is less than or equal to max in the case where min/max are not overridden
  minWorkerThreads = Math.Min(minWorkerThreads, maxWorkerThreads);
  minCompletionPortThreads = Math.Min(minCompletionPortThreads, maxCompletionPortThreads);

  // Override the calculated min value if set in an env var
  var minWorkerThreadsEnv = Environment.GetEnvironmentVariable("LAMBDA_DISPATCH_MinWorkerThreads");
  var minCompletionPortThreadsEnv = Environment.GetEnvironmentVariable("LAMBDA_DISPATCH_MinCompletionPortThreads");
  if (int.TryParse(minWorkerThreadsEnv, out var newMinWorkerThreads))
  {
      minWorkerThreads = newMinWorkerThreads;
  }
  if (int.TryParse(minCompletionPortThreadsEnv, out var newMinCompletionPortThreads))
  {
      minCompletionPortThreads = newMinCompletionPortThreads;
  }

  var setMinResult = ThreadPool.SetMinThreads(minWorkerThreads, minCompletionPortThreads);
  if (!setMinResult)
  {
      throw new Exception($"Failed to set min threads to {minWorkerThreads} worker threads, {minCompletionPortThreads} completion port threads");
  }

  var setResult = ThreadPool.SetMaxThreads(maxWorkerThreads, maxCompletionPortThreads);
  if (!setResult)
  {
      throw new Exception($"Failed to set max threads to {maxWorkerThreads} worker threads, {maxCompletionPortThreads} completion port threads");
  }

  // Print the final max threads setting
  ThreadPool.GetMinThreads(out minWorkerThreads, out minCompletionPortThreads);
  ThreadPool.GetMaxThreads(out maxWorkerThreads, out maxCompletionPortThreads);
  Console.WriteLine("");
  Console.WriteLine($"Final min threads: {minWorkerThreads} worker threads, {minCompletionPortThreads} completion port threads");
  Console.WriteLine($"Final max threads: {maxWorkerThreads} worker threads, {maxCompletionPortThreads} completion port threads");
  Console.WriteLine("");
}

/// <summary>
/// Prints .NET runtime and framework version information to the console
/// </summary>
static void PrintVersionInfo()
{
  Console.WriteLine("=== .NET Version Information ===");
  
  // Get runtime version
  string runtimeVersion = Environment.Version.ToString();
  Console.WriteLine($"Runtime Version: {runtimeVersion}");
  
  // Get framework version
  string frameworkDescription = System.Runtime.InteropServices.RuntimeInformation.FrameworkDescription;
  Console.WriteLine($"Framework: {frameworkDescription}");
  
  // Get OS information
  string osDescription = System.Runtime.InteropServices.RuntimeInformation.OSDescription;
  Console.WriteLine($"OS: {osDescription}");
  
  // Get architecture information
  var processArchitecture = System.Runtime.InteropServices.RuntimeInformation.ProcessArchitecture;
  Console.WriteLine($"Architecture: {processArchitecture}");
  
  // Current directory
  Console.WriteLine($"Current Directory: {Environment.CurrentDirectory}");
  
  Console.WriteLine("===============================");
}