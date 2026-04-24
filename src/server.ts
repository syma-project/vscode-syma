import {
  createConnection,
  TextDocuments,
  ProposedFeatures,
  InitializeParams,
  InitializeResult,
  TextDocumentSyncKind,
  CompletionItem,
  CompletionItemKind,
  Position,
  Range,
  Diagnostic,
  DiagnosticSeverity,
  Hover,
  MarkupKind,
  TextDocumentPositionParams,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';

// ─── Connection ───
const connection = createConnection(ProposedFeatures.all);
const documents = new TextDocuments(TextDocument);

// ─── Built-in function documentation ───
const BUILTINS: Record<string, { signature: string; doc: string; kind: CompletionItemKind }> = {
  // Trig
  'Sin':  { signature: 'Sin[x]', doc: 'Trigonometric sine', kind: CompletionItemKind.Function },
  'Cos':  { signature: 'Cos[x]', doc: 'Trigonometric cosine', kind: CompletionItemKind.Function },
  'Tan':  { signature: 'Tan[x]', doc: 'Trigonometric tangent', kind: CompletionItemKind.Function },
  'ArcSin': { signature: 'ArcSin[x]', doc: 'Inverse sine', kind: CompletionItemKind.Function },
  'ArcCos': { signature: 'ArcCos[x]', doc: 'Inverse cosine', kind: CompletionItemKind.Function },
  'ArcTan': { signature: 'ArcTan[x]', doc: 'Inverse tangent', kind: CompletionItemKind.Function },
  // Math
  'Abs':   { signature: 'Abs[x]', doc: 'Absolute value', kind: CompletionItemKind.Function },
  'Sqrt':  { signature: 'Sqrt[x]', doc: 'Square root', kind: CompletionItemKind.Function },
  'Exp':   { signature: 'Exp[x]', doc: 'Exponential function e^x', kind: CompletionItemKind.Function },
  'Log':   { signature: 'Log[x]', doc: 'Natural logarithm', kind: CompletionItemKind.Function },
  'Log2':  { signature: 'Log2[x]', doc: 'Base-2 logarithm', kind: CompletionItemKind.Function },
  'Log10': { signature: 'Log10[x]', doc: 'Base-10 logarithm', kind: CompletionItemKind.Function },
  'Power': { signature: 'Power[x, n]', doc: 'Exponentiation x^n', kind: CompletionItemKind.Function },
  'Factorial': { signature: 'Factorial[n]', doc: 'Factorial n!', kind: CompletionItemKind.Function },
  'GCD':   { signature: 'GCD[a, b]', doc: 'Greatest common divisor', kind: CompletionItemKind.Function },
  'LCM':   { signature: 'LCM[a, b]', doc: 'Least common multiple', kind: CompletionItemKind.Function },
  'Floor': { signature: 'Floor[x]', doc: 'Round down to integer', kind: CompletionItemKind.Function },
  'Ceiling': { signature: 'Ceiling[x]', doc: 'Round up to integer', kind: CompletionItemKind.Function },
  'Round': { signature: 'Round[x]', doc: 'Round to nearest integer', kind: CompletionItemKind.Function },
  'Mod':   { signature: 'Mod[n, m]', doc: 'Modular remainder', kind: CompletionItemKind.Function },
  // Arithmetic
  'Plus':  { signature: 'Plus[a, b, ...]', doc: 'Addition (also a + b)', kind: CompletionItemKind.Operator },
  'Times': { signature: 'Times[a, b, ...]', doc: 'Multiplication (also a * b)', kind: CompletionItemKind.Operator },
  'Divide': { signature: 'Divide[a, b]', doc: 'Division (also a / b)', kind: CompletionItemKind.Operator },
  'Minus': { signature: 'Minus[x]', doc: 'Negation (also -x)', kind: CompletionItemKind.Operator },
  'Sum':   { signature: 'Sum[expr, {i, min, max}]', doc: 'Summation', kind: CompletionItemKind.Function },
  'Total': { signature: 'Total[list]', doc: 'Sum all elements', kind: CompletionItemKind.Function },
  // Calculus
  'D':         { signature: 'D[expr, x]', doc: 'Symbolic derivative d/dx', kind: CompletionItemKind.Function },
  'Integrate': { signature: 'Integrate[expr, x]', doc: 'Symbolic integral', kind: CompletionItemKind.Function },
  'Simplify':  { signature: 'Simplify[expr]', doc: 'Apply simplification rules', kind: CompletionItemKind.Function },
  'Expand':    { signature: 'Expand[expr]', doc: 'Expand products', kind: CompletionItemKind.Function },
  'Factor':    { signature: 'Factor[expr]', doc: 'Factor polynomials', kind: CompletionItemKind.Function },
  'Solve':     { signature: 'Solve[eqn, x]', doc: 'Solve equation symbolically', kind: CompletionItemKind.Function },
  'Series':    { signature: 'Series[expr, {x, x0, n}]', doc: 'Taylor series expansion', kind: CompletionItemKind.Function },
  // List
  'Length':    { signature: 'Length[list]', doc: 'Number of elements', kind: CompletionItemKind.Function },
  'First':     { signature: 'First[list]', doc: 'First element', kind: CompletionItemKind.Function },
  'Last':      { signature: 'Last[list]', doc: 'Last element', kind: CompletionItemKind.Function },
  'Rest':      { signature: 'Rest[list]', doc: 'All but first element', kind: CompletionItemKind.Function },
  'Most':      { signature: 'Most[list]', doc: 'All but last element', kind: CompletionItemKind.Function },
  'Append':    { signature: 'Append[list, elem]', doc: 'Add element to end', kind: CompletionItemKind.Function },
  'Prepend':   { signature: 'Prepend[list, elem]', doc: 'Add element to beginning', kind: CompletionItemKind.Function },
  'Join':      { signature: 'Join[list1, list2]', doc: 'Concatenate lists', kind: CompletionItemKind.Function },
  'Flatten':   { signature: 'Flatten[list]', doc: 'Remove nesting', kind: CompletionItemKind.Function },
  'Sort':      { signature: 'Sort[list]', doc: 'Sort elements', kind: CompletionItemKind.Function },
  'Reverse':   { signature: 'Reverse[list]', doc: 'Reverse order', kind: CompletionItemKind.Function },
  'Take':      { signature: 'Take[list, n]', doc: 'Take first n elements', kind: CompletionItemKind.Function },
  'Drop':      { signature: 'Drop[list, n]', doc: 'Drop first n elements', kind: CompletionItemKind.Function },
  'Part':      { signature: 'Part[list, i]', doc: 'Index access (also list[[i]])', kind: CompletionItemKind.Function },
  'Range':     { signature: 'Range[n] | Range[min, max]', doc: 'Generate integer sequence', kind: CompletionItemKind.Function },
  'Table':     { signature: 'Table[expr, {i, min, max}]', doc: 'Generate list by evaluation', kind: CompletionItemKind.Function },
  'Map':       { signature: 'Map[f, list]', doc: 'Apply f to each element (also f /@ list)', kind: CompletionItemKind.Function },
  'Fold':      { signature: 'Fold[f, init, list]', doc: 'Left fold with initial value', kind: CompletionItemKind.Function },
  'Select':    { signature: 'Select[list, test]', doc: 'Filter elements matching test', kind: CompletionItemKind.Function },
  'Scan':      { signature: 'Scan[f, list]', doc: 'Apply f for side effects (returns Null)', kind: CompletionItemKind.Function },
  'Nest':      { signature: 'Nest[f, x, n]', doc: 'Apply f to x n times', kind: CompletionItemKind.Function },
  'FixedPoint': { signature: 'FixedPoint[f, x]', doc: 'Apply f until result stabilizes', kind: CompletionItemKind.Function },
  'Count':     { signature: 'Count[list, pattern]', doc: 'Count matching elements', kind: CompletionItemKind.Function },
  'Position':  { signature: 'Position[list, pattern]', doc: 'Positions of matching elements', kind: CompletionItemKind.Function },
  'Tally':     { signature: 'Tally[list]', doc: 'Count occurrences of each element', kind: CompletionItemKind.Function },
  'Transpose': { signature: 'Transpose[matrix]', doc: 'Transpose rows and columns', kind: CompletionItemKind.Function },
  'Union':     { signature: 'Union[list1, list2, ...]', doc: 'Set union (sorted, no duplicates)', kind: CompletionItemKind.Function },
  'Intersection': { signature: 'Intersection[list1, list2]', doc: 'Set intersection', kind: CompletionItemKind.Function },
  'Complement': { signature: 'Complement[list1, list2]', doc: 'Set difference', kind: CompletionItemKind.Function },
  'MemberQ':   { signature: 'MemberQ[list, pattern]', doc: 'Test if pattern matches any element', kind: CompletionItemKind.Function },
  'FreeQ':     { signature: 'FreeQ[expr, pattern]', doc: 'Test if pattern appears nowhere', kind: CompletionItemKind.Function },
  'PadLeft':   { signature: 'PadLeft[list, n]', doc: 'Pad with zeros on the left', kind: CompletionItemKind.Function },
  'PadRight':  { signature: 'PadRight[list, n]', doc: 'Pad with zeros on the right', kind: CompletionItemKind.Function },
  'Riffle':    { signature: 'Riffle[list, sep]', doc: 'Interleave separator between elements', kind: CompletionItemKind.Function },
  // String
  'StringJoin':     { signature: 'StringJoin[s1, s2, ...]', doc: 'Concatenate strings (also s1 <> s2)', kind: CompletionItemKind.Function },
  'StringLength':   { signature: 'StringLength[s]', doc: 'Character count', kind: CompletionItemKind.Function },
  'StringSplit':    { signature: 'StringSplit[s, delim]', doc: 'Split string by delimiter', kind: CompletionItemKind.Function },
  'StringReplace':  { signature: 'StringReplace[s, rule]', doc: 'Replace substrings', kind: CompletionItemKind.Function },
  'StringReverse':  { signature: 'StringReverse[s]', doc: 'Reverse string', kind: CompletionItemKind.Function },
  'StringTake':     { signature: 'StringTake[s, n]', doc: 'Take first n characters', kind: CompletionItemKind.Function },
  'StringDrop':     { signature: 'StringDrop[s, n]', doc: 'Drop first n characters', kind: CompletionItemKind.Function },
  'StringContainsQ': { signature: 'StringContainsQ[s, sub]', doc: 'Test if substring is present', kind: CompletionItemKind.Function },
  'ToString':       { signature: 'ToString[expr]', doc: 'Expression to string', kind: CompletionItemKind.Function },
  'ToExpression':   { signature: 'ToExpression[s]', doc: 'String to expression', kind: CompletionItemKind.Function },
  'ToLowerCase':    { signature: 'ToLowerCase[s]', doc: 'Convert to lowercase', kind: CompletionItemKind.Function },
  'ToUpperCase':    { signature: 'ToUpperCase[s]', doc: 'Convert to uppercase', kind: CompletionItemKind.Function },
  // Association
  'Keys':       { signature: 'Keys[assoc]', doc: 'List of keys', kind: CompletionItemKind.Function },
  'Values':     { signature: 'Values[assoc]', doc: 'List of values', kind: CompletionItemKind.Function },
  'Lookup':     { signature: 'Lookup[assoc, key]', doc: 'Lookup with default', kind: CompletionItemKind.Function },
  'KeyExistsQ': { signature: 'KeyExistsQ[assoc, key]', doc: 'Test if key exists', kind: CompletionItemKind.Function },
  // IO
  'Print':          { signature: 'Print[expr, ...]', doc: 'Print to output', kind: CompletionItemKind.Function },
  'Input':          { signature: 'Input[]', doc: 'Read user input', kind: CompletionItemKind.Function },
  'RandomReal':     { signature: 'RandomReal[] | RandomReal[{min, max}]', doc: 'Random real number', kind: CompletionItemKind.Function },
  'RandomInteger':  { signature: 'RandomInteger[n] | RandomInteger[{min, max}]', doc: 'Random integer', kind: CompletionItemKind.Function },
  'RandomChoice':   { signature: 'RandomChoice[list]', doc: 'Random element from list', kind: CompletionItemKind.Function },
  // Logic / comparison
  'And':   { signature: 'And[a, b, ...]', doc: 'Logical AND (also a && b)', kind: CompletionItemKind.Operator },
  'Or':    { signature: 'Or[a, b, ...]', doc: 'Logical OR (also a || b)', kind: CompletionItemKind.Operator },
  'Not':   { signature: 'Not[x]', doc: 'Logical NOT (also !x)', kind: CompletionItemKind.Operator },
  'Equal':       { signature: 'Equal[a, b]', doc: 'Equality test (also a == b)', kind: CompletionItemKind.Operator },
  'Unequal':     { signature: 'Unequal[a, b]', doc: 'Inequality test (also a != b)', kind: CompletionItemKind.Operator },
  'Less':        { signature: 'Less[a, b]', doc: 'Less than (also a < b)', kind: CompletionItemKind.Operator },
  'Greater':     { signature: 'Greater[a, b]', doc: 'Greater than (also a > b)', kind: CompletionItemKind.Operator },
  'LessEqual':   { signature: 'LessEqual[a, b]', doc: 'Less or equal (also a <= b)', kind: CompletionItemKind.Operator },
  'GreaterEqual': { signature: 'GreaterEqual[a, b]', doc: 'Greater or equal (also a >= b)', kind: CompletionItemKind.Operator },
  'Min':   { signature: 'Min[a, b, ...]', doc: 'Minimum value', kind: CompletionItemKind.Function },
  'Max':   { signature: 'Max[a, b, ...]', doc: 'Maximum value', kind: CompletionItemKind.Function },
  // Pattern matching
  'Head':    { signature: 'Head[expr]', doc: 'Type head of expression', kind: CompletionItemKind.Function },
  'TypeOf':  { signature: 'TypeOf[expr]', doc: 'Type name (class name for objects)', kind: CompletionItemKind.Function },
  'MatchQ':  { signature: 'MatchQ[expr, pattern]', doc: 'Test if expr matches pattern', kind: CompletionItemKind.Function },
};

// ─── Keywords ───
const KEYWORDS = [
  'class', 'extends', 'with', 'mixin',
  'module', 'import', 'export', 'as',
  'rule', 'method', 'field', 'constructor',
  'match',
  'If', 'Which', 'Switch',
  'For', 'While', 'Do',
  'try', 'catch', 'finally', 'throw',
  'Function',
  'Hold', 'HoldComplete', 'ReleaseHold',
  '@transform',
];

// ─── Type names ───
const TYPES = [
  'Integer', 'Real', 'Rational', 'Complex',
  'String', 'Symbol', 'Boolean', 'Number', 'Atom',
  'List', 'Rule', 'RuleDelayed', 'Pattern',
  'Function', 'Object', 'Compound', 'Expr',
];

// ─── Constants ───
const CONSTANTS: Record<string, string> = {
  'True':  'Boolean true',
  'False': 'Boolean false',
  'Null':  'Null value',
  'Pi':    '3.14159265358979... (π)',
  'E':     '2.71828182845904... (Euler\'s number)',
  'I':     'Imaginary unit (√-1)',
};

// ─── Initialize ───
connection.onInitialize((_params: InitializeParams): InitializeResult => {
  return {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      completionProvider: {
        resolveProvider: true,
        triggerCharacters: ['.', '[', ',', ' '],
      },
      hoverProvider: true,
    },
  };
});

// ─── Diagnostics ───
function validateDocument(doc: TextDocument): Diagnostic[] {
  const text = doc.getText();
  const diagnostics: Diagnostic[] = [];

  // Track bracket depth
  const bracketStack: { char: string; pos: number }[] = [];
  let inString = false;
  let inComment = 0; // nesting depth
  let i = 0;

  while (i < text.length) {
    // Nested block comments
    if (!inString && text[i] === '(' && i + 1 < text.length && text[i + 1] === '*') {
      inComment++;
      i += 2;
      continue;
    }
    if (!inString && inComment > 0 && text[i] === '*' && i + 1 < text.length && text[i + 1] === ')') {
      inComment--;
      i += 2;
      continue;
    }

    if (inComment > 0) { i++; continue; }

    // Strings
    if (text[i] === '"' && !inString) {
      inString = true;
      i++;
      continue;
    }
    if (text[i] === '"' && inString) {
      inString = false;
      i++;
      continue;
    }
    if (inString) {
      if (text[i] === '\\' && i + 1 < text.length) { i += 2; continue; }
      i++;
      continue;
    }

    // Brackets
    const ch = text[i];
    const next = i + 1 < text.length ? text[i + 1] : '';

    // Double brackets
    if (ch === '[' && next === '[') {
      bracketStack.push({ char: '[[', pos: i });
      i += 2;
      continue;
    }
    if (ch === ']' && next === ']') {
      if (bracketStack.length > 0 && bracketStack[bracketStack.length - 1].char === '[[') {
        bracketStack.pop();
      } else {
        diagnostics.push({
          severity: DiagnosticSeverity.Error,
          range: Range.create(doc.positionAt(i), doc.positionAt(i + 2)),
          message: 'Unmatched ]]',
          source: 'syma',
        });
      }
      i += 2;
      continue;
    }

    // Association brackets
    if (ch === '<' && next === '|') {
      bracketStack.push({ char: '<|', pos: i });
      i += 2;
      continue;
    }
    if (ch === '|' && next === '>') {
      if (bracketStack.length > 0 && bracketStack[bracketStack.length - 1].char === '<|') {
        bracketStack.pop();
      } else {
        diagnostics.push({
          severity: DiagnosticSeverity.Error,
          range: Range.create(doc.positionAt(i), doc.positionAt(i + 2)),
          message: 'Unmatched |>',
          source: 'syma',
        });
      }
      i += 2;
      continue;
    }

    // Single brackets
    if (ch === '(' || ch === '[' || ch === '{') {
      bracketStack.push({ char: ch, pos: i });
      i++;
      continue;
    }
    const closingMap: Record<string, string> = { ')': '(', ']': '[', '}': '{' };
    if (ch === ')' || ch === ']' || ch === '}') {
      const expected = closingMap[ch];
      if (bracketStack.length > 0 && bracketStack[bracketStack.length - 1].char === expected) {
        bracketStack.pop();
      } else {
        diagnostics.push({
          severity: DiagnosticSeverity.Error,
          range: Range.create(doc.positionAt(i), doc.positionAt(i + 1)),
          message: `Unmatched ${ch}`,
          source: 'syma',
        });
      }
      i++;
      continue;
    }

    i++;
  }

  // Check for unterminated string
  if (inString) {
    diagnostics.push({
      severity: DiagnosticSeverity.Error,
      range: Range.create(doc.positionAt(text.length - 1), doc.positionAt(text.length)),
      message: 'Unterminated string',
      source: 'syma',
    });
  }

  // Check for unterminated comment
  if (inComment > 0) {
    diagnostics.push({
      severity: DiagnosticSeverity.Warning,
      range: Range.create(doc.positionAt(text.length - 1), doc.positionAt(text.length)),
      message: `Unterminated block comment (${inComment} level${inComment > 1 ? 's' : ''} deep)`,
      source: 'syma',
    });
  }

  // Check for unmatched opening brackets
  for (const b of bracketStack) {
    const close: Record<string, string> = { '(': ')', '[': ']', '{': '}', '[[': ']]', '<|': '|>' };
    diagnostics.push({
      severity: DiagnosticSeverity.Error,
      range: Range.create(doc.positionAt(b.pos), doc.positionAt(b.pos + b.char.length)),
      message: `Unmatched ${b.char} (missing ${close[b.char]})`,
      source: 'syma',
    });
  }

  return diagnostics;
}

let diagnosticTimer: ReturnType<typeof setTimeout> | undefined;

documents.onDidChangeContent((change) => {
  if (diagnosticTimer) clearTimeout(diagnosticTimer);
  diagnosticTimer = setTimeout(() => {
    const diagnostics = validateDocument(change.document);
    connection.sendDiagnostics({ uri: change.document.uri, diagnostics });
  }, 500);
});

documents.onDidClose((event) => {
  connection.sendDiagnostics({ uri: event.document.uri, diagnostics: [] });
});

// ─── Completions ───
connection.onCompletion((params: TextDocumentPositionParams): CompletionItem[] => {
  const doc = documents.get(params.textDocument.uri);
  if (!doc) return [];

  const items: CompletionItem[] = [];

  // Keywords
  for (const kw of KEYWORDS) {
    items.push({
      label: kw,
      kind: CompletionItemKind.Keyword,
      detail: 'keyword',
    });
  }

  // Built-in functions
  for (const [name, info] of Object.entries(BUILTINS)) {
    items.push({
      label: name,
      kind: info.kind,
      detail: info.signature,
      documentation: {
        kind: MarkupKind.Markdown,
        value: `**${info.signature}**\n\n${info.doc}`,
      },
    });
  }

  // Types
  for (const t of TYPES) {
    items.push({
      label: t,
      kind: CompletionItemKind.TypeParameter,
      detail: 'type',
    });
  }

  // Constants
  for (const [name, desc] of Object.entries(CONSTANTS)) {
    items.push({
      label: name,
      kind: CompletionItemKind.Value,
      detail: desc,
    });
  }

  return items;
});

connection.onCompletionResolve((item: CompletionItem): CompletionItem => {
  return item;
});

// ─── Hover ───
connection.onHover((params: TextDocumentPositionParams): Hover | null => {
  const doc = documents.get(params.textDocument.uri);
  if (!doc) return null;

  // Get word at cursor
  const offset = doc.offsetAt(params.position);
  const text = doc.getText();

  // Find word boundaries
  let start = offset;
  let end = offset;
  while (start > 0 && /\w/.test(text[start - 1])) start--;
  while (end < text.length && /\w/.test(text[end])) end++;
  const word = text.substring(start, end);
  if (!word) return null;

  const range = Range.create(doc.positionAt(start), doc.positionAt(end));

  // Check builtins
  const builtin = BUILTINS[word];
  if (builtin) {
    return {
      contents: {
        kind: MarkupKind.Markdown,
        value: [
          '```syma',
          builtin.signature,
          '```',
          '',
          builtin.doc,
        ].join('\n'),
      },
      range,
    };
  }

  // Check constants
  const constant = CONSTANTS[word];
  if (constant) {
    return {
      contents: {
        kind: MarkupKind.Markdown,
        value: `**${word}** — ${constant}`,
      },
      range,
    };
  }

  // Check types
  if (TYPES.includes(word)) {
    return {
      contents: {
        kind: MarkupKind.Markdown,
        value: `\`${word}\` — Syma type`,
      },
      range,
    };
  }

  // Check keywords
  if (KEYWORDS.includes(word)) {
    return {
      contents: {
        kind: MarkupKind.Markdown,
        value: `\`${word}\` — Syma keyword`,
      },
      range,
    };
  }

  return null;
});

// ─── Start ───
documents.listen(connection);
connection.listen();
