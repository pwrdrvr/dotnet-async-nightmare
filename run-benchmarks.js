#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Configuration for benchmarks
const BENCHMARK_DURATION = '30s'; // Duration for each benchmark
const CONCURRENCY = 20; // Number of concurrent connections
const SERVER_URL = 'http://localhost:5001/user/1234';
const DATA_FILE = path.join(__dirname, 'benchmark-data.json');

// Define the different configurations to test
const configurations = [
  {
    name: 'Base Case',
    description: 'Default .NET worker threads, default semaphore spin, oha with 1 thread',
    env: {},
    ohaEnv: { 'TOKIO_WORKER_THREADS': '1' }
  },
  {
    name: 'No Spin',
    description: 'Default .NET worker threads, no semaphore spin, oha with 1 thread',
    env: { 'DOTNET_ThreadPool_UnfairSemaphoreSpinLimit': '0' },
    ohaEnv: { 'TOKIO_WORKER_THREADS': '1' }
  },
  {
    name: 'Spin 10',
    description: 'Default .NET worker threads, semaphore spin 10, oha with 1 thread',
    env: { 'DOTNET_ThreadPool_UnfairSemaphoreSpinLimit': '10' },
    ohaEnv: { 'TOKIO_WORKER_THREADS': '1' }
  },
  {
    name: '1 .NET Thread, oha 1',
    description: '1 .NET worker threads, no semaphore spin, oha with 1 thread',
    env: { 
      'LAMBDA_DISPATCH_MaxWorkerThreads': '1',
      'DOTNET_ThreadPool_UnfairSemaphoreSpinLimit': '0'
    },
    ohaEnv: { 'TOKIO_WORKER_THREADS': '1' }
  },
  {
    name: '1 .NET Threads, oha 2',
    description: '1 .NET worker threads, no semaphore spin, oha with 2 threads',
    env: { 
      'LAMBDA_DISPATCH_MaxWorkerThreads': '1',
      'DOTNET_ThreadPool_UnfairSemaphoreSpinLimit': '0'
    },
    ohaEnv: { 'TOKIO_WORKER_THREADS': '2' }
  },
  {
    name: '2 .NET Threads - oha 2',
    description: '2 .NET worker threads, no semaphore spin, oha with 2 threads',
    env: { 
      'LAMBDA_DISPATCH_MaxWorkerThreads': '2',
      'DOTNET_ThreadPool_UnfairSemaphoreSpinLimit': '0'
    },
    ohaEnv: { 'TOKIO_WORKER_THREADS': '2' }
  }
];

// Function to run a single benchmark
async function runBenchmark(config) {
  console.log(`\n🏃 Running benchmark: ${config.name}`);
  console.log(`   ${config.description}`);
  
  // Prepare environment variables for dotnet (proper object format)
  const dotnetEnv = {
    ...process.env, // Include current environment
    ...config.env   // Add our specific variables
  };
  
  // Prepare environment variables for oha
  const ohaEnvString = Object.entries(config.ohaEnv)
    .map(([key, value]) => `${key}=${value}`)
    .join(' ');
  
  // Start the application
  console.log('   Starting application...');
  
  // Create a log file for the server output
  const logFile = fs.openSync(`server-${config.name.replace(/\s+/g, '-').toLowerCase()}.log`, 'w');
  
  let dotnetProcess;
  try {
    // Kill any existing processes that might be using the port
    try {
      execSync(`lsof -i:5001 -t | xargs kill -9`, { stdio: 'ignore' });
    } catch (e) {
      // Ignore errors - no processes may be using the port
    }
    
    // Wait a bit to ensure port is released
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Start the server directly with environment variables in the env option
    dotnetProcess = require('child_process').spawn(
      './src/web/bin/Release/net8.0/web',
      [], // No arguments needed
      { 
        stdio: ['ignore', logFile, logFile],
        detached: true,
        shell: false, // Don't use shell
        env: dotnetEnv // Pass environment variables properly
      }
    );
    
    // Store the process ID for later termination
    const pid = dotnetProcess.pid;
    console.log(`   Server started with PID: ${pid}`);
    
    // Wait for server to start
    console.log('   Waiting for server to start...');
    await new Promise(resolve => setTimeout(resolve, 2000));
    
  } catch (error) {
    console.error('   Failed to start server:', error);
    fs.closeSync(logFile);
    return null;
  }
  
  // Test if the server is running
  try {
    execSync(`curl -s ${SERVER_URL} > /dev/null`);
    console.log('   Server is running. Starting benchmark...');
  } catch (error) {
    console.error('   Server failed to start. Skipping benchmark.');
    if (dotnetProcess && !dotnetProcess.killed) {
      process.kill(-dotnetProcess.pid);
    }
    return null;
  }
  
  // Run oha benchmark
  let results;
  try {
    // Get the server PID for CPU monitoring
    const serverPid = dotnetProcess.pid;
    console.log(`   Starting CPU monitoring for PID: ${serverPid}`);
    
    // Function to sample CPU usage during the benchmark - includes all subprocesses
    const cpuSamples = [];
    const sampleCpu = () => {
      try {
        // Use ps command to get CPU usage of the entire process tree
        // This includes the server process and any child processes it spawns
        const cpuInfo = execSync(`ps -p ${serverPid} -o %cpu | tail -1`, { encoding: 'utf-8' }).trim();
        
        // Also check for child processes (if this fails, we still have the main process measurement)
        try {
          const childrenInfo = execSync(`pgrep -P ${serverPid} | xargs ps -o %cpu | grep -v CPU | awk '{sum+=$1} END {print sum}'`, { encoding: 'utf-8' }).trim();
          const childrenCpu = parseFloat(childrenInfo) || 0;
          const mainCpu = parseFloat(cpuInfo) || 0;
          const totalCpu = mainCpu + childrenCpu;
          
          if (!isNaN(totalCpu)) {
            cpuSamples.push(totalCpu);
            return totalCpu;
          }
        } catch (childErr) {
          // If measuring children fails, fall back to just the main process
          const cpuValue = parseFloat(cpuInfo);
          if (!isNaN(cpuValue)) {
            cpuSamples.push(cpuValue);
            return cpuValue;
          }
        }
      } catch (e) {
        // Process might have died or another error
        console.log(`   CPU sampling error: ${e.message}`);
        return null;
      }
      return null;
    };
    
    // Take initial CPU sample before benchmark starts
    console.log(`   Taking initial CPU sample...`);
    sampleCpu();
    
    // Run the benchmark using spawn while sampling CPU periodically
    console.log(`   Running: oha --no-tui -c ${CONCURRENCY} -z ${BENCHMARK_DURATION} --json ${SERVER_URL}`);
    
    // Start a CPU sampling interval
    const samplingInterval = setInterval(sampleCpu, 1000); // Sample every second
    
    // Prepare oha environment variables as an object
    const ohaEnv = {};
    Object.entries(config.ohaEnv).forEach(([key, value]) => {
      ohaEnv[key] = value;
    });
    
    // Use spawn instead of execSync to allow sampling to continue during benchmark
    const stdout = await new Promise((resolve, reject) => {
      try {
        // Prepare oha command and arguments
        const ohaArgs = [
          '--no-tui',
          '-c', CONCURRENCY.toString(),
          '-z', BENCHMARK_DURATION,
          '--json', 
          SERVER_URL
        ];
        
        let outputData = '';
        
        // Spawn oha process
        const proc = require('child_process').spawn(
          'oha', 
          ohaArgs,
          {
            env: { ...process.env, ...ohaEnv },
            stdio: ['ignore', 'pipe', 'pipe']
          }
        );
        
        // Collect stdout
        proc.stdout.on('data', (data) => {
          outputData += data.toString();
        });
        
        // Collect stderr for debugging
        proc.stderr.on('data', (data) => {
          console.log(`   oha stderr: ${data.toString().trim()}`);
        });
        
        // Resolve promise when oha completes
        proc.on('close', (code) => {
          if (code === 0) {
            resolve(outputData);
          } else {
            reject(new Error(`oha exited with code ${code}`));
          }
        });
        
        // Handle errors
        proc.on('error', (err) => {
          reject(err);
        });
      } catch (err) {
        reject(err);
      }
    });
    
    // Stop the CPU sampling after oha completes
    clearInterval(samplingInterval);
    
    // Take one final sample
    sampleCpu();
    
    // Calculate average CPU usage, ignoring first and last samples which might be outliers
    let measuredCpuPercent = null;
    let minCpu = Infinity;
    let maxCpu = -Infinity;
    
    if (cpuSamples.length > 2) {
      // Remove first and last samples for the average (they're outliers)
      const middleSamples = cpuSamples.slice(1, -1);
      const sum = middleSamples.reduce((total, val) => total + val, 0);
      measuredCpuPercent = sum / middleSamples.length;

      // Calculate statistics
      const allCpuValues = [...middleSamples]; // Copy all samples
      allCpuValues.forEach(sample => {
        minCpu = Math.min(minCpu, sample);
        maxCpu = Math.max(maxCpu, sample);
      });
      
      console.log(`   CPU sampling statistics:`);
      console.log(`   - Samples taken: ${cpuSamples.length}`);
      console.log(`   - Sample values: ${cpuSamples.map(s => s.toFixed(1)).join('%, ')}%`);
      console.log(`   - Min CPU: ${minCpu.toFixed(1)}%, Max CPU: ${maxCpu.toFixed(1)}%`);
      console.log(`   - Average CPU: ${measuredCpuPercent.toFixed(1)}% (excluding first/last samples)`);
    } else if (cpuSamples.length > 0) {
      // If we don't have enough samples, use what we have
      cpuSamples.forEach(sample => {
        minCpu = Math.min(minCpu, sample);
        maxCpu = Math.max(maxCpu, sample);
      });
      
      const sum = cpuSamples.reduce((total, val) => total + val, 0);
      measuredCpuPercent = sum / cpuSamples.length;
      
      console.log(`   Limited CPU samples collected: ${cpuSamples.length}`);
      console.log(`   - Sample values: ${cpuSamples.map(s => s.toFixed(1)).join('%, ')}%`);
      console.log(`   - Min CPU: ${minCpu.toFixed(1)}%, Max CPU: ${maxCpu.toFixed(1)}%`);
      console.log(`   - Average CPU: ${measuredCpuPercent.toFixed(1)}%`);
    } else {
      console.log(`   No valid CPU samples collected - falling back to estimates`);
    }
    
    // Try to parse the JSON output
    try {
      results = JSON.parse(stdout);
    } catch (parseError) {
      console.error('   Error parsing benchmark results:', parseError.message);
      console.log('   Raw output:', stdout.substring(0, 200) + '...');
      
      // Create fallback results with estimated values
      results = {
        summary: {
          requestsPerSec: 0
        }
      };
    }
    
    // Use either measured or estimated CPU usage
    const cpuCores = os.cpus().length;
    let cpuUsage;
    
    if (measuredCpuPercent !== null && !isNaN(measuredCpuPercent)) {
      // Use real measured value from benchmark
      cpuUsage = measuredCpuPercent;
      console.log(`   Using measured CPU: ${cpuUsage.toFixed(1)}%`);
    } else {
      // Fall back to estimates if measurement failed
      console.log(`   Measurement failed, using estimates instead`);
      if (config.name === 'Base Case') {
        cpuUsage = 650; // ~650% CPU
      } else if (config.name === 'No Semaphore Spin') {
        cpuUsage = 300; // ~300% CPU
      } else if (config.name === 'Single Worker Thread') {
        cpuUsage = 120; // ~120% CPU
      } else if (config.name === 'No Spin + Tokio 2 Threads') {
        cpuUsage = 330; // ~330% CPU
      } else {
        // Default estimate for other configurations
        cpuUsage = 300; 
      }
    }
    
    // Calculate RPS per CPU core
    const rpsPerCore = Math.round(results.summary.requestsPerSec / (cpuUsage / 100));
    
    // Add the data to results
    results.cpuUsage = cpuUsage;
    results.rpsPerCore = rpsPerCore;
    results.config = config;
    
    // Add CPU measurement metadata if available
    if (cpuSamples.length > 0) {
      results.cpuMeasurement = {
        samples: cpuSamples.length,
        min: minCpu,
        max: maxCpu,
        average: measuredCpuPercent,
        measured: true
      };
    } else {
      results.cpuMeasurement = {
        measured: false
      };
    }
    
    console.log(`   Completed benchmark: ${results.summary.requestsPerSec.toFixed(2)} req/sec`);
    console.log(`   CPU usage: ${cpuUsage.toFixed(1)}%, RPS/Core: ${rpsPerCore.toLocaleString()}`);
    
  } catch (error) {
    console.error('   Benchmark failed:', error.message);
    results = null;
  } finally {
    // Close the log file
    try {
      if (logFile) {
        fs.closeSync(logFile);
      }
    } catch (e) {
      // Ignore log file close errors
    }
    
    // Terminate the server more reliably
    console.log('   Terminating server...');
    
    // Try multiple termination methods in sequence to ensure cleanup
    // Method 1: Kill by PID if we have one
    if (dotnetProcess && dotnetProcess.pid) {
      try {
        process.kill(dotnetProcess.pid, 'SIGTERM');
        console.log(`   Sent SIGTERM to PID ${dotnetProcess.pid}`);
      } catch (e) {
        console.log(`   Could not terminate PID ${dotnetProcess.pid}, trying alternative methods`);
      }
    }
    
    // Method 2: Use lsof to find and kill any process on port 5001
    try {
      const output = execSync('lsof -i:5001 -t', { encoding: 'utf8' });
      if (output.trim()) {
        console.log(`   Found processes on port 5001: ${output.trim()}`);
        execSync(`lsof -i:5001 -t | xargs kill -9`);
        console.log('   Killed processes using port 5001');
      }
    } catch (e) {
      // No processes may be using the port - that's fine
    }
    
    // Method 3: Use pkill as a last resort
    try {
      execSync(`pkill -f "src/web/bin/Release/net8\\.0/web$"`, { stdio: 'ignore' });
    } catch (e) {
      // Process may not exist - that's fine
    }
    
    console.log('   Cleanup complete, waiting before next test...');
  }
  
  // Increase wait time between benchmarks to ensure complete cleanup
  console.log('   Pausing for 1 seconds before next benchmark...');
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  return results;
}

// Function to collect system information
async function collectSystemInfo() {
  const systemInfo = {
    timestamp: new Date().toISOString(),
    date: new Date().toLocaleDateString(),
    time: new Date().toLocaleTimeString(),
    os: os.type() + ' ' + os.release(),
    hostname: os.hostname(),
    platform: os.platform(),
    cpuModel: '',
    cpuCores: os.cpus().length,
    cpuLogical: os.cpus().length,
    totalMemoryGB: (os.totalmem() / (1024 * 1024 * 1024)).toFixed(2),
    freeMemoryGB: (os.freemem() / (1024 * 1024 * 1024)).toFixed(2),
    nodeVersion: process.version,
    dotnetVersion: '',
    ohaVersion: ''
  };
  
  // Get CPU model from first core
  if (os.cpus().length > 0) {
    systemInfo.cpuModel = os.cpus()[0].model.trim();
  }
  
  // Try to get more detailed OS info
  try {
    if (os.platform() === 'darwin') {
      // macOS - get version
      const macosVersion = execSync('sw_vers -productVersion', { encoding: 'utf8' }).trim();
      systemInfo.os = `macOS ${macosVersion}`;
    } else if (os.platform() === 'linux') {
      // Linux - try to get distribution info
      try {
        const osRelease = execSync('cat /etc/os-release', { encoding: 'utf8' });
        const prettyName = osRelease.match(/PRETTY_NAME="(.+?)"/);
        if (prettyName && prettyName[1]) {
          systemInfo.os = prettyName[1];
        }
      } catch (e) {
        // Fallback to basic info if /etc/os-release is not available
      }
    } else if (os.platform() === 'win32') {
      // Windows - get version info
      try {
        const winVer = execSync('ver', { encoding: 'utf8' }).trim();
        systemInfo.os = winVer;
      } catch (e) {
        // Fallback to basic Windows info
      }
    }
  } catch (e) {
    // Fallback to basic OS info if any command fails
  }
  
  // Try to get .NET version
  try {
    const dotnetVersionOutput = execSync('dotnet --version', { encoding: 'utf8' }).trim();
    systemInfo.dotnetVersion = dotnetVersionOutput;
    
    // Try to get .NET runtime version for more details
    try {
      const dotnetInfo = execSync('dotnet --info', { encoding: 'utf8' });
      const runtimeMatch = dotnetInfo.match(/Runtime Environment:[^\n]*\n\s*(.+)/);
      if (runtimeMatch && runtimeMatch[1]) {
        systemInfo.dotnetRuntimeVersion = runtimeMatch[1].trim();
      }
    } catch (e) {
      // Use basic version if --info fails
    }
  } catch (e) {
    systemInfo.dotnetVersion = 'Unknown';
  }
  
  // Try to get oha version
  try {
    const ohaVersionOutput = execSync('oha --version', { encoding: 'utf8' }).trim();
    systemInfo.ohaVersion = ohaVersionOutput;
  } catch (e) {
    systemInfo.ohaVersion = 'Unknown';
  }
  
  return systemInfo;
}

// Main function to run all benchmarks
async function runAllBenchmarks() {
  console.log('📊 Starting .NET Async Nightmare Benchmarks');
  console.log('===========================================');
  
  // Collect system information
  console.log('Collecting system information...');
  const systemInfo = await collectSystemInfo();
  console.log(`OS: ${systemInfo.os}`);
  console.log(`CPU: ${systemInfo.cpuModel} (${systemInfo.cpuCores} cores)`);
  console.log(`Memory: ${systemInfo.freeMemoryGB}GB free / ${systemInfo.totalMemoryGB}GB total`);
  console.log(`Dotnet: ${systemInfo.dotnetVersion}`);
  console.log(`Node: ${process.version}`);
  console.log(`Date: ${systemInfo.date} ${systemInfo.time}`);
  console.log('===========================================');
  
  // Check if oha is installed
  try {
    execSync('which oha > /dev/null');
  } catch (error) {
    console.error('Error: oha benchmark tool is not installed. Please install it first.');
    console.error('You can install it with: cargo install oha');
    process.exit(1);
  }
  
  // Check if the application is built
  if (!fs.existsSync('./src/web/bin/Release/net8.0/web')) {
    console.log('Building application...');
    try {
      execSync('cd src/web && dotnet build -c Release', { stdio: 'inherit' });
    } catch (error) {
      console.error('Failed to build the application. Please build it manually.');
      process.exit(1);
    }
  }
  
  // Run each benchmark configuration
  const results = [];
  for (const config of configurations) {
    const result = await runBenchmark(config);
    if (result) {
      results.push(result);
    }
  }
  
  // Save results to file only if we have valid data
  if (results.length === 0) {
    console.error('\n❌ All benchmarks failed. No data to save.');
    process.exit(1);
  }
  
  // Log a summary of completed benchmarks
  console.log('\n--- Benchmark Summary ---');
  results.forEach(result => {
    console.log(`${result.config.name}: ${Math.round(result.summary.requestsPerSec).toLocaleString()} req/sec, ${Math.round(result.cpuUsage)}% CPU, ${result.rpsPerCore.toLocaleString()} req/sec/core`);
  });
  
  // Check for missing benchmark configurations
  if (results.length < configurations.length) {
    console.log(`\n⚠️  Note: ${configurations.length - results.length} benchmarks failed to complete.`);
    console.log('   Check server log files for details on failures.');
  }
  
  // Add system info to the benchmark data
  const completeResults = {
    systemInfo,
    benchmarks: results
  };
  
  // Save results to file
  fs.writeFileSync(DATA_FILE, JSON.stringify(completeResults, null, 2));
  console.log(`\n✅ Benchmarks complete. Results saved to ${DATA_FILE}`);
  
  // If we have at least one valid result, proceed
  return results.length > 0;
}

// Run the benchmarks
runAllBenchmarks().catch(console.error);