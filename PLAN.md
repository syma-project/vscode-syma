# Syma + VS Code Integration Plan

## Current State

### vscode-syma (working, pushed f5c11a7)
- TextMate grammar: full syntax highlighting
- TypeScript LSP: completions (113 builtins), hover docs, bracket diagnostics
- 22 code snippets, extension icon, settings

### syma (Rust, Phase 1 interpreter)
- Lexer → Parser → AST → Evaluator pipeline
- REPL works, `syma <file>` evaluates line-by-line
- Error types exist but **lack position info**

## Critical Gaps Found

### Gap 1: No position tracking in errors

```
// Current LexError — has byte position, no line/col
struct LexError { message: String, pos: usize }

// Current ParseError — NO position at all
struct ParseError { message: String, token: Option<Token> }

// Token — no span info carried through
enum Token { Integer(String), Real(String), ... }
```

Without line:col in errors, `syma check` can't produce LSP-compatible diagnostics.
The LSP requires `file:line:col: error: message` format.

### Gap 2: `run_file` is line-by-line

```rust
// main.rs:116 — evaluates each line independently
for line in source.lines() {
    let line = line.trim();
    eval_input(line, &env);
}
```

This means:
- Multi-line constructs (class, module, rule blocks) **don't work in files**
- `syma check` on a file would only check individual lines, not the whole program

### Gap 3: Parser panics on 26 code paths

The parser uses `panic!()` in 26 places for unrecoverable errors.
These need to become `Err(ParseError)` for the `check` command to work.

---

## Revised Plan: 4 Phases

### Phase 1: Fix `run_file` to parse whole file (Priority: CRITICAL)

**Problem:** `run_file` parses line-by-line, breaking multi-line constructs.

**Fix in `src/main.rs`:**
```
run_file(path):
  1. Read entire file as string
  2. lexer::tokenize(entire_source)  // single pass
  3. parser::parse(all_tokens)        // parse program (multiple statements)
  4. eval::eval_program(&ast, &env)   // evaluate all statements
```

The parser already has `parse_program() -> Result<Vec<Expr>, ParseError>`.
This is likely the intended entry point — `run_file` just doesn't use it.

**Effort:** ~30 min. Small change, high impact.

### Phase 2: Add span tracking to Token + errors (Priority: HIGH)

**Goal:** Every token and error carries `(line, col, offset)`.

**Changes to `src/lexer.rs`:**
```
// Add span to Token
struct Span { start: usize, end: usize, line: usize, col: usize }

struct SpannedToken {
    token: Token,
    span: Span,
}

// Lexer tracks line/col as it advances
fn tokenize(input: &str) -> Result<Vec<SpannedToken>, LexError>
```

**Changes to `src/parser.rs`:**
```
// ParseError gains position
struct ParseError {
    message: String,
    span: Option<Span>,  // from the offending token
}

// expect() captures the current token's span on failure
fn expect(&mut self, expected: &Token) -> Result<(), ParseError> {
    if self.peek().token == *expected {
        self.advance();
        Ok(())
    } else {
        Err(ParseError {
            message: format!("Expected {:?}, got {:?}", expected, self.peek().token),
            span: Some(self.peek().span.clone()),
        })
    }
}
```

**Effort:** ~2-3 hours. Mechanical but touches many files.

### Phase 3: Add `syma check` subcommand (Priority: HIGH)

**Goal:** Parse-only mode that reports errors in `file:line:col: error: msg` format.

**Changes to `src/main.rs`:**
```
match args.get(1).map(|s| s.as_str()) {
    Some("check") => {
        let path = args.get(2).expect("usage: syma check <file>");
        check_file(path);
    }
    // ... existing cases
}

fn check_file(path: &str) {
    let source = fs::read_to_string(path)?;
    match lexer::tokenize(&source) {
        Err(e) => {
            eprintln!("{}:{}:{}", path, e.line, e.col, e.message);
            std::process::exit(1);
        }
        Ok(tokens) => match parser::parse(tokens) {
            Err(e) => {
                eprintln!("{}:{}:{}", path, e.line, e.col, e.message);
                std::process::exit(1);
            }
            Ok(_) => {
                // exit 0, no output
            }
        }
    }
}
```

**Effort:** ~30 min (depends on Phase 2).

### Phase 4: Integrate `syma check` into vscode-syma (Priority: HIGH)

**Changes to `src/server.ts`:**
```
// On document change:
// 1. Save to temp file
// 2. Run `syma check <tempfile>`
// 3. Parse stderr for diagnostics
// 4. Send to LSP client
// 5. Fall back to bracket-only if syma not found
```

**Effort:** ~1-2 hours.

---

## Implementation Order

```
Phase 1  ──→  Phase 2  ──→  Phase 3  ──→  Phase 4
(30 min)      (2-3 hrs)     (30 min)      (1-2 hrs)
run_file      spans         check cmd     VS Code
whole-file    in tokens     CLI mode      integration
```

Total: ~4-6 hours for real syntax error diagnostics in VS Code.

## What This Enables

After Phases 1-4:
- Open a .syma file in VS Code
- Type `f[x_ :=` → red squiggly on the `[` with "Expected ']', got ':='"
- Save → full parse validation
- Completions, hover, snippets all still work (unchanged)

## Future (Phase 5+, not in this plan)

- `syma --lsp`: Rust-native LSP server (replaces TypeScript server)
- `syma format`: auto-formatter
- Go-to-definition, find-references, rename
- Semantic highlighting (user-defined symbols)
