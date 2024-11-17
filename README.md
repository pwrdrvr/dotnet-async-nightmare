## Overview

This demo shows the problem with async task completions moving between threads and how much CPU that is using.

This problem exists in all async frameworks I tested, including those in the JVM, Go, Rust, and Dotnet.  Limiting each framework to 1 or 2 threads can significantly reduce CPU usage and increase RPS per CPU core.  For a simple way to test these other frameworks, just use the web server examples in [the-benchmarker/web-frameworks](https://github.com/the-benchmarker/web-frameworks) and experiment with the number of threads allowed for async tasks.

Node.js does not suffer from this because it has a single worker thread in each Javascript runtime instance, so there is no context switching between threads and no task stealing.

The question is: why are we using async task completions at all if it's causing 4.8x more CPU usage per RPS compared to a single thread?

## Links

Initial report of high CPU usage in a reverse proxy: https://github.com/pwrdrvr/lambda-dispatch/issues/43

Open issue in DotNet since 2022, with partial work-around: https://github.com/dotnet/runtime/issues/72153#issuecomment-1216363757

Original source for aspnet-minimal-api: https://github.com/the-benchmarker/web-frameworks/tree/master/csharp/aspnet-minimal-api

Original source for thread pool control function: https://github.com/pwrdrvr/lambda-dispatch/blob/e5e32a0d5bdbbfb6e89acaedaf4bf2ec7d0de177/src/PwrDrvr.LambdaDispatch.Router/Program.cs#L8-L74s

Details of 700% CPU usage for a dotnet reverse proxy to send 17k RPS to a Node.js express server using less than 100% CPU: https://github.com/pwrdrvr/lambda-dispatch/issues/109

## Install DotNet 9.0

https://dotnet.microsoft.com/en-us/download/dotnet/9.0

## Build

```bash
dotnet restore

dotnet build -c Release
```

## Run

```bash
# Base case - Uses 600-670% CPU to deliver 130k-140k RPS
# ~22k RPS per CPU core
# This *as fast* as Node.js with express.js per CPU core
./bin/Release/net9.0/web

# Disabling Semaphore spinning - Uses 266-320% CPU to deliver 115k-130k RPS
# ~43k RPS per CPU core
DOTNET_ThreadPool_UnfairSemaphoreSpinLimit=0 ./bin/Release/net9.0/web

# Note on `oha` CPU usage
# `oha` (Rust) is using 200-300% CPU to geneate the above requests with default Tokio async runtime config

# Limiting `oha` to 1 thread - Uses 700% CPU to deliver 100k RPS
# 14k RPS per CPU core
./bin/Release/net9.0/web

# Limiting `oha` to 1 thread and disabling Semaphore spinning - Uses 300% CPU to deliver 90k RPS
# 30k RPS per CPU core
# `oha` uses 90% CPU
DOTNET_ThreadPool_UnfairSemaphoreSpinLimit=0 ./bin/Release/net9.0/web

# Limiting `oha` to 2 threads and disabling Semaphore spinning - Uses 330% CPU to deliver 120k-140k RPS
# 43k RPS per CPU core
# `oha` uses 160% CPU
DOTNET_ThreadPool_UnfairSemaphoreSpinLimit=0 ./bin/Release/net9.0/web

# Limiting dotnet to 1 thread, disabling Semaphore spinning, and limiting `oha` to 2 threads
# Uses 114% CPU to deliver 120k-130k RPS
# 105k RPS per CPU core
# 🔥 4.8x RPS per CPU core compared to base case 🔥
# `oha` uses 125% CPU
# Note: 1 thread can get a little wonky with the async completions
 LAMBDA_DISPATCH_MaxWorkerThreads=1 DOTNET_ThreadPool_UnfairSemaphoreSpinLimit=0 ./bin/Release/net9.0/web

 # Limitng the IO completion port threads to 1 has no effect on CPU usage
```

## Testing

```bash
# Smoke Test
curl http://localhost:5000/user/1234

# Load Test
oha -c 20 -z 60s http://localhost:5000/user/1234

# Load test with 1 Tokio runtime thread
TOKIO_WORKER_THREADS=1 oha -c 20 -z 60s http://localhost:5000/user/1234
```
