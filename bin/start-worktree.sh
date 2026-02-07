#!/bin/bash

# Script to create a git worktree for the Oregon Housing Project
# Usage: start-worktree.sh <branch-name>

set -e

PROJECT_DIR="$HOME/projects/oregon-housing-project"

# Check if branch name is provided
if [ -z "$1" ]; then
    echo "Error: Branch name required"
    echo "Usage: $0 <branch-name>"
    exit 1
fi

BRANCH_NAME="$1"
# Sanitize branch name for directory names (replace / with -)
SAFE_BRANCH_NAME="${BRANCH_NAME//\//-}"
WORKTREE_DIR="$HOME/projects/oregon-housing-project-$SAFE_BRANCH_NAME"

# Navigate to main project directory
cd "$PROJECT_DIR"

# Check if branch exists locally
if git show-ref --verify --quiet refs/heads/"$BRANCH_NAME"; then
    echo "Branch $BRANCH_NAME exists locally, reusing it"
    BRANCH_EXISTS=true
else
    # Check if branch exists on remote
    if git ls-remote --heads origin "$BRANCH_NAME" | grep -q "$BRANCH_NAME"; then
        echo "Branch $BRANCH_NAME exists on remote, fetching it"
        git fetch origin "$BRANCH_NAME:$BRANCH_NAME"
        BRANCH_EXISTS=true
    else
        echo "Branch $BRANCH_NAME does not exist, will create it"
        BRANCH_EXISTS=false
    fi
fi

# Create worktree
if [ -d "$WORKTREE_DIR" ]; then
    echo "Worktree directory $WORKTREE_DIR already exists"
else
    if [ "$BRANCH_EXISTS" = true ]; then
        echo "Creating worktree for existing branch $BRANCH_NAME"
        git worktree add "$WORKTREE_DIR" "$BRANCH_NAME"
    else
        echo "Creating worktree with new branch $BRANCH_NAME"
        git worktree add -b "$BRANCH_NAME" "$WORKTREE_DIR"
    fi
fi

# Change to worktree directory
cd "$WORKTREE_DIR"

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    pnpm install
fi

echo ""
echo "Worktree setup complete!"
echo "  Branch: $BRANCH_NAME"
echo "  Directory: $WORKTREE_DIR"
echo ""
echo "To start Hugo server:"
echo "  hugo server"
echo ""

exec $SHELL
