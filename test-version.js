const http = require('http');
const { execSync } = require('child_process');
const { spawn } = require('child_process');

async function testVersionEndpoint() {
  console.log('Starting the server...');
  
  // Start the server process
  const server = spawn('./src/web/bin/Release/net8.0/web', [], {
    stdio: 'inherit',
    detached: true
  });
  
  // Wait for server to start
  console.log('Waiting for server to start...');
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Make HTTP request to the /version endpoint
  console.log('Making request to /version endpoint...');
  
  try {
    const data = await new Promise((resolve, reject) => {
      http.get('http://localhost:5001/version', (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          resolve(data);
        });
      }).on('error', (err) => {
        reject(err);
      });
    });
    
    console.log('Response from /version endpoint:');
    console.log(data);
  } catch (error) {
    console.error('Error making HTTP request:', error.message);
  } finally {
    // Kill the server process
    console.log('Terminating server...');
    
    try {
      // Try to kill by port
      execSync('lsof -i:5001 -t | xargs kill -15', { stdio: 'ignore' });
    } catch (e) {
      // Ignore error if no process found
    }
    
    process.exit(0);
  }
}

testVersionEndpoint().catch(console.error);