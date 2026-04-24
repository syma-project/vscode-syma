# Syma Language Support for VS Code

Syntax highlighting, code snippets, and language intelligence for the [Syma](https://code.tanganke.com/syma/syma) symbolic programming language.

## Features

### Syntax Highlighting

Full syntax highlighting for `.syma` files including:

- **Comments** — `(* ... *)` with nested block comment support
- **Keywords** — `class`, `module`, `rule`, `match`, `import`, `export`, control flow
- **Built-in functions** — `Sin`, `Cos`, `Map`, `Fold`, `Select`, `Length`, and 100+ more
- **Type names** — `Integer`, `Real`, `String`, `List`, `Symbol`, etc.
- **Constants** — `True`, `False`, `Null`, `Pi`, `E`, `I`
- **Pattern blanks** — `_`, `x_`, `_Integer`, `__`, `___`
- **Operators** — `:=`, `->`, `:>`, `/.`, `//.`, `/@`, `@@`, `//`, `=>`, `/;`, etc.
- **Strings** with escape sequences (`\n`, `\t`, `\u{...}`)
- **Numeric literals** — integers, reals, complex numbers (`1+2I`)

### Language Server (LSP)

- **Diagnostics** — Detects unmatched brackets, unterminated strings/comments
- **Completions** — Keywords, built-in functions (with signatures), types, constants
- **Hover** — Documentation for built-in functions, types, constants, keywords

### Snippets

22 snippets for common Syma patterns:

| Prefix | Description |
|--------|-------------|
| `class` | Class definition with field, constructor, method |
| `class-extends` | Class with inheritance |
| `mixin` | Mixin definition |
| `module` | Module with exports |
| `import` / `import-select` / `import-alias` | Import statements |
| `rule` | Rewrite rule set |
| `func` / `func-typed` / `func-guard` | Function definitions |
| `match` | Pattern match expression |
| `if` / `which` / `switch` | Conditionals |
| `for` / `while` / `do` | Loops |
| `try` | Exception handling |
| `lambda` | Pure function |
| `assoc` | Association literal |
| `table` | List generation |
| `transform` | Class transform decorator |
| `region` | Foldable region marker |

### Other Features

- **Bracket matching** for `()`, `[]`, `{}`, `[[ ]]`, `<| |>`
- **Comment toggling** with `(* ... *)` block comments
- **Auto-closing pairs** for brackets, strings, and comments
- **Code folding** with `(* region ... endregion *)` markers

## Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `syma.server.path` | `""` | Path to custom Syma language server binary |
| `syma.server.trace` | `"off"` | Trace LSP communication (`off` / `messages` / `verbose`) |
| `syma.diagnostics.enabled` | `true` | Enable syntax diagnostics |
| `syma.diagnostics.delay` | `500` | Delay (ms) before running diagnostics |

## Language Overview

Syma is a symbolic-first programming language inspired by Wolfram Language, with OOP structure.

```syma
(* Symbolic differentiation *)
rule derivative = {
    D[c_, x_] /; FreeQ[c, x]  -> 0
    D[x_, x_]                  -> 1
    D[x_^n_, x_]               -> n * x^(n-1)
    D[u_ + v_, x_]             -> D[u, x] + D[v, x]
    D[Sin[u_], x_]             -> Cos[u] * D[u, x]
}

D[Sin[x]^2, x] //. derivative
(* => 2 Sin[x] Cos[x] *)
```

## Links

- [Syma Language Specification](https://code.tanganke.com/syma/syma/blob/main/syma-lang.md)
- [Syma Source Code](https://code.tanganke.com/syma/syma)
- [Report Issues](https://code.tanganke.com/syma/vscode-syma/issues)

## License

MIT
