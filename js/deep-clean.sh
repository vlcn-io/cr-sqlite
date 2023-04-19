#!/bin/bash

# Navigate to the packages directory
cd ./packages

# Iterate over each subdirectory
for dir in */ ; do
  # Navigate to the current subdirectory
  cd "$dir"
  # Run pnpm deep-clean
  pnpm deep-clean
  # Navigate back to the packages directory
  cd ..
done
