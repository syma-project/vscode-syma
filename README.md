# Syma Language Support for VS Code

Syntax highlighting and language support for the [Syma](https://code.tanganke.com/syma/syma) symbolic programming language.

## Features

- **Syntax highlighting** for `.syma` files
  - Comments (`(* ... *)`) with nested block comment support
  - Keywords: `class`, `module`, `rule`, `match`, `import`, `export`, control flow
  - Built-in functions: `Sin`, `Cos`, `Map`, `Fold`, `Select`, `Length`, etc.
  - Type names: `Integer`, `Real`, `String`, `List`, `Symbol`, etc.
  - Constants: `True`, `False`, `Null`, `Pi`, `E`, `I`
  - Pattern blanks: `_`, `x_`, `_Integer`, `__`, `___`
  - Operators: `:=`, `->`, `:>`, `/.`, `//.`, `/@`, `@@`, `//`, `=>`, `/;`, etc.
  - Strings with escape sequences
  - Numeric literals: integers, reals, complex numbers
- **Bracket matching** for `()`, `[]`, `{}`, `[[ ]]`, `<| |>`
- **Comment toggling** with `(* ... *)` block comments
- **Auto-closing pairs** for brackets, strings, and comments
- **Code folding** with `(* region ... endregion *)` markers

## Language Overview

Syma is a symbolic-first programming language inspired by Wolfram Language, with OOP structure. Key features:

- Everything is a symbolic expression: `head[arg1, arg2, ...]`
- Pattern matching for function dispatch and control flow
- Classes with inheritance and mixins
- First-class modules and rules
- Dynamic typing with runtime type checking

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

## File Extension

Syma files use the `.syma` extension.

## Links

- [Syma Language Specification](https://code.tanganke.com/syma/syma/blob/main/syma-lang.md)
- [Syma Source Code](https://code.tanganke.com/syma/syma)
- [Report Issues](https://code.tanganke.com/syma/vscode-syma/issues)

## License

MIT
