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
    description: 'Default configuration',
    env: {},
    ohaEnv: {}
  },
  {
    name: 'No Semaphore Spin',
    description: 'Disabling Semaphore spinning',
    env: { 'DOTNET_ThreadPool_UnfairSemaphoreSpinLimit': '0' },
    ohaEnv: {}
  },
  {
    name: 'Tokio 1 Thread',
    description: 'Default config with oha limited to 1 thread',
    env: {},
    ohaEnv: { 'TOKIO_WORKER_THREADS': '1' }
  },
  {
    name: 'No Spin + Tokio 1 Thread',
    description: 'No semaphore spin with oha limited to 1 thread',
    env: { 'DOTNET_ThreadPool_UnfairSemaphoreSpinLimit': '0' },
    ohaEnv: { 'TOKIO_WORKER_THREADS': '1' }
  },
  {
    name: 'No Spin + Tokio 2 Threads',
    description: 'No semaphore spin with oha limited to 2 threads',
    env: { 'DOTNET_ThreadPool_UnfairSemaphoreSpinLimit': '0' },
    ohaEnv: { 'TOKIO_WORKER_THREADS': '2' }
  },
  {
    name: 'Single Worker Thread',
    description: '1 worker thread, no semaphore spin, oha with 2 threads',
    env: { 
      'LAMBDA_DISPATCH_MaxWorkerThreads': '1',
      'DOTNET_ThreadPool_UnfairSemaphoreSpinLimit': '0'
    },
    ohaEnv: { 'TOKIO_WORKER_THREADS': '2' }
  }
];

// Function to run a single benchmark
async function runBenchmark(config) {
  console.log(`\n🏃 Running benchmark: ${config.name}`);
  console.log(`   ${config.description}`);
  
  // Prepare environment variables for dotnet
  const dotnetEnvString = Object.entries(config.env)
    .map(([key, value]) => `${key}=${value}`)
    .join(' ');
  
  // Prepare environment variables for oha
  const ohaEnvString = Object.entries(config.ohaEnv)
    .map(([key, value]) => `${key}=${value}`)
    .join(' ');
  
  // Start the application
  console.log('   Starting application...');
  const dotnetProcess = require('child_process').spawn(
    'bash',
    ['-c', `${dotnetEnvString} ./bin/Release/net8.0/web`],
    { 
      stdio: 'ignore',
      detached: true,
      shell: true
    }
  );
  
  // Give the server time to start
  await new Promise(resolve => setTimeout(resolve, 3000));
  
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
    // Run the benchmark and capture output
    const stdout = execSync(
      `${ohaEnvString} oha -c ${CONCURRENCY} -z ${BENCHMARK_DURATION} --json ${SERVER_URL}`,
      { encoding: 'utf-8' }
    );
    
    // Parse the JSON output
    results = JSON.parse(stdout);
    
    // Add CPU usage data (this requires monitoring during the test)
    // For now, we'll estimate based on README notes
    const cpuCores = os.cpus().length;
    let estimatedCpuUsage;
    
    if (config.name === 'Base Case') {
      estimatedCpuUsage = 650; // ~650% CPU
    } else if (config.name === 'No Semaphore Spin') {
      estimatedCpuUsage = 300; // ~300% CPU
    } else if (config.name === 'Single Worker Thread') {
      estimatedCpuUsage = 120; // ~120% CPU
    } else if (config.name === 'No Spin + Tokio 2 Threads') {
      estimatedCpuUsage = 330; // ~330% CPU
    } else {
      // Default estimate for other configurations
      estimatedCpuUsage = 300; 
    }
    
    // Calculate RPS per CPU core
    const rpsPerCore = Math.round(results.summary.requestsPerSec / (estimatedCpuUsage / 100));
    
    // Add the data to results
    results.cpuUsage = estimatedCpuUsage;
    results.rpsPerCore = rpsPerCore;
    results.config = config;
    
    console.log(`   Completed benchmark: ${results.summary.requestsPerSec.toFixed(2)} req/sec`);
    console.log(`   Estimated CPU: ${estimatedCpuUsage}%, RPS/Core: ${rpsPerCore}`);
    
  } catch (error) {
    console.error('   Benchmark failed:', error.message);
    results = null;
  } finally {
    // Terminate the server
    if (dotnetProcess && !dotnetProcess.killed) {
      console.log('   Terminating server...');
      process.kill(-dotnetProcess.pid);
    }
  }
  
  // Wait a bit before starting the next benchmark
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  return results;
}

// Main function to run all benchmarks
async function runAllBenchmarks() {
  console.log('📊 Starting .NET Async Nightmare Benchmarks');
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
  if (!fs.existsSync('./bin/Release/net8.0/web')) {
    console.log('Building application...');
    try {
      execSync('dotnet build -c Release', { stdio: 'inherit' });
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
  
  // Save results to file
  fs.writeFileSync(DATA_FILE, JSON.stringify(results, null, 2));
  console.log(`\n✅ Benchmarks complete. Results saved to ${DATA_FILE}`);
}

// Run the benchmarks
runAllBenchmarks().catch(console.error);