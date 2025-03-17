#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Run a small test of the benchmark system
async function runTestBenchmark() {
  console.log('Running a small test benchmark to verify version information collection...');
  
  // Make sure the server is built
  try {
    console.log('Building the application...');
    execSync('cd src/web && dotnet build -c Release', { stdio: 'inherit' });
  } catch (error) {
    console.error('Failed to build the application:', error.message);
    process.exit(1);
  }
  
  // Run a trimmed-down benchmark (just one configuration)
  try {
    console.log('\nRunning a simplified benchmark test...');
    
    // Create a temporary benchmark-test.js file with just one configuration to test
    const testBenchmarkCode = `
      const { execSync, spawn } = require('child_process');
      const fs = require('fs');
      const path = require('path');
      const os = require('os');
      
      // Configuration for test benchmark
      const BENCHMARK_DURATION = '5s'; // Short duration for test
      const CONCURRENCY = 10;
      const SERVER_URL = 'http://localhost:5001/user/1234';
      const DATA_FILE = path.join(__dirname, 'test-benchmark-data.json');
      
      // Just one test configuration
      const configurations = [
        {
          name: 'Test Configuration',
          description: 'Default .NET worker threads for testing',
          env: {},
          ohaEnv: { 'TOKIO_WORKER_THREADS': '1' }
        }
      ];
      
      // Simplified benchmark runner from run-benchmarks.js
      async function runBenchmark(config, systemInfo) {
        console.log(\`Running test benchmark: \${config.name}\`);
        
        // Start the application with the specific environment variables
        console.log('Starting application...');
        
        // Prepare environment variables
        const dotnetEnv = {
          ...process.env,
          ...config.env
        };
        
        // Start the server
        let dotnetProcess;
        let logFile;
        
        try {
          // Kill any existing processes using port 5001
          try {
            execSync('lsof -i:5001 -t | xargs kill -9', { stdio: 'ignore' });
          } catch (e) {
            // Ignore errors - no processes may be using the port
          }
          
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          // Create log file
          logFile = fs.openSync('test-server.log', 'w');
          
          // Start server
          dotnetProcess = spawn(
            './src/web/bin/Release/net8.0/web',
            [],
            {
              stdio: ['ignore', logFile, logFile],
              detached: true,
              shell: false,
              env: dotnetEnv
            }
          );
          
          console.log(\`Server started with PID: \${dotnetProcess.pid}\`);
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          // Check if server is running
          try {
            execSync('curl -s http://localhost:5001/user/1234 > /dev/null');
            console.log('Server is running');
            
            // Try to get .NET version information via API endpoint
            try {
              console.log('Attempting to get .NET version information via API...');
              const apiVersionData = execSync('curl -s http://localhost:5001/version', { encoding: 'utf8' });
              const versionInfo = JSON.parse(apiVersionData);
              
              console.log('Version info from API:', versionInfo);
              
              // Update system info with API data
              if (versionInfo.runtimeVersion) {
                systemInfo.dotnetRuntimeVersion = versionInfo.runtimeVersion;
              }
              
              if (versionInfo.frameworkDescription) {
                systemInfo.dotnetVersion = versionInfo.frameworkDescription;
              }
              
              if (versionInfo.osDescription) {
                systemInfo.dotnetOS = versionInfo.osDescription;
              }
              
              if (versionInfo.processArchitecture) {
                systemInfo.dotnetArchitecture = versionInfo.processArchitecture;
              }
              
              console.log('Successfully retrieved version information from API');
            } catch (apiError) {
              console.log('Failed to get version information from API endpoint:', apiError.message);
            }
            
          } catch (error) {
            console.error('Server failed to start');
            throw error;
          }
          
          // Just create a placeholder result for testing
          const results = {
            summary: {
              requestsPerSec: 1000
            },
            cpuUsage: 50,
            rpsPerCore: 1000 / (50 / 100),
            config,
            cpuMeasurement: {
              samples: 5,
              min: 40,
              max: 60,
              average: 50,
              measured: true
            }
          };
          
          return results;
          
        } catch (error) {
          console.error('Benchmark error:', error.message);
          return null;
        } finally {
          // Close log file
          try {
            if (logFile) {
              fs.closeSync(logFile);
            }
          } catch (e) {
            // Ignore
          }
          
          // Terminate the server
          console.log('Terminating server...');
          
          // Method 1: Kill by PID
          if (dotnetProcess && dotnetProcess.pid) {
            try {
              process.kill(dotnetProcess.pid, 'SIGTERM');
              console.log(\`Sent SIGTERM to PID \${dotnetProcess.pid}\`);
            } catch (e) {
              console.log(\`Could not terminate PID \${dotnetProcess.pid}\`);
            }
          }
          
          // Method 2: Kill any process on port 5001
          try {
            execSync('lsof -i:5001 -t | xargs kill -9', { stdio: 'ignore' });
          } catch (e) {
            // Ignore
          }
        }
      }
      
      // Function to collect system information - simplified version
      async function collectSystemInfo() {
        const systemInfo = {
          timestamp: new Date().toISOString(),
          date: new Date().toLocaleDateString(),
          time: new Date().toLocaleTimeString(),
          os: os.type() + ' ' + os.release(),
          hostname: os.hostname(),
          platform: os.platform(),
          cpuModel: os.cpus()[0]?.model.trim() || 'Unknown',
          cpuCores: os.cpus().length,
          totalMemoryGB: (os.totalmem() / (1024 * 1024 * 1024)).toFixed(2),
          freeMemoryGB: (os.freemem() / (1024 * 1024 * 1024)).toFixed(2),
          nodeVersion: process.version
        };
        
        // Try to get .NET version info from app directly
        try {
          console.log('Getting .NET version information from application...');
          const dotnetVersionOutput = execSync('./src/web/bin/Release/net8.0/web --version', { encoding: 'utf8' }).trim();
          
          const runtimeVersionMatch = dotnetVersionOutput.match(/Runtime Version: (.+)/);
          const frameworkMatch = dotnetVersionOutput.match(/Framework: (.+)/);
          
          if (runtimeVersionMatch && runtimeVersionMatch[1]) {
            systemInfo.dotnetRuntimeVersion = runtimeVersionMatch[1].trim();
          }
          
          if (frameworkMatch && frameworkMatch[1]) {
            systemInfo.dotnetVersion = frameworkMatch[1].trim();
          }
          
          const osMatch = dotnetVersionOutput.match(/OS: (.+)/);
          const archMatch = dotnetVersionOutput.match(/Architecture: (.+)/);
          
          if (osMatch && osMatch[1]) {
            systemInfo.dotnetOS = osMatch[1].trim();
          }
          
          if (archMatch && archMatch[1]) {
            systemInfo.dotnetArchitecture = archMatch[1].trim();
          }
          
        } catch (e) {
          console.log('Failed to get .NET version from application, will try API endpoint');
          
          // Fallback to basic dotnet version
          try {
            const dotnetVersion = execSync('dotnet --version', { encoding: 'utf8' }).trim();
            systemInfo.dotnetVersion = dotnetVersion;
          } catch (e) {
            systemInfo.dotnetVersion = 'Unknown';
          }
        }
        
        return systemInfo;
      }
      
      // Main function for test
      async function runTest() {
        console.log('Collecting system information...');
        const systemInfo = await collectSystemInfo();
        console.log('System info:', systemInfo);
        
        const results = [];
        const config = configurations[0];
        
        const result = await runBenchmark(config, systemInfo);
        if (result) {
          results.push(result);
        }
        
        if (results.length > 0) {
          // Save test results to file
          const completeResults = {
            systemInfo,
            benchmarks: results
          };
          
          fs.writeFileSync(DATA_FILE, JSON.stringify(completeResults, null, 2));
          console.log(\`Test benchmark complete. Results saved to \${DATA_FILE}\`);
          
          // Try generating charts from the test data
          try {
            console.log('\\nGenerating test charts...');
            execSync('node generate-charts.js', { stdio: 'inherit' });
          } catch (e) {
            console.error('Failed to generate charts:', e.message);
          }
          
          return true;
        }
        
        console.error('Test benchmark failed');
        return false;
      }
      
      // Run the test
      runTest().catch(console.error);
    `;
    
    fs.writeFileSync('test-benchmark.js', testBenchmarkCode);
    
    // Make the file executable
    fs.chmodSync('test-benchmark.js', '755');
    
    // Run the test benchmark
    execSync('node test-benchmark.js', { stdio: 'inherit' });
    
    console.log('\nTest completed successfully!');
    return true;
  } catch (error) {
    console.error('Test benchmark failed:', error.message);
    return false;
  } finally {
    // Clean up test files
    try {
      if (fs.existsSync('test-benchmark.js')) {
        fs.unlinkSync('test-benchmark.js');
      }
      if (fs.existsSync('test-server.log')) {
        fs.unlinkSync('test-server.log');
      }
    } catch (e) {
      // Ignore cleanup errors
    }
  }
}

// Run the test
runTestBenchmark().then(success => {
  process.exit(success ? 0 : 1);
});