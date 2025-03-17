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
  pkill -f "src/web/bin/Release/net8\.0/web$" || true
  echo "Cleanup complete."
}

# Help function
show_help() {
  echo "Async Nightmare Benchmark Runner"
  echo "--------------------------------"
  echo "Usage: ./run.sh [OPTION]"
  echo ""
  echo "Options:"
  echo "  --test      Run with sample data instead of real benchmarks (much faster)"
  echo "  --clean     Terminate any lingering server processes and exit"
  echo "  --help      Show this help message and exit"
  echo ""
  echo "Examples:"
  echo "  ./run.sh                     # Run full benchmarks and generate charts"
  echo "  ./run.sh --test              # Use sample data to generate charts quickly"
  echo "  ./run.sh --clean             # Clean up any lingering processes"
  echo ""
  echo "Notes:"
  echo "- Full benchmarks take 5-10 minutes to complete"
  echo "- Server logs are saved to server-*.log files"
  echo "- Screenshots should be saved to the screenshots/ directory"
}

# Check if --help flag is provided
if [ "$1" == "--help" ]; then
  show_help
  exit 0
fi

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
  
  # Check if benchmark run was successful
  if [ $? -eq 0 ]; then
    # Generate charts if benchmarks were successful
    echo "Generating charts from benchmark data..."
    node generate-charts.js
    
    # Open the HTML file in the default browser
    if command -v open > /dev/null; then
      open charts.html
    elif command -v xdg-open > /dev/null; then
      xdg-open charts.html
    else
      echo "Please open charts.html in your browser to view the results."
    fi
    
    # Mention server logs
    echo ""
    echo "Server logs are available in server-*.log files for debugging."
  else
    echo ""
    echo "❌ Benchmark run failed. Check server-*.log files for details."
    echo "You can try again or use ./run.sh --test to generate charts with sample data."
    exit 1
  fi
  
  echo ""
  echo "Benchmarks and visualizations complete!"
  echo "Don't forget to take screenshots of the charts for your README."
fi