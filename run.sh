#!/bin/bash
set -e

# Make scripts executable
chmod +x run-benchmarks.js
chmod +x generate-charts.js
chmod +x test-visualization.js

# Create screenshots directory if it doesn't exist
mkdir -p screenshots

# Function to clean up any lingering processes
cleanup() {
  echo "Cleaning up processes..."
  # Try to terminate only the specific dotnet web server process
  # Use a more specific pattern to avoid killing unrelated processes
  pkill -f "bin/Release/net8\.0/web$" || true
  echo "Cleanup complete."
}

# Check if --clean flag is provided
if [ "$1" == "--clean" ]; then
  cleanup
  echo "Cleanup completed. Exiting."
  exit 0
fi

# Register cleanup on exit
trap cleanup EXIT

# Check if --test flag is provided
if [ "$1" == "--test" ]; then
  echo "Running in test mode with sample data..."
  node test-visualization.js
else
  echo "Running benchmarks and generating visualizations..."
  echo "NOTE: This will run several benchmarks and may take 5-10 minutes."
  echo "Press Ctrl+C to abort at any time."
  echo ""
  
  # Run benchmarks
  node run-benchmarks.js
  
  # Generate charts
  node generate-charts.js
  
  # Open the HTML file in the default browser
  if command -v open > /dev/null; then
    open charts.html
  elif command -v xdg-open > /dev/null; then
    xdg-open charts.html
  else
    echo "Please open charts.html in your browser to view the results."
  fi
  
  echo ""
  echo "Benchmarks and visualizations complete!"
  echo "Don't forget to take screenshots of the charts for your README."
fi