# GitHub Copilot Instructions

This file provides guidance to GitHub Copilot when working with code in this repository.

## Package Management

This project uses **PNPM** as its package manager. Always use `pnpm` commands for package management:

- Install dependencies: `pnpm install`
- Add a package: `pnpm add <package-name>`
- Add a dev dependency: `pnpm add -D <package-name>`
- Run scripts: `pnpm <script-name>` or `pnpm run <script-name>`

**Do NOT use NPM** commands (`npm install`, etc.) as this will create conflicting lock files (`package-lock.json`).

The project uses `pnpm-lock.yaml` as its lock file. Never create or modify `package-lock.json`.

## Running the Site

This project uses **Hugo** as its static site generator. To run the development server:

```sh
hugo server
```

This will start a local development server, typically at `http://localhost:1313/`.

## Project Overview

The Oregon Housing Project is a research-focused website about housing policy in Oregon. It uses Hugo (a static site generator) to publish in-depth research and analysis on housing legislation, key people, cities, and concepts.

**This is a research project, not a software development project.** When reviewing or contributing to this project, focus on accuracy, conciseness, quality of analysis, and proper sourcing rather than code quality.

For more detailed instructions, see `CLAUDE.md` in the repository root.
