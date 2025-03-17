using System;
using System.Collections.Concurrent;
using System.Diagnostics;
using System.Linq;
using System.Net.Http;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Threading;
using System.Threading.Tasks;

namespace ThreadPoolOrdering
{
    /// <summary>
    /// Test application to examine ThreadPool LIFO behavior across platforms (Mac/Windows)
    /// Tests if the completion of async tasks runs on the same thread and if LIFO scheduling is preserved
    /// </summary>
    class Program
    {
        private static readonly HttpClient _httpClient = new HttpClient();
        private static readonly string _testUrl = "http://localhost:5001/user/1234";
        
        // For storing thread ID data for the histogram
        private static ConcurrentDictionary<int, int> _threadIdCompletionCount = new ConcurrentDictionary<int, int>();
        
        static async Task Main(string[] args)
        {
            PrintSystemInfo();
            
            // Determine which test to run
            if (args.Length > 0)
            {
                switch (args[0])
                {
                    case "--histogram":
                        await RunThreadHistogramTest();
                        break;
                    case "--histogram-serial":
                        await RunSerialHistogramTest();
                        break;
                    default:
                        await RunBasicLifoTest();
                        break;
                }
            }
            else
            {
                await RunBasicLifoTest();
            }
        }
        
        /// <summary>
        /// Prints detailed system and runtime information
        /// </summary>
        static void PrintSystemInfo()
        {
            Console.WriteLine("=== ThreadPool Ordering Test ===");
            Console.WriteLine($"Runtime Version: {Environment.Version}");
            Console.WriteLine($"Framework: {RuntimeInformation.FrameworkDescription}");
            Console.WriteLine($"OS: {RuntimeInformation.OSDescription}");
            Console.WriteLine($"Platform: {RuntimeInformation.OSArchitecture} {RuntimeInformation.ProcessArchitecture}");
            
            // Get ThreadPool settings
            ThreadPool.GetMinThreads(out var minWorkerThreads, out var minCompletionPortThreads);
            ThreadPool.GetMaxThreads(out var maxWorkerThreads, out var maxCompletionPortThreads);
            Console.WriteLine($"ThreadPool Min Threads: {minWorkerThreads} worker, {minCompletionPortThreads} completion");
            Console.WriteLine($"ThreadPool Max Threads: {maxWorkerThreads} worker, {maxCompletionPortThreads} completion");
            
            // Check environment variable for semaphore spin limit
            var spinLimit = Environment.GetEnvironmentVariable("DOTNET_ThreadPool_UnfairSemaphoreSpinLimit");
            Console.WriteLine($"Semaphore Spin Limit: {spinLimit ?? "Default"}");
            
            Console.WriteLine($"Current Process ID: {Process.GetCurrentProcess().Id}");
            Console.WriteLine($"Main Thread ID: {Thread.CurrentThread.ManagedThreadId}");
            Console.WriteLine("===============================\n");
        }
        
        /// <summary>
        /// Basic test for ThreadPool LIFO behavior with just 3 tasks
        /// </summary>
        static async Task RunBasicLifoTest()
        {
            Console.WriteLine("Running Basic LIFO Test with 3 Serial Tasks...\n");
            
            int mainThreadId = Thread.CurrentThread.ManagedThreadId;
            Console.WriteLine($"Main thread before tasks: {mainThreadId}");
            
            // First task
            Console.WriteLine("\nStarting Task 1");
            var task1 = Task.Run(async () => 
            {
                int taskThreadId = Thread.CurrentThread.ManagedThreadId;
                Console.WriteLine($"Task 1 started on thread: {taskThreadId}");
                
                var response = await _httpClient.GetAsync(_testUrl);
                
                int completionThreadId = Thread.CurrentThread.ManagedThreadId;
                Console.WriteLine($"Task 1 completion on thread: {completionThreadId}");
                Console.WriteLine($"Same thread for task 1? {taskThreadId == completionThreadId}");
                
                return completionThreadId;
            });
            
            // Ensure task1 has started but not completed
            await Task.Delay(100);
            
            // Second task 
            Console.WriteLine("\nStarting Task 2");
            var task2 = Task.Run(async () => 
            {
                int taskThreadId = Thread.CurrentThread.ManagedThreadId;
                Console.WriteLine($"Task 2 started on thread: {taskThreadId}");
                
                var response = await _httpClient.GetAsync(_testUrl);
                
                int completionThreadId = Thread.CurrentThread.ManagedThreadId;
                Console.WriteLine($"Task 2 completion on thread: {completionThreadId}");
                Console.WriteLine($"Same thread for task 2? {taskThreadId == completionThreadId}");
                
                return completionThreadId;
            });
            
            // Ensure task2 has started but not completed
            await Task.Delay(100);
            
            // Third task
            Console.WriteLine("\nStarting Task 3");
            var task3 = Task.Run(async () => 
            {
                int taskThreadId = Thread.CurrentThread.ManagedThreadId;
                Console.WriteLine($"Task 3 started on thread: {taskThreadId}");
                
                var response = await _httpClient.GetAsync(_testUrl);
                
                int completionThreadId = Thread.CurrentThread.ManagedThreadId;
                Console.WriteLine($"Task 3 completion on thread: {completionThreadId}");
                Console.WriteLine($"Same thread for task 3? {taskThreadId == completionThreadId}");
                
                return completionThreadId;
            });
            
            // Wait for all tasks to complete and collect their completion thread IDs
            var completionThreadIds = await Task.WhenAll(task1, task2, task3);
            
            Console.WriteLine("\nResults Summary:");
            Console.WriteLine($"Main thread ID: {mainThreadId}");
            Console.WriteLine($"Task 1 completion thread ID: {completionThreadIds[0]}");
            Console.WriteLine($"Task 2 completion thread ID: {completionThreadIds[1]}");
            Console.WriteLine($"Task 3 completion thread ID: {completionThreadIds[2]}");
            
            // Check if all tasks completed on the same thread (which would indicate LIFO behavior)
            bool sameCompletionThread = completionThreadIds.Distinct().Count() == 1;
            Console.WriteLine($"All tasks completed on same thread? {sameCompletionThread}");
            
            // Check if completions ran on a different thread than main
            bool differentFromMain = !completionThreadIds.Contains(mainThreadId);
            Console.WriteLine($"Completions on different thread than main? {differentFromMain}");
            
            Console.WriteLine("\nTest complete.");
        }
        
        /// <summary>
        /// Advanced test that creates thousands of tasks and tracks which threads handle completions
        /// </summary>
        static async Task RunThreadHistogramTest()
        {
            int taskCount = 5000;
            Console.WriteLine($"Running Thread Histogram Test with {taskCount} Tasks...\n");
            
            int mainThreadId = Thread.CurrentThread.ManagedThreadId;
            Console.WriteLine($"Main thread: {mainThreadId}");
            
            // Clear the dictionary for thread counts
            _threadIdCompletionCount.Clear();
            
            // Create a list to hold all tasks
            var tasks = new List<Task<(int initialThreadId, int completionThreadId)>>(taskCount);
            
            // Create a Stopwatch to measure overall execution time
            var stopwatch = Stopwatch.StartNew();
            
            // Launch tasks in batches to avoid overwhelming the system
            for (int i = 0; i < taskCount; i++)
            {
                var task = Task.Run(async () => 
                {
                    // Record the thread ID that runs this task initially
                    int initialThreadId = Thread.CurrentThread.ManagedThreadId;
                    
                    // Make the HTTP request
                    var response = await _httpClient.GetAsync(_testUrl);
                    
                    // Record the thread ID where the continuation runs after the await
                    int completionThreadId = Thread.CurrentThread.ManagedThreadId;
                    
                    // Increment the count for this thread ID in our dictionary
                    _threadIdCompletionCount.AddOrUpdate(
                        completionThreadId,
                        1,  // If the key doesn't exist, add it with count 1
                        (key, oldValue) => oldValue + 1  // If the key exists, increment its count
                    );
                    
                    return (initialThreadId, completionThreadId);
                });
                
                tasks.Add(task);
                
                // Add a small delay every 100 tasks to prevent overwhelming the system
                if (i % 100 == 0 && i > 0)
                {
                    await Task.Delay(10);
                }
            }
            
            // Wait for all tasks to complete
            await Task.WhenAll(tasks);
            
            // Stop the timer
            stopwatch.Stop();
            
            Console.WriteLine($"All {taskCount} tasks completed in {stopwatch.ElapsedMilliseconds} ms");
            
            // Count how many tasks completed on the same thread they started on
            int sameThreadCount = tasks.Count(t => t.Result.initialThreadId == t.Result.completionThreadId);
            double sameThreadPercentage = (double)sameThreadCount / taskCount * 100;
            
            Console.WriteLine($"Tasks completed on same thread they started on: {sameThreadCount} ({sameThreadPercentage:F2}%)");
            
            // Generate a histogram of completion thread IDs
            Console.WriteLine("\nCompletion Thread ID Histogram (Top 20):");
            var sortedThreads = _threadIdCompletionCount
                .OrderByDescending(pair => pair.Value)
                .Take(20)
                .ToList();
            
            foreach (var pair in sortedThreads)
            {
                double percentage = (double)pair.Value / taskCount * 100;
                Console.WriteLine($"Thread ID {pair.Key}: {pair.Value} completions ({percentage:F2}%)");
            }
            
            // Calculate standard deviation to measure distribution evenness
            double mean = taskCount / (double)_threadIdCompletionCount.Count;
            double sumOfSquaredDifferences = _threadIdCompletionCount.Values.Sum(count => Math.Pow(count - mean, 2));
            double standardDeviation = Math.Sqrt(sumOfSquaredDifferences / _threadIdCompletionCount.Count);
            
            Console.WriteLine($"\nThread Count Statistics:");
            Console.WriteLine($"Total threads used: {_threadIdCompletionCount.Count}");
            Console.WriteLine($"Average completions per thread: {mean:F2}");
            Console.WriteLine($"Standard deviation: {standardDeviation:F2}");
            Console.WriteLine($"Coefficient of variation: {(standardDeviation / mean):F2}");
            
            // A higher coefficient of variation indicates more uneven distribution (potentially more LIFO behavior)
            string interpretation = standardDeviation / mean > 0.5 ? 
                "Uneven distribution suggests LIFO behavior" : 
                "Even distribution suggests round-robin or random assignment";
            
            Console.WriteLine($"Interpretation: {interpretation}");
            
            Console.WriteLine("\nTest complete.");
        }
        
        /// <summary>
        /// Serial histogram test that runs requests one after another and tracks thread behavior
        /// This helps observe LIFO behavior more clearly in a controlled sequential environment
        /// </summary>
        static async Task RunSerialHistogramTest()
        {
            int requestCount = 1000; // Fewer requests since we're running them serially
            Console.WriteLine($"Running Serial Histogram Test with {requestCount} Sequential Requests...\n");
            
            int mainThreadId = Thread.CurrentThread.ManagedThreadId;
            Console.WriteLine($"Main thread: {mainThreadId}");
            
            // Clear the dictionary for thread counts
            _threadIdCompletionCount.Clear();
            
            // Create arrays to track thread IDs across requests
            var initialThreadIds = new int[requestCount];
            var completionThreadIds = new int[requestCount];
            
            // Create a Stopwatch to measure overall execution time
            var stopwatch = Stopwatch.StartNew();
            
            // Run requests serially one after another
            for (int i = 0; i < requestCount; i++)
            {
                // Record the initial thread ID (should always be main thread)
                initialThreadIds[i] = Thread.CurrentThread.ManagedThreadId;
                
                // Make the HTTP request
                var response = await _httpClient.GetAsync(_testUrl);
                
                // Record the completion thread ID
                completionThreadIds[i] = Thread.CurrentThread.ManagedThreadId;
                
                // Increment the count for this thread ID in our dictionary
                _threadIdCompletionCount.AddOrUpdate(
                    completionThreadIds[i],
                    1,  // If the key doesn't exist, add it with count 1
                    (key, oldValue) => oldValue + 1  // If the key exists, increment its count
                );
                
                // Print progress every 100 requests
                if (i % 100 == 0 && i > 0)
                {
                    Console.WriteLine($"Completed {i} requests...");
                }
            }
            
            // Stop the timer
            stopwatch.Stop();
            
            Console.WriteLine($"All {requestCount} serial requests completed in {stopwatch.ElapsedMilliseconds} ms");
            
            // Count how many completions ran on the main thread
            int mainThreadCompletions = completionThreadIds.Count(id => id == mainThreadId);
            double mainThreadPercentage = (double)mainThreadCompletions / requestCount * 100;
            
            Console.WriteLine($"Completions on main thread: {mainThreadCompletions} ({mainThreadPercentage:F2}%)");
            
            // Find the most frequently used completion thread
            var mostUsedThread = _threadIdCompletionCount.OrderByDescending(pair => pair.Value).First();
            double mostUsedPercentage = (double)mostUsedThread.Value / requestCount * 100;
            
            Console.WriteLine($"Most used thread: ID {mostUsedThread.Key} with {mostUsedThread.Value} completions ({mostUsedPercentage:F2}%)");
            
            // Generate a histogram of completion thread IDs
            Console.WriteLine("\nCompletion Thread ID Histogram:");
            var sortedThreads = _threadIdCompletionCount
                .OrderByDescending(pair => pair.Value)
                .ToList();
            
            foreach (var pair in sortedThreads)
            {
                double percentage = (double)pair.Value / requestCount * 100;
                Console.WriteLine($"Thread ID {pair.Key}: {pair.Value} completions ({percentage:F2}%)");
            }
            
            // Analyze thread switching patterns
            int consecutiveSameThread = 0;
            
            for (int i = 1; i < requestCount; i++)
            {
                if (completionThreadIds[i] == completionThreadIds[i - 1])
                {
                    consecutiveSameThread++;
                }
            }
            
            double consecutivePercentage = (double)consecutiveSameThread / (requestCount - 1) * 100;
            Console.WriteLine($"\nConsecutive completions on same thread: {consecutiveSameThread} ({consecutivePercentage:F2}%)");
            
            // Analyze LIFO vs FIFO behavior
            Console.WriteLine("\nLIFO vs FIFO Analysis:");
            
            // In a true LIFO (Last In, First Out) system, most completions should run on the same thread
            // In a FIFO (First In, First Out) or round-robin system, completions should be distributed more evenly
            
            // Calculate thread concentration ratio (higher = more LIFO-like)
            double concentration = (double)mostUsedThread.Value / requestCount;
            string behaviorType = concentration > 0.7 ? "Strong LIFO behavior" :
                                concentration > 0.4 ? "Moderate LIFO behavior" :
                                concentration > 0.2 ? "Weak LIFO behavior" :
                                "FIFO or round-robin behavior";
            
            Console.WriteLine($"Thread concentration ratio: {concentration:F2}");
            Console.WriteLine($"Interpretation: {behaviorType}");
            
            // Check for patterns in the first 20 completions
            Console.WriteLine("\nFirst 20 completions thread IDs:");
            for (int i = 0; i < Math.Min(20, requestCount); i++)
            {
                Console.WriteLine($"Request {i+1}: Thread {completionThreadIds[i]}");
            }
            
            Console.WriteLine("\nTest complete.");
        }
    }
}
