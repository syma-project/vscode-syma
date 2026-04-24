# Changelog

## 0.2.0

- Added Language Server Protocol (LSP) support:
  - Bracket matching diagnostics (unmatched brackets, strings, comments)
  - Completions for 113 built-in functions with signatures and documentation
  - Completions for keywords, types, and constants
  - Hover documentation for built-in functions, types, constants, keywords
  - Configurable diagnostic delay (`syma.diagnostics.delay`)
  - Server trace logging (`syma.server.trace`)
- Added 22 snippets for common Syma patterns:
  - class, class-extends, mixin, module
  - import, import-select, import-alias
  - rule, func, func-typed, func-guard
  - match, if, which, switch
  - for, while, do
  - try, lambda, assoc, table, transform, region
- Added extension icon

## 0.1.0

- Initial release
- Syntax highlighting for `.syma` files
- Language configuration (brackets, comments, auto-closing)
- TextMate grammar covering:
  - Keywords (control flow, declarations, modules)
  - Built-in functions (math, list, string, logic, I/O)
  - Type names and constants
  - Pattern blanks and type-constrained patterns
  - Multi-character operators
  - Strings with escape sequences
  - Numeric literals (integer, real, complex)
