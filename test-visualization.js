#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Paths
const SAMPLE_DATA_FILE = path.join(__dirname, 'sample-data.json');
const DATA_FILE = path.join(__dirname, 'benchmark-data.json');
const CHART_HTML_FILE = path.join(__dirname, 'docs', 'index.html');
const SCREENSHOT_DIR = path.join(__dirname, 'screenshots');

// Copy sample data to benchmark data location
console.log('Copying sample data to benchmark data file...');
fs.copyFileSync(SAMPLE_DATA_FILE, DATA_FILE);

// Run the chart generation script
console.log('Generating charts...');
try {
  execSync('node generate-charts.js', { stdio: 'inherit' });
  console.log('\nCharts generated successfully!');

  // Create screenshots directory if it doesn't exist
  if (!fs.existsSync(SCREENSHOT_DIR)) {
    fs.mkdirSync(SCREENSHOT_DIR);
  }
  
  // Try to open the HTML file in the default browser
  try {
    console.log('Opening charts in browser...');
    execSync(`open ${CHART_HTML_FILE}`);
  } catch (error) {
    console.log(`Could not automatically open the browser. Please open ${CHART_HTML_FILE} manually.`);
  }
  
} catch (error) {
  console.error('Error generating charts:', error);
  process.exit(1);
}