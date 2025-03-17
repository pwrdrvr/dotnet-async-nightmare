#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Paths for input/output files
const DATA_FILE = path.join(__dirname, 'benchmark-data.json');
const CHART_HTML_FILE = path.join(__dirname, 'charts.html');
const SCREENSHOT_DIR = path.join(__dirname, 'screenshots');

// Function to generate HTML with Chart.js visualizations
function generateChartsHtml(data) {
  // Sort data by RPS per core (descending)
  data.sort((a, b) => b.rpsPerCore - a.rpsPerCore);
  
  // Extract labels and data for charts
  const labels = data.map(item => item.config.name);
  const rpsData = data.map(item => item.summary.requestsPerSec);
  const cpuData = data.map(item => item.cpuUsage);
  const rpsPerCoreData = data.map(item => item.rpsPerCore);
  
  // Determine the best configuration (highest RPS per CPU core)
  const bestConfig = data.reduce((prev, current) => 
    (current.rpsPerCore > prev.rpsPerCore) ? current : prev
  );
  
  // Calculate improvement factor compared to base case
  const baseCase = data.find(item => item.config.name === 'Base Case');
  const improvementFactor = baseCase ? (bestConfig.rpsPerCore / baseCase.rpsPerCore).toFixed(1) : 'N/A';
  
  // Generate HTML with Chart.js
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>.NET Async Thread Pool Performance</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
      max-width: 1200px;
      margin: 0 auto;
      padding: 20px;
      color: #333;
    }
    h1, h2 {
      text-align: center;
      color: #0066cc;
    }
    .chart-container {
      position: relative;
      margin: 40px auto;
      height: 400px;
    }
    .highlight-box {
      background-color: #f0f8ff;
      border-left: 4px solid #0066cc;
      padding: 15px;
      margin: 30px 0;
      border-radius: 0 4px 4px 0;
    }
    .metric-card {
      background-color: #fff;
      border-radius: 8px;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
      padding: 20px;
      margin: 15px 0;
      text-align: center;
    }
    .metric-value {
      font-size: 36px;
      font-weight: bold;
      color: #0066cc;
      margin: 10px 0;
    }
    .metric-label {
      font-size: 14px;
      color: #666;
    }
    .metric-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 20px;
      margin: 30px 0;
    }
    .config-table {
      width: 100%;
      border-collapse: collapse;
      margin: 30px 0;
    }
    .config-table th, .config-table td {
      padding: 12px 15px;
      text-align: left;
      border-bottom: 1px solid #ddd;
    }
    .config-table th {
      background-color: #f5f5f5;
      font-weight: 600;
    }
    .config-table tr:hover {
      background-color: #f9f9f9;
    }
    .fire-emoji {
      font-size: 24px;
    }
  </style>
</head>
<body>
  <h1>.NET Async Thread Pool Performance</h1>
  <p>This dashboard visualizes the performance impact of different thread pool configurations in .NET 8.0. 
     The tests measure how various settings affect request throughput and CPU efficiency.</p>
  
  <div class="highlight-box">
    <h3>Key Finding: ${improvementFactor}x Improvement in Efficiency!</h3>
    <p>By limiting worker threads to 1 and disabling semaphore spinning, we achieved 
       <strong>${improvementFactor}x more requests per CPU core</strong> compared to the default configuration.</p>
  </div>
  
  <div class="metric-grid">
    <div class="metric-card">
      <div class="metric-label">Best Configuration</div>
      <div class="metric-value">${bestConfig.config.name}</div>
      <div>${bestConfig.config.description}</div>
    </div>
    <div class="metric-card">
      <div class="metric-label">Maximum Throughput</div>
      <div class="metric-value">${Math.max(...rpsData).toLocaleString()} req/sec</div>
      <div>Highest raw request throughput</div>
    </div>
    <div class="metric-card">
      <div class="metric-label">Best Efficiency</div>
      <div class="metric-value">${Math.max(...rpsPerCoreData).toLocaleString()} req/sec/core</div>
      <div>Highest throughput per CPU core used</div>
    </div>
  </div>
  
  <div class="chart-container">
    <canvas id="rpsChart"></canvas>
  </div>
  
  <div class="chart-container">
    <canvas id="cpuChart"></canvas>
  </div>
  
  <div class="chart-container">
    <canvas id="efficiencyChart"></canvas>
  </div>
  
  <h2>Configuration Details</h2>
  <table class="config-table">
    <thead>
      <tr>
        <th>Configuration</th>
        <th>Description</th>
        <th>Throughput (req/sec)</th>
        <th>CPU Usage (%)</th>
        <th>Efficiency (req/sec/core)</th>
      </tr>
    </thead>
    <tbody>
      ${data.map(item => `
        <tr>
          <td>${item.config.name}</td>
          <td>${item.config.description}</td>
          <td>${Math.round(item.summary.requestsPerSec).toLocaleString()}</td>
          <td>${item.cpuUsage}%</td>
          <td>${item.rpsPerCore.toLocaleString()} ${item === bestConfig ? '<span class="fire-emoji">🔥</span>' : ''}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>
  
  <h2>Problem and Solution</h2>
  <p>The core issue is that .NET's ThreadPool and async/await mechanics cause excessive thread context switching 
     and CPU usage when handling HTTP requests. This is particularly problematic in high-throughput services.</p>
  
  <p>Key observations:</p>
  <ul>
    <li>Async task completions frequently move between threads, causing context switching overhead</li>
    <li>The ThreadPool's work-stealing algorithm can exacerbate this problem</li>
    <li>Semaphore spinning (waiting for work) consumes CPU without doing useful work</li>
    <li>Limiting worker threads forces task continuations to stay on the same thread</li>
  </ul>
  
  <script>
    // Load the benchmark data
    const data = ${JSON.stringify(data)};
    
    // Chart colors
    const colors = [
      'rgba(0, 102, 204, 0.8)',
      'rgba(54, 162, 235, 0.8)',
      'rgba(75, 192, 192, 0.8)',
      'rgba(255, 159, 64, 0.8)',
      'rgba(153, 102, 255, 0.8)',
      'rgba(255, 99, 132, 0.8)'
    ];
    
    // Create RPS chart
    const rpsCtx = document.getElementById('rpsChart').getContext('2d');
    new Chart(rpsCtx, {
      type: 'bar',
      data: {
        labels: ${JSON.stringify(labels)},
        datasets: [{
          label: 'Requests per Second',
          data: ${JSON.stringify(rpsData)},
          backgroundColor: colors,
          borderColor: colors.map(c => c.replace('0.8', '1')),
          borderWidth: 1
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          title: {
            display: true,
            text: 'Raw Throughput (Requests per Second)',
            font: { size: 16 }
          },
          legend: {
            display: false
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            title: {
              display: true,
              text: 'Requests/sec'
            }
          }
        }
      }
    });
    
    // Create CPU usage chart
    const cpuCtx = document.getElementById('cpuChart').getContext('2d');
    new Chart(cpuCtx, {
      type: 'bar',
      data: {
        labels: ${JSON.stringify(labels)},
        datasets: [{
          label: 'CPU Usage (%)',
          data: ${JSON.stringify(cpuData)},
          backgroundColor: colors,
          borderColor: colors.map(c => c.replace('0.8', '1')),
          borderWidth: 1
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          title: {
            display: true,
            text: 'CPU Utilization',
            font: { size: 16 }
          },
          legend: {
            display: false
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            title: {
              display: true,
              text: 'CPU Usage (%)'
            }
          }
        }
      }
    });
    
    // Create efficiency chart
    const efficiencyCtx = document.getElementById('efficiencyChart').getContext('2d');
    new Chart(efficiencyCtx, {
      type: 'bar',
      data: {
        labels: ${JSON.stringify(labels)},
        datasets: [{
          label: 'Requests per Second per CPU Core',
          data: ${JSON.stringify(rpsPerCoreData)},
          backgroundColor: colors,
          borderColor: colors.map(c => c.replace('0.8', '1')),
          borderWidth: 1
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          title: {
            display: true,
            text: 'Efficiency (Requests per Second per CPU Core)',
            font: { size: 16 }
          },
          tooltip: {
            callbacks: {
              label: function(context) {
                return context.raw.toLocaleString() + ' req/sec/core';
              }
            }
          },
          legend: {
            display: false
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            title: {
              display: true,
              text: 'Requests/sec/core'
            }
          }
        }
      }
    });
  </script>
</body>
</html>
  `;
}

// Main function to generate HTML charts
function generateCharts() {
  try {
    // Check if data file exists
    if (!fs.existsSync(DATA_FILE)) {
      console.error(`Error: Data file not found at ${DATA_FILE}`);
      console.error('Please run the benchmarks first with: node run-benchmarks.js');
      process.exit(1);
    }
    
    // Read benchmark data
    const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    if (!data || data.length === 0) {
      console.error('Error: No benchmark data found. Please run the benchmarks first.');
      process.exit(1);
    }
    
    // Generate HTML with charts
    const htmlContent = generateChartsHtml(data);
    
    // Write HTML file
    fs.writeFileSync(CHART_HTML_FILE, htmlContent);
    console.log(`Charts generated successfully: ${CHART_HTML_FILE}`);
    
    // Create screenshots directory if it doesn't exist
    if (!fs.existsSync(SCREENSHOT_DIR)) {
      fs.mkdirSync(SCREENSHOT_DIR);
    }
    
    console.log('\nTo take screenshots of the charts for your README, you can:');
    console.log('1. Open the generated HTML file in a browser:');
    console.log(`   open ${CHART_HTML_FILE}`);
    console.log('2. Take screenshots of each chart');
    console.log('3. Save them to the screenshots directory');
    
  } catch (error) {
    console.error('Error generating charts:', error);
    process.exit(1);
  }
}

// Run the chart generation
generateCharts();