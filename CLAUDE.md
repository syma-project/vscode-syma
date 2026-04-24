# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

VS Code extension providing syntax highlighting, LSP intelligence, and snippets for the **Syma** symbolic programming language (inspired by Wolfram Language). The Syma interpreter itself is a separate Rust project at `/Users/tanganke/Desktop/projects/syma/syma`.

## Build & Development Commands

```bash
npm install          # Install dependencies
npm run compile      # Build TypeScript to out/
npm run watch        # Watch mode for development
npm run lint         # Run ESLint on src/
```

No test framework is configured — there are no automated tests.

To test the extension: press F5 in VS Code to launch a Development Host, then open a `.syma` file.

## Architecture

**Client-server LSP design** with two TypeScript files:

- **`src/extension.ts`** — Extension entry point. Creates a `LanguageClient` that launches `out/server.js` as a Node.js child process over IPC. Activates on `.syma` files.

- **`src/server.ts`** — The LSP server. Contains all language intelligence logic:
  - **Diagnostics**: Tries the `syma` binary first (via `execSync`) to get real parse errors from stderr. Falls back to a bracket-matching validator written in TypeScript if the binary isn't found. The `validateWithSyma()` function parses stderr for `LexError: line:col: msg` and `ParseError: line:col: msg` patterns.
  - **Completions**: Serves keywords, 113+ built-in functions (with signatures/docs), type names, and constants from in-memory `BUILTINS`, `KEYWORDS`, `TYPES`, `CONSTANTS` records.
  - **Hover**: Looks up the word under cursor in the same records to show documentation.

**Non-TypeScript files:**

- **`syntaxes/syma.tmLanguage.json`** — TextMate grammar for syntax highlighting. Scopes: `source.syma`. Covers comments, strings, numbers, keywords, builtins, pattern blanks (`_`, `x_`, `_Integer`, `__`, `___`), operators, and punctuation.
- **`snippets/syma.json`** — 22 snippet definitions for common Syma patterns.
- **`language-configuration.json`** — Bracket pairs `()` `[]` `{}` `<| |>`, block comments `(* *)`, auto-closing pairs, folding markers (`(* region ... endregion *)`), and word pattern regex.

## Key Design Decisions

- The `syma` binary lookup order: `syma.server.path` setting → `which syma` on PATH → fallback to bracket-only validation.
- Diagnostics run on a configurable delay (default 500ms) after document changes, debounced via `setTimeout`.
- All built-in function data is duplicated between `server.ts` (LSP completions/hover) and `syma.tmLanguage.json` (syntax highlighting). When adding builtins, update both files.

## Syma Language Quick Reference

- Comments: `(* nested block comments *)`
- Functions: `f[x_] := body` (pattern-based definition)
- Rules: `rule name = { pattern -> replacement }`
- Classes: `class Name { field x; constructor[args] { }; method m[] := body }`
- Pattern blanks: `_` (any), `x_` (named), `_Integer` (typed), `__` (sequence), `___` (null sequence)
- Operators: `:=` (delayed assign), `->` (rule), `:>` (rule delayed), `/.` (replace), `//.` (replace all), `/@` (map), `@@` (apply), `/;` (condition), `//` (pipe)
