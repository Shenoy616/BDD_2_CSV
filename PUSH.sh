#!/bin/bash

# Script to push code to GitHub
# Run this script: bash PUSH.sh

echo "✅ Remote is already configured to: git@github.com:Shenoy616/BDD_2_CSV.git"
echo ""
echo "Pulling any remote changes (if any)..."
git pull origin main --allow-unrelated-histories --no-rebase 2>&1 || echo "Note: Continuing anyway..."

echo ""
echo "Pushing to GitHub..."
git push -u origin main

echo ""
echo "✅ Done! Your code should now be on GitHub."
echo ""
echo "Next steps to enable GitHub Pages:"
echo "1. Go to: https://github.com/Shenoy616/BDD_2_CSV/settings/pages"
echo "2. Under 'Source', select Branch: main, Folder: / (root)"
echo "3. Click Save"
echo "4. Your app will be live at: https://shenoy616.github.io/BDD_2_CSV/"

