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
  DocumentSymbol,
  SymbolKind,
  DocumentSymbolParams,
  Location,
  DefinitionParams,
  SignatureHelp,
  SignatureInformation,
  ParameterInformation,
  SignatureHelpParams,
  SemanticTokens,
  SemanticTokensParams,
  SemanticTokensBuilder,
  CodeAction,
  CodeActionKind,
  CodeActionParams,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';

const SOURCE_NAME = 'syma';

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ─── Connection ───
const connection = createConnection(ProposedFeatures.all);
const documents = new TextDocuments(TextDocument);

// ─── Settings ───
interface SymaSettings {
  serverPath: string;
  serverTrace: string;
  diagnosticsEnabled: boolean;
  diagnosticsDelay: number;
}

let globalSettings: SymaSettings = {
  serverPath: '',
  serverTrace: 'off',
  diagnosticsEnabled: true,
  diagnosticsDelay: 500,
};

connection.onDidChangeConfiguration((change) => {
  const settings = change.settings?.syma;
  if (settings) {
    globalSettings = {
      serverPath: settings.server?.path ?? '',
      serverTrace: settings.server?.trace ?? 'off',
      diagnosticsEnabled: settings.diagnostics?.enabled ?? true,
      diagnosticsDelay: settings.diagnostics?.delay ?? 500,
    };
  }
});

// ─── Find syma binary ───
function findSymaBinary(): string | null {
  if (globalSettings.serverPath && existsSync(globalSettings.serverPath)) {
    return globalSettings.serverPath;
  }
  try {
    return execSync('which syma', { encoding: 'utf-8' }).trim();
  } catch {
    return null;
  }
}

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
  'N':     { signature: 'N[expr]', doc: 'Evaluate numerically', kind: CompletionItemKind.Function },
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
  'StringStartsQ':  { signature: 'StringStartsQ[s, prefix]', doc: 'Test if string starts with prefix', kind: CompletionItemKind.Function },
  'StringEndsQ':    { signature: 'StringEndsQ[s, suffix]', doc: 'Test if string ends with suffix', kind: CompletionItemKind.Function },
  'StringMatchQ':   { signature: 'StringMatchQ[s, pattern]', doc: 'Test if string matches pattern', kind: CompletionItemKind.Function },
  'StringPadLeft':  { signature: 'StringPadLeft[s, n]', doc: 'Pad string on the left', kind: CompletionItemKind.Function },
  'StringPadRight': { signature: 'StringPadRight[s, n]', doc: 'Pad string on the right', kind: CompletionItemKind.Function },
  'StringTrim':     { signature: 'StringTrim[s]', doc: 'Remove leading/trailing whitespace', kind: CompletionItemKind.Function },
  'Characters':     { signature: 'Characters[s]', doc: 'Split string into character list', kind: CompletionItemKind.Function },
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
  'Print':          { signature: 'Print[expr, ...]', doc: 'Print to stdout', kind: CompletionItemKind.Function },
  'PrintF':         { signature: 'PrintF[fmt, args...]', doc: 'Formatted print (printf-style)', kind: CompletionItemKind.Function },
  'Write':          { signature: 'Write[stream, expr, ...]', doc: 'Write expressions to a stream', kind: CompletionItemKind.Function },
  'WriteLine':      { signature: 'WriteLine[stream, expr, ...]', doc: 'Write expressions + newline to a stream', kind: CompletionItemKind.Function },
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
  // Error handling
  'Error':  { signature: 'Error[message]', doc: 'Raise an error', kind: CompletionItemKind.Function },
  'Catch':  { signature: 'Catch[expr]', doc: 'Catch thrown values', kind: CompletionItemKind.Function },
  'Throw':  { signature: 'Throw[value]', doc: 'Throw a value for Catch', kind: CompletionItemKind.Function },
  // Attributes
  'Flat':           { signature: 'Flat', doc: 'Attribute: associative (f[f[a,b],c] => f[a,b,c])', kind: CompletionItemKind.Property },
  'Listable':       { signature: 'Listable', doc: 'Attribute: auto-thread over lists', kind: CompletionItemKind.Property },
  'Orderless':      { signature: 'Orderless', doc: 'Attribute: commutative', kind: CompletionItemKind.Property },
  'OneIdentity':    { signature: 'OneIdentity', doc: 'Attribute: f[x] => x for single arg', kind: CompletionItemKind.Property },
  'HoldAll':        { signature: 'HoldAll', doc: 'Attribute: hold all arguments unevaluated', kind: CompletionItemKind.Property },
  'HoldAllComplete': { signature: 'HoldAllComplete', doc: 'Attribute: hold all args, ignore HoldRelease', kind: CompletionItemKind.Property },
  'NumericFunction': { signature: 'NumericFunction', doc: 'Attribute: function is numeric', kind: CompletionItemKind.Property },
};

// ─── Keywords ───
const KEYWORDS = [
  'class', 'extends', 'with', 'mixin',
  'module', 'import', 'export', 'as',
  'rule', 'method', 'field', 'constructor',
  'match', 'Condition',
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
  'Object', 'Compound', 'Expr',
  'Assoc',
];

// ─── Constants ───
const CONSTANTS: Record<string, string> = {
  'True':  'Boolean true',
  'False': 'Boolean false',
  'Null':  'Null value',
  'Pi':    '3.14159265358979... (π)',
  'E':     '2.71828182845904... (Euler\'s number)',
  'I':     'Imaginary unit (√-1)',
  'Alice': 'Test constant',
};

// ─── Initialize ───
connection.onInitialize((_params: InitializeParams): InitializeResult => {
  return {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      completionProvider: {
        resolveProvider: false,
        triggerCharacters: ['.', '[', ','],
      },
      hoverProvider: true,
      documentSymbolProvider: true,
      definitionProvider: true,
      signatureHelpProvider: {
        triggerCharacters: ['(', ','],
      },
      semanticTokensProvider: {
        legend: {
          tokenTypes: [
            'class', 'method', 'function', 'property',
            'variable', 'type', 'keyword', 'namespace',
          ],
          tokenModifiers: ['declaration', 'defaultLibrary'],
        },
        full: true,
        range: false,
      },
      codeActionProvider: {
        codeActionKinds: [CodeActionKind.QuickFix],
      },
    },
  };
});

// ─── Validate with syma binary ───
function validateWithSyma(doc: TextDocument): Diagnostic[] | null {
  const symaPath = findSymaBinary();
  if (!symaPath) return null;

  const filePath = fileURLToPath(doc.uri);
  if (!filePath.endsWith('.syma')) return null;

  try {
    execSync(`"${symaPath}" --check "${filePath}"`, {
      encoding: 'utf-8',
      timeout: 5000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return []; // No errors
  } catch (err: any) {
    const stderr: string = err.stderr ?? '';
    const diagnostics: Diagnostic[] = [];

    // Parse error lines: "LexError: line:col: message" or "ParseError: line:col: message"
    // Also handles: "label: message" with "  filepath" on next line
    const lines = stderr.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Match: "LexError: 3:5: unexpected character" or "ParseError: 2:10: expected ']'"
      const match = line.match(/^(?:LexError|ParseError):\s*(\d+):(\d+):\s*(.+)$/);
      if (match) {
        const lineNum = parseInt(match[1]) - 1; // LSP is 0-based
        const colNum = parseInt(match[2]) - 1;
        const message = match[3].trim();
        diagnostics.push({
          severity: DiagnosticSeverity.Error,
          range: Range.create(
            Math.max(0, lineNum), Math.max(0, colNum),
            Math.max(0, lineNum), Math.max(0, colNum + 1)
          ),
          message,
          source: SOURCE_NAME,
        });
      }
      // Also match: "Error: line:col: message" (eval errors)
      const evalMatch = line.match(/^Error:\s*(\d+):(\d+):\s*(.+)$/);
      if (evalMatch) {
        const lineNum = parseInt(evalMatch[1]) - 1;
        const colNum = parseInt(evalMatch[2]) - 1;
        const message = evalMatch[3].trim();
        diagnostics.push({
          severity: DiagnosticSeverity.Warning,
          range: Range.create(
            Math.max(0, lineNum), Math.max(0, colNum),
            Math.max(0, lineNum), Math.max(0, colNum + 1)
          ),
          message,
          source: SOURCE_NAME,
        });
      }
    }

    return diagnostics;
  }
}

// ─── Fallback bracket-only validation ───
function validateBrackets(doc: TextDocument): Diagnostic[] {
  const text = doc.getText();
  const diagnostics: Diagnostic[] = [];

  const bracketStack: { char: string; pos: number }[] = [];
  let inString = false;
  let inComment = 0;
  let i = 0;

  const closingMap: Record<string, string> = { ')': '(', ']': '[', '}': '{' };
  const closeMap: Record<string, string> = { '(': ')', '[': ']', '{': '}', '[[': ']]', '<|': '|>' };

  while (i < text.length) {
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

    if (text[i] === '"' && !inString) { inString = true; i++; continue; }
    if (text[i] === '"' && inString) { inString = false; i++; continue; }
    if (inString) {
      if (text[i] === '\\' && i + 1 < text.length) { i += 2; continue; }
      i++;
      continue;
    }

    const ch = text[i];
    const next = i + 1 < text.length ? text[i + 1] : '';

    if (ch === '[' && next === '[') {
      bracketStack.push({ char: '[[', pos: i }); i += 2; continue;
    }
    if (ch === ']' && next === ']') {
      if (bracketStack.length > 0 && bracketStack[bracketStack.length - 1].char === '[[') {
        bracketStack.pop();
      } else {
        diagnostics.push({
          severity: DiagnosticSeverity.Error,
          range: Range.create(doc.positionAt(i), doc.positionAt(i + 2)),
          message: 'Unmatched ]]',
          source: SOURCE_NAME,
        });
      }
      i += 2; continue;
    }
    if (ch === '<' && next === '|') {
      bracketStack.push({ char: '<|', pos: i }); i += 2; continue;
    }
    if (ch === '|' && next === '>') {
      if (bracketStack.length > 0 && bracketStack[bracketStack.length - 1].char === '<|') {
        bracketStack.pop();
      } else {
        diagnostics.push({
          severity: DiagnosticSeverity.Error,
          range: Range.create(doc.positionAt(i), doc.positionAt(i + 2)),
          message: 'Unmatched |>',
          source: SOURCE_NAME,
        });
      }
      i += 2; continue;
    }

    if (ch === '(' || ch === '[' || ch === '{') {
      bracketStack.push({ char: ch, pos: i }); i++; continue;
    }
    if (ch === ')' || ch === ']' || ch === '}') {
      const expected = closingMap[ch];
      if (bracketStack.length > 0 && bracketStack[bracketStack.length - 1].char === expected) {
        bracketStack.pop();
      } else {
        diagnostics.push({
          severity: DiagnosticSeverity.Error,
          range: Range.create(doc.positionAt(i), doc.positionAt(i + 1)),
          message: `Unmatched ${ch}`,
          source: SOURCE_NAME,
        });
      }
      i++; continue;
    }
    i++;
  }

  if (inString) {
    diagnostics.push({
      severity: DiagnosticSeverity.Error,
      range: Range.create(doc.positionAt(text.length - 1), doc.positionAt(text.length)),
      message: 'Unterminated string',
      source: SOURCE_NAME,
    });
  }
  if (inComment > 0) {
    diagnostics.push({
      severity: DiagnosticSeverity.Warning,
      range: Range.create(doc.positionAt(text.length - 1), doc.positionAt(text.length)),
      message: `Unterminated block comment (${inComment} level${inComment > 1 ? 's' : ''} deep)`,
      source: SOURCE_NAME,
    });
  }
  for (const b of bracketStack) {
    diagnostics.push({
      severity: DiagnosticSeverity.Error,
      range: Range.create(doc.positionAt(b.pos), doc.positionAt(b.pos + b.char.length)),
      message: `Unmatched ${b.char} (missing ${closeMap[b.char]})`,
      source: SOURCE_NAME,
    });
  }

  return diagnostics;
}

// ─── Combined validation ───
function validateDocument(doc: TextDocument): Diagnostic[] {
  // Try syma binary first (real parse errors)
  const symaDiagnostics = validateWithSyma(doc);
  if (symaDiagnostics !== null) {
    return symaDiagnostics;
  }
  // Fallback to bracket-only check
  return validateBrackets(doc);
}

let diagnosticTimer: ReturnType<typeof setTimeout> | undefined;

documents.onDidChangeContent((change) => {
  if (!globalSettings.diagnosticsEnabled) return;
  if (diagnosticTimer) clearTimeout(diagnosticTimer);
  diagnosticTimer = setTimeout(() => {
    const diagnostics = validateDocument(change.document);
    connection.sendDiagnostics({ uri: change.document.uri, diagnostics });
  }, globalSettings.diagnosticsDelay);
});

documents.onDidClose((event) => {
  connection.sendDiagnostics({ uri: event.document.uri, diagnostics: [] });
});

documents.onDidOpen((event) => {
  if (!globalSettings.diagnosticsEnabled) return;
  const diagnostics = validateDocument(event.document);
  connection.sendDiagnostics({ uri: event.document.uri, diagnostics });
});

// ─── Completions ───
connection.onCompletion((params: TextDocumentPositionParams): CompletionItem[] => {
  const doc = documents.get(params.textDocument.uri);
  if (!doc) return [];

  // Extract prefix from word before cursor
  const offset = doc.offsetAt(params.position);
  const text = doc.getText();
  let start = offset;
  while (start > 0 && /\w/.test(text[start - 1])) start--;
  const prefix = text.substring(start, offset).toLowerCase();

  function matches(label: string): boolean {
    return label.toLowerCase().startsWith(prefix);
  }

  const items: CompletionItem[] = [];

  for (const kw of KEYWORDS) {
    if (matches(kw)) items.push({ label: kw, kind: CompletionItemKind.Keyword, detail: 'keyword' });
  }
  for (const [name, info] of Object.entries(BUILTINS)) {
    if (matches(name)) items.push({
      label: name,
      kind: info.kind,
      detail: info.signature,
      documentation: { kind: MarkupKind.Markdown, value: `**${info.signature}**\n\n${info.doc}` },
    });
  }
  for (const t of TYPES) {
    if (matches(t)) items.push({ label: t, kind: CompletionItemKind.TypeParameter, detail: 'type' });
  }
  for (const [name, desc] of Object.entries(CONSTANTS)) {
    if (matches(name)) items.push({ label: name, kind: CompletionItemKind.Value, detail: desc });
  }

  return items;
});

// onCompletionResolve not needed (resolveProvider: false)

// ─── Hover ───
connection.onHover((params: TextDocumentPositionParams): Hover | null => {
  const doc = documents.get(params.textDocument.uri);
  if (!doc) return null;

  const wordInfo = getWordAtPosition(doc, params.position);
  if (!wordInfo) return null;
  const { word, range } = wordInfo;

  const builtin = BUILTINS[word];
  if (builtin) {
    return {
      contents: { kind: MarkupKind.Markdown, value: ['```syma', builtin.signature, '```', '', builtin.doc].join('\n') },
      range,
    };
  }
  const constant = CONSTANTS[word];
  if (constant) {
    return { contents: { kind: MarkupKind.Markdown, value: `**${word}** — ${constant}` }, range };
  }
  if (TYPES.includes(word)) {
    return { contents: { kind: MarkupKind.Markdown, value: `\`${word}\` — Syma type` }, range };
  }
  if (KEYWORDS.includes(word)) {
    return { contents: { kind: MarkupKind.Markdown, value: `\`${word}\` — Syma keyword` }, range };
  }

  return null;
});

// ─── Helper: extract word at cursor ───
function getWordAtPosition(doc: TextDocument, position: Position): { word: string; range: Range } | null {
  const offset = doc.offsetAt(position);
  const text = doc.getText();
  let start = offset;
  let end = offset;
  while (start > 0 && /\w/.test(text[start - 1])) start--;
  while (end < text.length && /\w/.test(text[end])) end++;
  const word = text.substring(start, end);
  if (!word) return null;
  return { word, range: Range.create(doc.positionAt(start), doc.positionAt(end)) };
}

// ─── Document Symbols ───
connection.onDocumentSymbol((params: DocumentSymbolParams): DocumentSymbol[] => {
  const doc = documents.get(params.textDocument.uri);
  if (!doc) return [];

  const text = doc.getText();
  const lines = text.split('\n');
  const symbols: DocumentSymbol[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Class/mixin declaration
    const classMatch = line.match(/^(class|mixin)\s+(\w+)/);
    if (classMatch) {
      const isClass = classMatch[1] === 'class';
      const name = classMatch[2];
      // Scan inside for methods/fields (between braces)
      const classChildren: DocumentSymbol[] = [];
      let braceDepth = 0;
      let foundOpen = false;
      for (let j = i + 1; j < lines.length; j++) {
        for (const ch of lines[j]) {
          if (ch === '{') { braceDepth++; foundOpen = true; }
          else if (ch === '}') { braceDepth--; }
        }
        if (foundOpen && braceDepth <= 0) break; // class body ends
        if (foundOpen) {
          const methodMatch = lines[j].match(/^method\s+(\w+)/);
          if (methodMatch) {
            const mLine = j;
            const mName = methodMatch[1];
            const mCol = lines[j].indexOf(mName);
            const mRange = Range.create(mLine, mCol, mLine, mCol + mName.length);
            const mLineRange = Range.create(mLine, 0, mLine, lines[j].length);
            classChildren.push(DocumentSymbol.create(mName, 'method', SymbolKind.Method, mLineRange, mRange));
          }
          const fieldMatch = lines[j].match(/^field\s+(\w+)/);
          if (fieldMatch) {
            const fLine = j;
            const fName = fieldMatch[1];
            const fCol = lines[j].indexOf(fName);
            const fRange = Range.create(fLine, fCol, fLine, fCol + fName.length);
            const fLineRange = Range.create(fLine, 0, fLine, lines[j].length);
            classChildren.push(DocumentSymbol.create(fName, 'field', SymbolKind.Field, fLineRange, fRange));
          }
        }
      }
      const col = line.indexOf(name);
      const nameRange = Range.create(i, col, i, col + name.length);
      const lineRange = Range.create(i, 0, i, line.length);
      symbols.push(DocumentSymbol.create(name, isClass ? 'class' : 'mixin', SymbolKind.Class, lineRange, nameRange, classChildren.length > 0 ? classChildren : undefined));
      continue;
    }

    // Module declaration
    const moduleMatch = line.match(/^module\s+(\w+)/);
    if (moduleMatch) {
      const name = moduleMatch[1];
      const col = line.indexOf(name);
      const nameRange = Range.create(i, col, i, col + name.length);
      const lineRange = Range.create(i, 0, i, line.length);
      symbols.push(DocumentSymbol.create(name, 'module', SymbolKind.Module, lineRange, nameRange));
      continue;
    }

    // Rule declaration
    const ruleMatch = line.match(/^rule\s+(\w+)\s*=/);
    if (ruleMatch) {
      const name = ruleMatch[1];
      const col = line.indexOf(name);
      const nameRange = Range.create(i, col, i, col + name.length);
      const lineRange = Range.create(i, 0, i, line.length);
      symbols.push(DocumentSymbol.create(name, 'rule', SymbolKind.Function, lineRange, nameRange));
      continue;
    }

    // Function definition (lowercase word before [)
    const funcMatch = line.match(/^([a-z]\w+)\s*\[/);
    if (funcMatch) {
      const name = funcMatch[1];
      // Skip if it's a keyword
      if (KEYWORDS.includes(name)) continue;
      const col = line.indexOf(name);
      const nameRange = Range.create(i, col, i, col + name.length);
      const lineRange = Range.create(i, 0, i, line.length);
      symbols.push(DocumentSymbol.create(name, 'function', SymbolKind.Function, lineRange, nameRange));
    }
  }

  return symbols;
});

// ─── Go-to-Definition ───
connection.onDefinition((params: DefinitionParams): Location | null => {
  const doc = documents.get(params.textDocument.uri);
  if (!doc) return null;

  const wordInfo = getWordAtPosition(doc, params.position);
  if (!wordInfo) return null;

  const word = wordInfo.word;
  const text = doc.getText();
  const lines = text.split('\n');

  // Check if word is a builtin, keyword, type, or constant -- link to its definition (just show hover-like info)
  if (BUILTINS[word] || KEYWORDS.includes(word) || TYPES.includes(word) || CONSTANTS[word]) {
    return null; // No meaningful file location for builtins
  }

  // Scan for definition: class, mixin, module, rule, or function
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // class Name, mixin Name, module Name
    let m = line.match(new RegExp(`^(class|mixin|module)\\s+(${escapeRegex(word)})\\b`));
    if (m) {
      const col = line.indexOf(word);
      return { uri: params.textDocument.uri, range: Range.create(i, col, i, col + word.length) };
    }
    // rule name =
    m = line.match(new RegExp(`^rule\\s+(${escapeRegex(word)})\\s*=`));
    if (m) {
      const col = line.indexOf(word);
      return { uri: params.textDocument.uri, range: Range.create(i, col, i, col + word.length) };
    }
    // name[ (function definition)
    m = line.match(new RegExp(`^(${escapeRegex(word)})\\s*\\[`));
    if (m) {
      const col = line.indexOf(word);
      return { uri: params.textDocument.uri, range: Range.create(i, col, i, col + word.length) };
    }
  }

  return null;
});

// ─── Semantic Tokens ───
connection.languages.semanticTokens.on((params: SemanticTokensParams): SemanticTokens => {
  const doc = documents.get(params.textDocument.uri);
  if (!doc) return { data: [] };

  const text = doc.getText();
  const builder = new SemanticTokensBuilder();

  // Token type indices (matching the legend order)
  const T = { class: 0, method: 1, function: 2, property: 3, variable: 4, type: 5, keyword: 6, namespace: 7 };
  // Modifier bits
  const M = { declaration: 1, defaultLibrary: 2 };

  let inString = false;
  let inComment = 0;
  let i = 0;

  // Track context for next word
  let prevKeyword: string | null = null;

  // Incremental line tracking
  let line = 0;
  let lastNewline = -1;

  // Precompute line starts for isLineStart check
  const lineStarts: number[] = [0];
  for (let j = 0; j < text.length; j++) {
    if (text[j] === '\n') lineStarts.push(j + 1);
  }

  while (i < text.length) {
    // Skip comments
    if (!inString && text[i] === '(' && i + 1 < text.length && text[i + 1] === '*') {
      inComment++; i += 2; continue;
    }
    if (!inString && inComment > 0 && text[i] === '*' && i + 1 < text.length && text[i + 1] === ')') {
      inComment--; i += 2; continue;
    }
    if (inComment > 0) { i++; continue; }

    // Skip strings
    if (text[i] === '"' && !inString) { inString = true; i++; continue; }
    if (text[i] === '"' && inString) { inString = false; i++; continue; }
    if (inString) {
      if (text[i] === '\\' && i + 1 < text.length) { i += 2; continue; }
      i++; continue;
    }

    // Check for word start
    if (/\w/.test(text[i])) {
      const wordStart = i;
      while (i < text.length && /\w/.test(text[i])) i++;
      const word = text.substring(wordStart, i);

      // Check if the line starts with this word (definition patterns)
      const lineStart = lineStarts[line];
      const isLineStart = wordStart === lineStart || (wordStart > lineStart && /^\s+$/.test(text.substring(lineStart, wordStart)));

      let tokenType = T.variable;
      let tokenModifier = 0;

      // Classification logic
      if (prevKeyword === 'class' || prevKeyword === 'mixin') {
        tokenType = T.class;
        tokenModifier = M.declaration;
      } else if (prevKeyword === 'module') {
        tokenType = T.namespace;
        tokenModifier = M.declaration;
      } else if (prevKeyword === 'rule') {
        tokenType = T.function;
        tokenModifier = M.declaration;
      } else if (prevKeyword === 'method') {
        tokenType = T.method;
        tokenModifier = M.declaration;
      } else if (prevKeyword === 'field') {
        tokenType = T.property;
        tokenModifier = M.declaration;
      } else if (BUILTINS[word]) {
        tokenType = T.keyword;
        tokenModifier = M.defaultLibrary;
      } else if (TYPES.includes(word)) {
        tokenType = T.type;
      } else if (KEYWORDS.includes(word) || CONSTANTS[word]) {
        tokenType = T.keyword;
      } else if (isLineStart && word[0] >= 'a' && word[0] <= 'z' && i < text.length && text[i] === '[') {
        // Function definition: lowercase word at line start before [
        tokenType = T.function;
        tokenModifier = M.declaration;
      }

      builder.push(line,
                   wordStart - lastNewline - 1,
                   word.length, tokenType, tokenModifier);

      // Track keyword context for next word
      const lowerWord = word.toLowerCase();
      if (['class', 'mixin', 'module', 'rule', 'method', 'field'].includes(lowerWord)) {
        // Check it's used as a keyword (at line start or after whitespace)
        if (isLineStart) {
          prevKeyword = lowerWord;
        } else {
          prevKeyword = null;
        }
      } else {
        prevKeyword = null;
      }
    } else {
      if (text[i] === '\n') {
        line++;
        lastNewline = i;
      }
      i++;
    }
  }

  return builder.build();
});

// ─── Code Actions ───
connection.onCodeAction((params: CodeActionParams): CodeAction[] => {
  const actions: CodeAction[] = [];

  for (const diagnostic of params.context.diagnostics) {
    // Unmatched opening bracket: offer to insert closing bracket
    const openBracket = diagnostic.message.match(/^Unmatched (\S+) \(missing (\S+)\)$/);
    if (openBracket) {
      const missing = openBracket[2];
      actions.push({
        title: `Insert ${missing}`,
        kind: CodeActionKind.QuickFix,
        edit: {
          changes: {
            [params.textDocument.uri]: [
              {
                range: Range.create(diagnostic.range.end, diagnostic.range.end),
                newText: missing,
              },
            ],
          },
        },
        diagnostics: [diagnostic],
        isPreferred: true,
      });
      continue;
    }

    // Unmatched closing bracket: offer to remove it
    const closeMatch = diagnostic.message.match(/^Unmatched (\)|\]|\}|>>?|]]|\|>)$/);
    if (closeMatch) {
      actions.push({
        title: `Remove ${closeMatch[1]}`,
        kind: CodeActionKind.QuickFix,
        edit: {
          changes: {
            [params.textDocument.uri]: [
              { range: diagnostic.range, newText: '' },
            ],
          },
        },
        diagnostics: [diagnostic],
      });
      continue;
    }

    // Unterminated string: offer to add closing quote
    if (diagnostic.message === 'Unterminated string') {
      actions.push({
        title: 'Add closing quote',
        kind: CodeActionKind.QuickFix,
        edit: {
          changes: {
            [params.textDocument.uri]: [
              {
                range: Range.create(diagnostic.range.end, diagnostic.range.end),
                newText: '"',
              },
            ],
          },
        },
        diagnostics: [diagnostic],
      });
      continue;
    }

    // Unterminated block comment: offer to close it
    if (diagnostic.message.startsWith('Unterminated block comment')) {
      actions.push({
        title: 'Close block comment',
        kind: CodeActionKind.QuickFix,
        edit: {
          changes: {
            [params.textDocument.uri]: [
              {
                range: Range.create(diagnostic.range.end, diagnostic.range.end),
                newText: '*)',
              },
            ],
          },
        },
        diagnostics: [diagnostic],
      });
      continue;
    }
  }

  return actions;
});

// ─── Helper: extract params from signature ───
function extractParameters(signature: string): string[] {
  // Given "Table[expr, {i, min, max}]", extract ["expr", "{i, min, max}"]
  const match = signature.match(/^\w+\[(.+)\]$/);
  if (!match) return [];
  const params: string[] = [];
  let depth = 0;
  let current = '';
  for (const ch of match[1]) {
    if ((ch === ',' || ch === ';') && depth === 0) {
      params.push(current.trim());
      current = '';
    } else {
      if (ch === '{' || ch === '(' || ch === '[') depth++;
      if (ch === '}' || ch === ')' || ch === ']') depth--;
      current += ch;
    }
  }
  if (current.trim()) params.push(current.trim());
  return params;
}

// ─── Signature Help ───
connection.onSignatureHelp((params: SignatureHelpParams): SignatureHelp | null => {
  const doc = documents.get(params.textDocument.uri);
  if (!doc) return null;

  const text = doc.getText();
  const offset = doc.offsetAt(params.position);

  // Walk backwards from cursor to find function name before '['
  // Use separate squareDepth to handle nested brackets correctly
  let squareDepth = 0;
  let funcEnd = -1;

  for (let i = offset - 1; i >= 0; i--) {
    const ch = text[i];
    if (ch === ']') {
      squareDepth++;
    } else if (ch === '[') {
      if (squareDepth === 0) {
        funcEnd = i;
        break;
      }
      squareDepth--;
    }
  }

  if (funcEnd < 0) return null;

  // Walk back from funcEnd to find the word before it (function name)
  let nameStart = funcEnd;
  while (nameStart > 0 && /\w/.test(text[nameStart - 1])) nameStart--;
  if (nameStart === funcEnd) return null; // No word before bracket

  const funcName = text.substring(nameStart, funcEnd);

  // Look up in BUILTINS
  const builtin = BUILTINS[funcName];
  if (!builtin) return null;

  const params_list = extractParameters(builtin.signature);
  const paramInfo: ParameterInformation[] = params_list.map(p =>
    ParameterInformation.create(p)
  );

  // Count commas to find active parameter
  let activeParam = 0;
  let commaDepth = 0;
  for (let i = funcEnd + 1; i < offset; i++) {
    const ch = text[i];
    if (ch === ')' || ch === ']' || ch === '}') {
      commaDepth--;
    } else if (ch === '(' || ch === '[' || ch === '{') {
      commaDepth++;
    } else if (ch === ',' && commaDepth === 0) {
      activeParam++;
    }
  }

  const signatureInfo = SignatureInformation.create(
    builtin.signature,
    builtin.doc,
    ...paramInfo
  );

  return {
    signatures: [signatureInfo],
    activeSignature: 0,
    activeParameter: Math.min(activeParam, Math.max(0, paramInfo.length - 1)),
  };
});

// ─── Start ───
documents.listen(connection);
connection.listen();
