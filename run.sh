#!/bin/bash

# Make scripts executable
chmod +x run-benchmarks.js
chmod +x generate-charts.js
chmod +x test-visualization.js

# Check if --test flag is provided
if [ "$1" == "--test" ]; then
  echo "Running in test mode with sample data..."
  node test-visualization.js
else
  echo "Running benchmarks and generating visualizations..."
  # Run benchmarks
  node run-benchmarks.js
  
  # Generate charts
  node generate-charts.js
  
  # Open the HTML file in the default browser
  open charts.html
fi