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
  FoldingRange,
  FoldingRangeKind,
  FoldingRangeParams,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { execSync, spawnSync } from 'child_process';
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
  // Try SYMA_HOME env var (cross-platform)
  const symaHome = process.env.SYMA_HOME;
  if (symaHome) {
    const binPath = require('path').join(symaHome, 'bin', process.platform === 'win32' ? 'syma.exe' : 'syma');
    if (existsSync(binPath)) return binPath;
  }
  // Try `which syma` on Unix-like systems
  try {
    return execSync('which syma', { encoding: 'utf-8' }).trim();
  } catch {}
  // Try `where syma` on Windows
  if (process.platform === 'win32') {
    try {
      return execSync('where syma', { encoding: 'utf-8' }).trim().split('\n')[0].trim();
    } catch {}
  }
  return null;
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
  'Cot':   { signature: 'Cot[x]', doc: 'Trigonometric cotangent', kind: CompletionItemKind.Function },
  'Csc':   { signature: 'Csc[x]', doc: 'Trigonometric cosecant', kind: CompletionItemKind.Function },
  'Sec':   { signature: 'Sec[x]', doc: 'Trigonometric secant', kind: CompletionItemKind.Function },
  'ArcCot': { signature: 'ArcCot[x]', doc: 'Inverse cotangent', kind: CompletionItemKind.Function },
  'ArcCsc': { signature: 'ArcCsc[x]', doc: 'Inverse cosecant', kind: CompletionItemKind.Function },
  'ArcSec': { signature: 'ArcSec[x]', doc: 'Inverse secant', kind: CompletionItemKind.Function },
  // Hyperbolic
  'Sinh':  { signature: 'Sinh[x]', doc: 'Hyperbolic sine', kind: CompletionItemKind.Function },
  'Cosh':  { signature: 'Cosh[x]', doc: 'Hyperbolic cosine', kind: CompletionItemKind.Function },
  'Tanh':  { signature: 'Tanh[x]', doc: 'Hyperbolic tangent', kind: CompletionItemKind.Function },
  'Csch':  { signature: 'Csch[x]', doc: 'Hyperbolic cosecant', kind: CompletionItemKind.Function },
  'Sech':  { signature: 'Sech[x]', doc: 'Hyperbolic secant', kind: CompletionItemKind.Function },
  'Coth':  { signature: 'Coth[x]', doc: 'Hyperbolic cotangent', kind: CompletionItemKind.Function },
  'ArcSinh': { signature: 'ArcSinh[x]', doc: 'Inverse hyperbolic sine', kind: CompletionItemKind.Function },
  'ArcCosh': { signature: 'ArcCosh[x]', doc: 'Inverse hyperbolic cosine', kind: CompletionItemKind.Function },
  'ArcTanh': { signature: 'ArcTanh[x]', doc: 'Inverse hyperbolic tangent', kind: CompletionItemKind.Function },
  'ArcCsch': { signature: 'ArcCsch[x]', doc: 'Inverse hyperbolic cosecant', kind: CompletionItemKind.Function },
  'ArcSech': { signature: 'ArcSech[x]', doc: 'Inverse hyperbolic secant', kind: CompletionItemKind.Function },
  'ArcCoth': { signature: 'ArcCoth[x]', doc: 'Inverse hyperbolic cotangent', kind: CompletionItemKind.Function },
  // Trig extended
  'Sinc':        { signature: 'Sinc[x]', doc: 'Normalized sinc function', kind: CompletionItemKind.Function },
  'Haversine':   { signature: 'Haversine[x]', doc: 'Haversine of angle (radians)', kind: CompletionItemKind.Function },
  'InverseHaversine': { signature: 'InverseHaversine[x]', doc: 'Inverse haversine', kind: CompletionItemKind.Function },
  // Degree variants
  'SinDegrees':  { signature: 'SinDegrees[θ]', doc: 'Sine with angle in degrees', kind: CompletionItemKind.Function },
  'CosDegrees':  { signature: 'CosDegrees[θ]', doc: 'Cosine with angle in degrees', kind: CompletionItemKind.Function },
  'TanDegrees':  { signature: 'TanDegrees[θ]', doc: 'Tangent with angle in degrees', kind: CompletionItemKind.Function },
  'CscDegrees':  { signature: 'CscDegrees[θ]', doc: 'Cosecant with angle in degrees', kind: CompletionItemKind.Function },
  'SecDegrees':  { signature: 'SecDegrees[θ]', doc: 'Secant with angle in degrees', kind: CompletionItemKind.Function },
  'CotDegrees':  { signature: 'CotDegrees[θ]', doc: 'Cotangent with angle in degrees', kind: CompletionItemKind.Function },
  'ArcSinDegrees':  { signature: 'ArcSinDegrees[x]', doc: 'Inverse sine, result in degrees', kind: CompletionItemKind.Function },
  'ArcCosDegrees':  { signature: 'ArcCosDegrees[x]', doc: 'Inverse cosine, result in degrees', kind: CompletionItemKind.Function },
  'ArcTanDegrees':  { signature: 'ArcTanDegrees[x]', doc: 'Inverse tangent, result in degrees', kind: CompletionItemKind.Function },
  'ArcCscDegrees':  { signature: 'ArcCscDegrees[x]', doc: 'Inverse cosecant, result in degrees', kind: CompletionItemKind.Function },
  'ArcSecDegrees':  { signature: 'ArcSecDegrees[x]', doc: 'Inverse secant, result in degrees', kind: CompletionItemKind.Function },
  'ArcCotDegrees':  { signature: 'ArcCotDegrees[x]', doc: 'Inverse cotangent, result in degrees', kind: CompletionItemKind.Function },
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
  // Math extended
  'Gamma':           { signature: 'Gamma[z]', doc: 'Gamma function', kind: CompletionItemKind.Function },
  'IntegerPart':     { signature: 'IntegerPart[x]', doc: 'Integer part of number', kind: CompletionItemKind.Function },
  'FractionalPart':  { signature: 'FractionalPart[x]', doc: 'Fractional part of number', kind: CompletionItemKind.Function },
  'Sign':            { signature: 'Sign[x]', doc: 'Sign of number (-1, 0, or 1)', kind: CompletionItemKind.Function },
  'UnitStep':        { signature: 'UnitStep[x]', doc: 'Heaviside step function', kind: CompletionItemKind.Function },
  'Clip':            { signature: 'Clip[x, {min, max}]', doc: 'Clip value to range', kind: CompletionItemKind.Function },
  'Rescale':         { signature: 'Rescale[x]', doc: 'Rescale to 0-1 range', kind: CompletionItemKind.Function },
  'Quotient':        { signature: 'Quotient[m, n]', doc: 'Integer quotient', kind: CompletionItemKind.Function },
  'QuotientRemainder': { signature: 'QuotientRemainder[m, n]', doc: 'Quotient and remainder', kind: CompletionItemKind.Function },
  'KroneckerDelta':  { signature: 'KroneckerDelta[i, j]', doc: '1 if i==j, 0 otherwise', kind: CompletionItemKind.Function },
  'IntegerQ':        { signature: 'IntegerQ[expr]', doc: 'Test if expression is integer', kind: CompletionItemKind.Function },
  'Chop':            { signature: 'Chop[expr]', doc: 'Replace tiny real parts with 0', kind: CompletionItemKind.Function },
  'Unitize':         { signature: 'Unitize[x]', doc: 'Normalize to unit magnitude', kind: CompletionItemKind.Function },
  'Ramp':            { signature: 'Ramp[x]', doc: '0 for x<0, x otherwise', kind: CompletionItemKind.Function },
  'RealAbs':         { signature: 'RealAbs[x]', doc: 'Real-valued absolute value', kind: CompletionItemKind.Function },
  'RealSign':        { signature: 'RealSign[x]', doc: 'Real-valued sign function', kind: CompletionItemKind.Function },
  'LogisticSigmoid': { signature: 'LogisticSigmoid[x]', doc: 'Sigmoid function 1/(1+e^-x)', kind: CompletionItemKind.Function },
  'NumericalOrder':  { signature: 'NumericalOrder[a, b]', doc: 'Numerical ordering comparison', kind: CompletionItemKind.Function },
  'UnitBox':         { signature: 'UnitBox[x]', doc: 'Box function (1 for |x|<0.5)', kind: CompletionItemKind.Function },
  'UnitTriangle':    { signature: 'UnitTriangle[x]', doc: 'Triangle function', kind: CompletionItemKind.Function },
  // Arithmetic
  'Plus':  { signature: 'Plus[a, b, ...]', doc: 'Addition (also a + b)', kind: CompletionItemKind.Operator },
  'Times': { signature: 'Times[a, b, ...]', doc: 'Multiplication (also a * b)', kind: CompletionItemKind.Operator },
  'Divide': { signature: 'Divide[a, b]', doc: 'Division (also a / b)', kind: CompletionItemKind.Operator },
  'Minus': { signature: 'Minus[x]', doc: 'Negation (also -x)', kind: CompletionItemKind.Operator },
  'Sum':   { signature: 'Sum[expr, {i, min, max}]', doc: 'Summation', kind: CompletionItemKind.Function },
  'Total': { signature: 'Total[list]', doc: 'Sum all elements', kind: CompletionItemKind.Function },
  'Product': { signature: 'Product[expr, {i, min, max}]', doc: 'Product of terms', kind: CompletionItemKind.Function },
  // Non-commutative
  'NonCommutativeMultiply': { signature: 'NonCommutativeMultiply[a, b]', doc: 'Non-commutative multiplication (a ** b)', kind: CompletionItemKind.Operator },
  'Commutator':    { signature: 'Commutator[a, b]', doc: 'Commutator [a,b] = ab-ba', kind: CompletionItemKind.Function },
  'Anticommutator': { signature: 'Anticommutator[a, b]', doc: 'Anticommutator {a,b} = ab+ba', kind: CompletionItemKind.Function },
  // Number theory
  'PrimeQ':       { signature: 'PrimeQ[n]', doc: 'Test if n is prime', kind: CompletionItemKind.Function },
  'FactorInteger': { signature: 'FactorInteger[n]', doc: 'Prime factorization', kind: CompletionItemKind.Function },
  'Divisors':     { signature: 'Divisors[n]', doc: 'List of divisors', kind: CompletionItemKind.Function },
  'Prime':        { signature: 'Prime[n]', doc: 'nth prime number', kind: CompletionItemKind.Function },
  'PrimePi':      { signature: 'PrimePi[x]', doc: 'Prime-counting function', kind: CompletionItemKind.Function },
  'NextPrime':    { signature: 'NextPrime[n]', doc: 'Next prime after n', kind: CompletionItemKind.Function },
  'PowerMod':     { signature: 'PowerMod[b, e, m]', doc: 'Modular exponentiation', kind: CompletionItemKind.Function },
  'EulerPhi':     { signature: 'EulerPhi[n]', doc: 'Euler totient function', kind: CompletionItemKind.Function },
  'MoebiusMu':    { signature: 'MoebiusMu[n]', doc: 'Möbius function', kind: CompletionItemKind.Function },
  'DivisorSigma': { signature: 'DivisorSigma[k, n]', doc: 'Sum of kth powers of divisors', kind: CompletionItemKind.Function },
  'Divisible':    { signature: 'Divisible[m, n]', doc: 'Test if m is divisible by n', kind: CompletionItemKind.Function },
  'CoprimeQ':     { signature: 'CoprimeQ[a, b]', doc: 'Test if a and b are coprime', kind: CompletionItemKind.Function },
  'IntegerDigits': { signature: 'IntegerDigits[n]', doc: 'Digits of integer', kind: CompletionItemKind.Function },
  'PrimeOmega':   { signature: 'PrimeOmega[n]', doc: 'Total prime factors (with multiplicity)', kind: CompletionItemKind.Function },
  'PrimeNu':      { signature: 'PrimeNu[n]', doc: 'Distinct prime factors count', kind: CompletionItemKind.Function },
  'DigitCount':   { signature: 'DigitCount[n]', doc: 'Number of digits', kind: CompletionItemKind.Function },
  'JacobiSymbol': { signature: 'JacobiSymbol[a, n]', doc: 'Jacobi symbol', kind: CompletionItemKind.Function },
  'PrimitiveRoot': { signature: 'PrimitiveRoot[n]', doc: 'Smallest primitive root mod n', kind: CompletionItemKind.Function },
  // Calculus
  'D':         { signature: 'D[expr, x]', doc: 'Symbolic derivative d/dx', kind: CompletionItemKind.Function },
  'Integrate': { signature: 'Integrate[expr, x]', doc: 'Symbolic integral', kind: CompletionItemKind.Function },
  'Simplify':  { signature: 'Simplify[expr]', doc: 'Apply simplification rules', kind: CompletionItemKind.Function },
  'Expand':    { signature: 'Expand[expr]', doc: 'Expand products', kind: CompletionItemKind.Function },
  'Factor':    { signature: 'Factor[expr]', doc: 'Factor polynomials', kind: CompletionItemKind.Function },
  'Solve':     { signature: 'Solve[eqn, x]', doc: 'Solve equation symbolically', kind: CompletionItemKind.Function },
  'Series':    { signature: 'Series[expr, {x, x0, n}]', doc: 'Taylor series expansion', kind: CompletionItemKind.Function },
  // Discrete math
  'DiscreteDelta':    { signature: 'DiscreteDelta[i, j]', doc: 'Discrete delta (1 if i==j)', kind: CompletionItemKind.Function },
  'DiscreteShift':    { signature: 'DiscreteShift[f, n]', doc: 'Shift operator', kind: CompletionItemKind.Function },
  'DiscreteRatio':    { signature: 'DiscreteRatio[f, n]', doc: 'Discrete ratio f(n+1)/f(n)', kind: CompletionItemKind.Function },
  'FactorialPower':   { signature: 'FactorialPower[n, k]', doc: 'Rising/falling factorial', kind: CompletionItemKind.Function },
  'BernoulliB':       { signature: 'BernoulliB[n]', doc: 'Bernoulli number', kind: CompletionItemKind.Function },
  'LinearRecurrence': { signature: 'LinearRecurrence[coeffs, defs, n]', doc: 'Linear recurrence sequence', kind: CompletionItemKind.Function },
  'RecurrenceTable':  { signature: 'RecurrenceTable[eq, var, {n}]', doc: 'Table of recurrence values', kind: CompletionItemKind.Function },
  'Dispatch':         { signature: 'Dispatch[expr]', doc: 'Dispatch on expression head', kind: CompletionItemKind.Function },
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
  // List extended
  'Partition':        { signature: 'Partition[list, n]', doc: 'Partition into sublists', kind: CompletionItemKind.Function },
  'Split':            { signature: 'Split[list]', doc: 'Split by equality', kind: CompletionItemKind.Function },
  'Gather':           { signature: 'Gather[list]', doc: 'Gather equal elements', kind: CompletionItemKind.Function },
  'DeleteDuplicates': { signature: 'DeleteDuplicates[list]', doc: 'Remove duplicates', kind: CompletionItemKind.Function },
  'Insert':           { signature: 'Insert[list, elem, pos]', doc: 'Insert element at position', kind: CompletionItemKind.Function },
  'Delete':           { signature: 'Delete[list, pos]', doc: 'Delete element at position', kind: CompletionItemKind.Function },
  'ReplacePart':      { signature: 'ReplacePart[list, pos, new]', doc: 'Replace part at position', kind: CompletionItemKind.Function },
  'RotateLeft':       { signature: 'RotateLeft[list, n]', doc: 'Rotate elements left', kind: CompletionItemKind.Function },
  'RotateRight':      { signature: 'RotateRight[list, n]', doc: 'Rotate elements right', kind: CompletionItemKind.Function },
  'Ordering':         { signature: 'Ordering[list]', doc: 'Positions that would sort list', kind: CompletionItemKind.Function },
  'ConstantArray':    { signature: 'ConstantArray[elem, len]', doc: 'Array of repeated element', kind: CompletionItemKind.Function },
  'Diagonal':         { signature: 'Diagonal[matrix]', doc: 'Main diagonal elements', kind: CompletionItemKind.Function },
  'Accumulate':       { signature: 'Accumulate[list]', doc: 'Running totals', kind: CompletionItemKind.Function },
  'Differences':      { signature: 'Differences[list]', doc: 'Differences of consecutive elements', kind: CompletionItemKind.Function },
  'MovingAverage':    { signature: 'MovingAverage[list, n]', doc: 'Moving average of window n', kind: CompletionItemKind.Function },
  'ListConvolve':     { signature: 'ListConvolve[kernel, list]', doc: 'List convolution', kind: CompletionItemKind.Function },
  'Nearest':          { signature: 'Nearest[list, x]', doc: 'Find nearest elements to x', kind: CompletionItemKind.Function },
  'Apply':            { signature: 'Apply[f, expr]', doc: 'Apply f at level 1 (also f @@ expr)', kind: CompletionItemKind.Function },
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
  // String extended
  'StringPart':              { signature: 'StringPart[s, n]', doc: 'Extract substring', kind: CompletionItemKind.Function },
  'StringPosition':          { signature: 'StringPosition[s, sub]', doc: 'Position of substring', kind: CompletionItemKind.Function },
  'StringCount':             { signature: 'StringCount[s, sub]', doc: 'Count substring occurrences', kind: CompletionItemKind.Function },
  'StringRepeat':            { signature: 'StringRepeat[s, n]', doc: 'Repeat string n times', kind: CompletionItemKind.Function },
  'StringDelete':            { signature: 'StringDelete[s, sub]', doc: 'Delete substring', kind: CompletionItemKind.Function },
  'StringInsert':            { signature: 'StringInsert[s, sub, pos]', doc: 'Insert substring at position', kind: CompletionItemKind.Function },
  'StringRiffle':            { signature: 'StringRiffle[list, sep]', doc: 'Join strings with separator', kind: CompletionItemKind.Function },
  'StringFreeQ':             { signature: 'StringFreeQ[s, sub]', doc: 'Test if substring absent', kind: CompletionItemKind.Function },
  'LetterQ':                 { signature: 'LetterQ[s]', doc: 'Test if all characters are letters', kind: CompletionItemKind.Function },
  'DigitQ':                  { signature: 'DigitQ[s]', doc: 'Test if all characters are digits', kind: CompletionItemKind.Function },
  'UpperCaseQ':              { signature: 'UpperCaseQ[s]', doc: 'Test if string is uppercase', kind: CompletionItemKind.Function },
  'LowerCaseQ':              { signature: 'LowerCaseQ[s]', doc: 'Test if string is lowercase', kind: CompletionItemKind.Function },
  'TextWords':               { signature: 'TextWords[s]', doc: 'Extract words from text', kind: CompletionItemKind.Function },
  'CharacterCounts':         { signature: 'CharacterCounts[s]', doc: 'Count each character', kind: CompletionItemKind.Function },
  'Alphabet':                { signature: 'Alphabet[]', doc: 'List of alphabet letters', kind: CompletionItemKind.Function },
  'ToCharacterCode':         { signature: 'ToCharacterCode[s]', doc: 'String to character codes', kind: CompletionItemKind.Function },
  'FromCharacterCode':       { signature: 'FromCharacterCode[codes]', doc: 'Character codes to string', kind: CompletionItemKind.Function },
  'EditDistance':            { signature: 'EditDistance[s1, s2]', doc: 'Levenshtein distance', kind: CompletionItemKind.Function },
  'LongestCommonSubsequence': { signature: 'LongestCommonSubsequence[s1, s2]', doc: 'Longest common subsequence', kind: CompletionItemKind.Function },
  'LongestCommonSubString':  { signature: 'LongestCommonSubString[s1, s2]', doc: 'Longest common substring', kind: CompletionItemKind.Function },
  'WordCount':               { signature: 'WordCount[s]', doc: 'Count words in text', kind: CompletionItemKind.Function },
  'SentenceCount':           { signature: 'SentenceCount[s]', doc: 'Count sentences in text', kind: CompletionItemKind.Function },
  // Association
  'Keys':       { signature: 'Keys[assoc]', doc: 'List of keys', kind: CompletionItemKind.Function },
  'Values':     { signature: 'Values[assoc]', doc: 'List of values', kind: CompletionItemKind.Function },
  'Lookup':     { signature: 'Lookup[assoc, key]', doc: 'Lookup with default', kind: CompletionItemKind.Function },
  'KeyExistsQ': { signature: 'KeyExistsQ[assoc, key]', doc: 'Test if key exists', kind: CompletionItemKind.Function },
  'AssociationQ': { signature: 'AssociationQ[expr]', doc: 'Test if expression is an association', kind: CompletionItemKind.Function },
  'Normal':        { signature: 'Normal[assoc]', doc: 'Convert to list of rules', kind: CompletionItemKind.Function },
  'KeySort':       { signature: 'KeySort[assoc]', doc: 'Sort association by keys', kind: CompletionItemKind.Function },
  'KeyTake':       { signature: 'KeyTake[assoc, keys]', doc: 'Take keys from association', kind: CompletionItemKind.Function },
  'KeyDrop':       { signature: 'KeyDrop[assoc, keys]', doc: 'Drop keys from association', kind: CompletionItemKind.Function },
  'KeyMemberQ':    { signature: 'KeyMemberQ[assoc, key]', doc: 'Test if key is a member', kind: CompletionItemKind.Function },
  'KeyFreeQ':      { signature: 'KeyFreeQ[assoc, key]', doc: 'Test if key is absent', kind: CompletionItemKind.Function },
  'AssociateTo':   { signature: 'AssociateTo[assoc, key->val]', doc: 'Update association in place', kind: CompletionItemKind.Function },
  'KeyDropFrom':   { signature: 'KeyDropFrom[assoc, key]', doc: 'Drop key from association in place', kind: CompletionItemKind.Function },
  'Counts':        { signature: 'Counts[list]', doc: 'Count occurrences as association', kind: CompletionItemKind.Function },
  'KeyUnion':      { signature: 'KeyUnion[assoc1, assoc2]', doc: 'Union of keys', kind: CompletionItemKind.Function },
  'KeyComplement': { signature: 'KeyComplement[assoc1, assoc2]', doc: 'Keys in assoc1 not in assoc2', kind: CompletionItemKind.Function },
  // IO extended
  'WriteString':   { signature: 'WriteString[stream, str]', doc: 'Write string to stream', kind: CompletionItemKind.Function },
  'ReadString':    { signature: 'ReadString[stream]', doc: 'Read string from stream', kind: CompletionItemKind.Function },
  'Export':        { signature: 'Export[file, expr]', doc: 'Export expression to file', kind: CompletionItemKind.Function },
  'Import':        { signature: 'Import[file]', doc: 'Import data from file', kind: CompletionItemKind.Function },
  'ImportString':  { signature: 'ImportString[str]', doc: 'Import from string', kind: CompletionItemKind.Function },
  'ExportString':  { signature: 'ExportString[format, expr]', doc: 'Export expression to string', kind: CompletionItemKind.Function },
  'ReadList':      { signature: 'ReadList[file]', doc: 'Read file as list', kind: CompletionItemKind.Function },
  'FileRead':      { signature: 'FileRead[file]', doc: 'Read entire file', kind: CompletionItemKind.Function },
  'FileWrite':     { signature: 'FileWrite[file, data]', doc: 'Write data to file', kind: CompletionItemKind.Function },
  'RunProcess':    { signature: 'RunProcess[cmd]', doc: 'Run external process', kind: CompletionItemKind.Function },
  // Dataset
  'Dataset':   { signature: 'Dataset[assoc]', doc: 'Create structured dataset', kind: CompletionItemKind.Function },
  'DatasetQ':  { signature: 'DatasetQ[expr]', doc: 'Test if expression is a dataset', kind: CompletionItemKind.Function },
  'JoinAcross': { signature: 'JoinAcross[data1, key1, data2, key2]', doc: 'Join datasets on keys', kind: CompletionItemKind.Function },
  // Message
  'Message':     { signature: 'Message[tag]', doc: 'Display message', kind: CompletionItemKind.Function },
  'MessageName': { signature: 'MessageName[context, sym]', doc: 'Create message name', kind: CompletionItemKind.Function },
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
  // Logic extended
  'Xor':         { signature: 'Xor[a, b]', doc: 'Exclusive OR', kind: CompletionItemKind.Operator },
  'Nand':        { signature: 'Nand[a, b]', doc: 'NAND (NOT AND)', kind: CompletionItemKind.Operator },
  'Nor':         { signature: 'Nor[a, b]', doc: 'NOR (NOT OR)', kind: CompletionItemKind.Operator },
  'Equivalent':  { signature: 'Equivalent[a, b]', doc: 'Logical equivalence', kind: CompletionItemKind.Operator },
  'Implies':     { signature: 'Implies[a, b]', doc: 'Logical implication', kind: CompletionItemKind.Operator },
  'Majority':    { signature: 'Majority[a, b, ...]', doc: 'Majority function', kind: CompletionItemKind.Function },
  'Boole':       { signature: 'Boole[cond]', doc: 'Convert condition to True/False', kind: CompletionItemKind.Function },
  'BooleanQ':    { signature: 'BooleanQ[expr]', doc: 'Test if expression is boolean', kind: CompletionItemKind.Function },
  // Filesystem
  'FileNameSplit':  { signature: 'FileNameSplit[name]', doc: 'Split file path', kind: CompletionItemKind.Function },
  'FileNameJoin':   { signature: 'FileNameJoin[parts]', doc: 'Join path parts', kind: CompletionItemKind.Function },
  'FileNameTake':   { signature: 'FileNameTake[name, n]', doc: 'Take last n path components', kind: CompletionItemKind.Function },
  'FileNameDrop':   { signature: 'FileNameDrop[name, n]', doc: 'Drop n path components', kind: CompletionItemKind.Function },
  'FileBaseName':   { signature: 'FileBaseName[name]', doc: 'Base name without extension', kind: CompletionItemKind.Function },
  'FileExtension':  { signature: 'FileExtension[name]', doc: 'File extension', kind: CompletionItemKind.Function },
  'FileNameDepth':  { signature: 'FileNameDepth[name]', doc: 'Number of path components', kind: CompletionItemKind.Function },
  'DirectoryName':  { signature: 'DirectoryName[name]', doc: 'Parent directory', kind: CompletionItemKind.Function },
  'ParentDirectory': { signature: 'ParentDirectory[name]', doc: 'Parent directory', kind: CompletionItemKind.Function },
  'ExpandFileName': { signature: 'ExpandFileName[name]', doc: 'Expand ~ and environment vars', kind: CompletionItemKind.Function },
  'FileExistsQ':    { signature: 'FileExistsQ[name]', doc: 'Test if file exists', kind: CompletionItemKind.Function },
  'DirectoryQ':     { signature: 'DirectoryQ[name]', doc: 'Test if path is directory', kind: CompletionItemKind.Function },
  'FileNames':      { signature: 'FileNames[pattern]', doc: 'List files matching pattern', kind: CompletionItemKind.Function },
  // Format
  'InputForm':      { signature: 'InputForm[expr]', doc: 'Input-form string', kind: CompletionItemKind.Function },
  'FullForm':       { signature: 'FullForm[expr]', doc: 'Full internal form', kind: CompletionItemKind.Function },
  'Short':          { signature: 'Short[expr, n]', doc: 'Short output (n lines max)', kind: CompletionItemKind.Function },
  'Shallow':        { signature: 'Shallow[expr]', doc: 'Shallow output display', kind: CompletionItemKind.Function },
  'NumberForm':     { signature: 'NumberForm[x, {b, p}]', doc: 'Number in base b with precision p', kind: CompletionItemKind.Function },
  'ScientificForm': { signature: 'ScientificForm[x]', doc: 'Scientific notation', kind: CompletionItemKind.Function },
  'BaseForm':       { signature: 'BaseForm[x, b]', doc: 'Number in base b', kind: CompletionItemKind.Function },
  'Grid':           { signature: 'Grid[matrix]', doc: 'Display as grid', kind: CompletionItemKind.Function },
  'Defer':          { signature: 'Defer[expr]', doc: 'Hold expression unevaluated', kind: CompletionItemKind.Function },
  'SyntaxQ':        { signature: 'SyntaxQ[str]', doc: 'Test if string is valid syntax', kind: CompletionItemKind.Function },
  'SyntaxLength':   { signature: 'SyntaxLength[expr]', doc: 'Length of syntax tree', kind: CompletionItemKind.Function },
  // Parallel
  'ParallelTable':     { signature: 'ParallelTable[expr, {i, min, max}]', doc: 'Parallel Table', kind: CompletionItemKind.Function },
  'ParallelSum':       { signature: 'ParallelSum[expr, {i, min, max}]', doc: 'Parallel Sum', kind: CompletionItemKind.Function },
  'ParallelEvaluate':  { signature: 'ParallelEvaluate[expr]', doc: 'Evaluate in parallel kernels', kind: CompletionItemKind.Function },
  'ParallelTry':       { signature: 'ParallelTry[expr]', doc: 'First successful parallel result', kind: CompletionItemKind.Function },
  'ParallelProduct':   { signature: 'ParallelProduct[expr, {i, min, max}]', doc: 'Parallel Product', kind: CompletionItemKind.Function },
  'ParallelDo':        { signature: 'ParallelDo[body, {i, min, max}]', doc: 'Parallel Do loop', kind: CompletionItemKind.Function },
  'LaunchKernels':     { signature: 'LaunchKernels[n]', doc: 'Launch n parallel kernels', kind: CompletionItemKind.Function },
  'CloseKernels':      { signature: 'CloseKernels[]', doc: 'Close all kernels', kind: CompletionItemKind.Function },
  'KernelCount':       { signature: 'KernelCount[]', doc: 'Number of active kernels', kind: CompletionItemKind.Function },
  'ProcessorCount':    { signature: 'ProcessorCount[]', doc: 'Number of CPU cores', kind: CompletionItemKind.Function },
  'AbortKernels':      { signature: 'AbortKernels[]', doc: 'Abort all kernel computations', kind: CompletionItemKind.Function },
  // Image
  'Image':              { signature: 'Image[data]', doc: 'Create image from data', kind: CompletionItemKind.Function },
  'ImageData':          { signature: 'ImageData[img]', doc: 'Extract pixel data', kind: CompletionItemKind.Function },
  'ImageDimensions':    { signature: 'ImageDimensions[img]', doc: 'Image width and height', kind: CompletionItemKind.Function },
  'ImageType':          { signature: 'ImageType[img]', doc: 'Image color type', kind: CompletionItemKind.Function },
  'ImageResize':        { signature: 'ImageResize[img, {w, h}]', doc: 'Resize image', kind: CompletionItemKind.Function },
  'ImageRotate':        { signature: 'ImageRotate[img, θ]', doc: 'Rotate image by angle', kind: CompletionItemKind.Function },
  'ImageAdjust':        { signature: 'ImageAdjust[img]', doc: 'Adjust brightness/contrast', kind: CompletionItemKind.Function },
  'Binarize':           { signature: 'Binarize[img]', doc: 'Convert to binary image', kind: CompletionItemKind.Function },
  'ColorConvert':       { signature: 'ColorConvert[img, colorSpace]', doc: 'Convert color space', kind: CompletionItemKind.Function },
  'GaussianFilter':     { signature: 'GaussianFilter[img, r]', doc: 'Gaussian blur', kind: CompletionItemKind.Function },
  'EdgeDetect':         { signature: 'EdgeDetect[img]', doc: 'Detect edges', kind: CompletionItemKind.Function },
  'ImageConvolve':      { signature: 'ImageConvolve[img, kernel]', doc: 'Convolve with kernel', kind: CompletionItemKind.Function },
  // Graphics
  'Graphics':         { signature: 'Graphics[primitives]', doc: 'Create graphics object', kind: CompletionItemKind.Function },
  'ListPlot':         { signature: 'ListPlot[data]', doc: 'Plot data points', kind: CompletionItemKind.Function },
  'ListLinePlot':     { signature: 'ListLinePlot[data]', doc: 'Plot data as line', kind: CompletionItemKind.Function },
  'ExportGraphics':   { signature: 'ExportGraphics[file, g]', doc: 'Export graphics to file', kind: CompletionItemKind.Function },
  'Plot':             { signature: 'Plot[f, {x, xmin, xmax}]', doc: 'Plot function (stub)', kind: CompletionItemKind.Function },
  // Distribution / Statistics
  'Mean':              { signature: 'Mean[list]', doc: 'Arithmetic mean', kind: CompletionItemKind.Function },
  'Median':            { signature: 'Median[list]', doc: 'Median value', kind: CompletionItemKind.Function },
  'Variance':          { signature: 'Variance[list]', doc: 'Variance', kind: CompletionItemKind.Function },
  'StandardDeviation': { signature: 'StandardDeviation[list]', doc: 'Standard deviation', kind: CompletionItemKind.Function },
  'Quantile':          { signature: 'Quantile[list, p]', doc: 'p-th quantile', kind: CompletionItemKind.Function },
  'Covariance':        { signature: 'Covariance[list1, list2]', doc: 'Covariance', kind: CompletionItemKind.Function },
  'Correlation':       { signature: 'Correlation[list1, list2]', doc: 'Correlation coefficient', kind: CompletionItemKind.Function },
  'GeometricMean':     { signature: 'GeometricMean[list]', doc: 'Geometric mean', kind: CompletionItemKind.Function },
  'HarmonicMean':      { signature: 'HarmonicMean[list]', doc: 'Harmonic mean', kind: CompletionItemKind.Function },
  'Skewness':          { signature: 'Skewness[list]', doc: 'Skewness of distribution', kind: CompletionItemKind.Function },
  'Kurtosis':          { signature: 'Kurtosis[list]', doc: 'Kurtosis of distribution', kind: CompletionItemKind.Function },
  'Mode':              { signature: 'Mode[list]', doc: 'Most frequent value(s)', kind: CompletionItemKind.Function },
  'InterquartileRange': { signature: 'InterquartileRange[list]', doc: 'IQR (Q3-Q1)', kind: CompletionItemKind.Function },
  'WeightedMean':      { signature: 'WeightedMean[values, weights]', doc: 'Weighted mean', kind: CompletionItemKind.Function },
  'RootMeanSquare':    { signature: 'RootMeanSquare[list]', doc: 'RMS value', kind: CompletionItemKind.Function },
  'MeanDeviation':     { signature: 'MeanDeviation[list]', doc: 'Mean absolute deviation', kind: CompletionItemKind.Function },
  'MedianDeviation':   { signature: 'MedianDeviation[list]', doc: 'Median absolute deviation', kind: CompletionItemKind.Function },
  'Standardize':       { signature: 'Standardize[list]', doc: 'Zero-mean, unit-variance', kind: CompletionItemKind.Function },
  'BinCounts':         { signature: 'BinCounts[list, bins]', doc: 'Count items per bin', kind: CompletionItemKind.Function },
  'HistogramList':     { signature: 'HistogramList[list, bins]', doc: 'Bins and counts', kind: CompletionItemKind.Function },
  // Distribution
  'NormalDistribution':     { signature: 'NormalDistribution[μ, σ]', doc: 'Normal (Gaussian) distribution', kind: CompletionItemKind.Function },
  'UniformDistribution':    { signature: 'UniformDistribution[{min, max}]', doc: 'Uniform distribution', kind: CompletionItemKind.Function },
  'PoissonDistribution':    { signature: 'PoissonDistribution[λ]', doc: 'Poisson distribution', kind: CompletionItemKind.Function },
  'BinomialDistribution':   { signature: 'BinomialDistribution[n, p]', doc: 'Binomial distribution', kind: CompletionItemKind.Function },
  'BernoulliDistribution':  { signature: 'BernoulliDistribution[p]', doc: 'Bernoulli distribution', kind: CompletionItemKind.Function },
  'GammaDistribution':      { signature: 'GammaDistribution[α, β]', doc: 'Gamma distribution', kind: CompletionItemKind.Function },
  'StudentTDistribution':   { signature: 'StudentTDistribution[ν]', doc: 'Student t-distribution', kind: CompletionItemKind.Function },
  'BetaDistribution':       { signature: 'BetaDistribution[α, β]', doc: 'Beta distribution', kind: CompletionItemKind.Function },
  'CauchyDistribution':     { signature: 'CauchyDistribution[x0, γ]', doc: 'Cauchy distribution', kind: CompletionItemKind.Function },
  'PDF':                    { signature: 'PDF[dist, x]', doc: 'Probability density', kind: CompletionItemKind.Function },
  'CDF':                    { signature: 'CDF[dist, x]', doc: 'Cumulative distribution', kind: CompletionItemKind.Function },
  'RandomVariate':          { signature: 'RandomVariate[dist]', doc: 'Generate random sample', kind: CompletionItemKind.Function },
  // Linear algebra
  'Dimensions':       { signature: 'Dimensions[tensor]', doc: 'Tensor dimensions', kind: CompletionItemKind.Function },
  'Dot':              { signature: 'Dot[a, b]', doc: 'Dot product (a.b)', kind: CompletionItemKind.Function },
  'MatrixMultiply':   { signature: 'MatrixMultiply[a, b]', doc: 'Matrix multiplication', kind: CompletionItemKind.Function },
  'IdentityMatrix':   { signature: 'IdentityMatrix[n]', doc: 'n×n identity matrix', kind: CompletionItemKind.Function },
  'Det':              { signature: 'Det[matrix]', doc: 'Determinant', kind: CompletionItemKind.Function },
  'Inverse':          { signature: 'Inverse[matrix]', doc: 'Matrix inverse', kind: CompletionItemKind.Function },
  'Tr':               { signature: 'Tr[matrix]', doc: 'Matrix trace', kind: CompletionItemKind.Function },
  'Norm':             { signature: 'Norm[x]', doc: 'Norm of vector/matrix', kind: CompletionItemKind.Function },
  'Cross':            { signature: 'Cross[a, b]', doc: 'Cross product', kind: CompletionItemKind.Function },
  'LinearSolve':      { signature: 'LinearSolve[A, b]', doc: 'Solve Ax=b', kind: CompletionItemKind.Function },
  'MatrixPower':      { signature: 'MatrixPower[A, n]', doc: 'Matrix to nth power', kind: CompletionItemKind.Function },
  'Eigenvalues':      { signature: 'Eigenvalues[A]', doc: 'Eigenvalues of matrix', kind: CompletionItemKind.Function },
  'Eigenvectors':     { signature: 'Eigenvectors[A]', doc: 'Eigenvectors of matrix', kind: CompletionItemKind.Function },
  'ArrayFlatten':     { signature: 'ArrayFlatten[blocks]', doc: 'Flatten block matrix', kind: CompletionItemKind.Function },
  'ZeroMatrix':       { signature: 'ZeroMatrix[{m, n}]', doc: 'm×n zero matrix', kind: CompletionItemKind.Function },
  'DiagonalMatrix':   { signature: 'DiagonalMatrix[list]', doc: 'Diagonal matrix from list', kind: CompletionItemKind.Function },
  'UnitVector':       { signature: 'UnitVector[n, i]', doc: 'Unit vector of length n at i', kind: CompletionItemKind.Function },
  'RowReduce':        { signature: 'RowReduce[matrix]', doc: 'Row-reduced echelon form', kind: CompletionItemKind.Function },
  'MatrixRank':       { signature: 'MatrixRank[matrix]', doc: 'Rank of matrix', kind: CompletionItemKind.Function },
  'NullSpace':        { signature: 'NullSpace[matrix]', doc: 'Null space basis', kind: CompletionItemKind.Function },
  'Row':              { signature: 'Row[matrix, i]', doc: 'ith row of matrix', kind: CompletionItemKind.Function },
  'Column':           { signature: 'Column[matrix, j]', doc: 'jth column of matrix', kind: CompletionItemKind.Function },
  'KroneckerProduct': { signature: 'KroneckerProduct[a, b]', doc: 'Kronecker (tensor) product', kind: CompletionItemKind.Function },
  'VectorAngle':      { signature: 'VectorAngle[u, v]', doc: 'Angle between vectors', kind: CompletionItemKind.Function },
  'PseudoInverse':    { signature: 'PseudoInverse[matrix]', doc: 'Moore-Penrose pseudoinverse', kind: CompletionItemKind.Function },
  'Minors':           { signature: 'Minors[matrix]', doc: 'Matrix of minors', kind: CompletionItemKind.Function },
  // Developer / misc
  'LocalSymbol':        { signature: 'LocalSymbol[name]', doc: 'Create local symbol', kind: CompletionItemKind.Function },
  'Sequence':           { signature: 'Sequence[elems]', doc: 'Splice elements in expression', kind: CompletionItemKind.Function },
  'LibraryFunction':    { signature: 'LibraryFunction[lib, name]', doc: 'External library function', kind: CompletionItemKind.Function },
  'MachineIntegerQ':    { signature: 'MachineIntegerQ[x]', doc: 'Test if machine integer', kind: CompletionItemKind.Function },
  'PackedArrayQ':       { signature: 'PackedArrayQ[expr]', doc: 'Test if packed array', kind: CompletionItemKind.Function },
  'ToPackedArray':      { signature: 'ToPackedArray[list]', doc: 'Convert to packed array', kind: CompletionItemKind.Function },
  'FromPackedArray':    { signature: 'FromPackedArray[packed]', doc: 'Convert packed array to list', kind: CompletionItemKind.Function },
  // Simplify family
  'BesselSimplify':     { signature: 'BesselSimplify[expr]', doc: 'Simplify Bessel functions', kind: CompletionItemKind.Function },
  'GammaSimplify':      { signature: 'GammaSimplify[expr]', doc: 'Simplify Gamma expressions', kind: CompletionItemKind.Function },
  'PolyGammaSimplify':  { signature: 'PolyGammaSimplify[expr]', doc: 'Simplify polygamma', kind: CompletionItemKind.Function },
  'ZetaSimplify':       { signature: 'ZetaSimplify[expr]', doc: 'Simplify zeta functions', kind: CompletionItemKind.Function },
  'PolyLogSimplify':    { signature: 'PolyLogSimplify[expr]', doc: 'Simplify polylogarithms', kind: CompletionItemKind.Function },
  'TrigToRadicals':     { signature: 'TrigToRadicals[expr]', doc: 'Convert trig to radicals', kind: CompletionItemKind.Function },
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
  'Hold', 'HoldComplete', 'ReleaseHold',
  '@transform',
];

// ─── Type names ───
const TYPES = [
  'Integer', 'Real', 'Rational', 'Complex',
  'String', 'Symbol', 'Boolean', 'Number', 'Atom',
  'List', 'Rule', 'RuleDelayed', 'Pattern',
  'Function', 'Object', 'Compound', 'Expr',
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
      foldingRangeProvider: true,
    },
  };
});

// ─── Validate with syma binary ───
function validateWithSyma(doc: TextDocument): Diagnostic[] | null {
  const symaPath = findSymaBinary();
  if (!symaPath) return null;

  const filePath = fileURLToPath(doc.uri);
  if (!filePath.endsWith('.syma')) return null;

  const result = spawnSync(symaPath, ['--check', filePath], {
    encoding: 'utf-8',
    timeout: 5000,
  });

  if (result.status === 0) return []; // No errors

  const stderr: string = result.stderr ?? '';
  const diagnostics: Diagnostic[] = [];

  // Parse error lines: "LexError: line:col: message" or "ParseError: line:col: message"
  const lines = stderr.split('\n');
  for (const line of lines) {
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
          const constructorMatch = lines[j].match(/^constructor\s*\[/);
          if (constructorMatch) {
            const cLine = j;
            const cName = 'constructor';
            const cCol = lines[j].indexOf('constructor');
            const cRange = Range.create(cLine, cCol, cLine, cCol + 'constructor'.length);
            const cLineRange = Range.create(cLine, 0, cLine, lines[j].length);
            classChildren.push(DocumentSymbol.create(cName, 'constructor', SymbolKind.Constructor, cLineRange, cRange));
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

    // Function definition (lowercase or PascalCase word before [)
    const funcMatch = line.match(/^(\w+)\s*\[/);
    if (funcMatch) {
      const name = funcMatch[1];
      // Skip if it's a keyword or known builtin/operator
      if (KEYWORDS.includes(name) || TYPES.includes(name) || BUILTINS[name] || CONSTANTS[name]) continue;
      const col = line.indexOf(name);
      const nameRange = Range.create(i, col, i, col + name.length);
      const lineRange = Range.create(i, 0, i, line.length);
      symbols.push(DocumentSymbol.create(name, 'function', SymbolKind.Function, lineRange, nameRange));
      continue;
    }

    // Export declaration
    const exportMatch = line.match(/^export\s+(\w+)/);
    if (exportMatch) {
      const name = exportMatch[1];
      const col = line.indexOf(name);
      const nameRange = Range.create(i, col, i, col + name.length);
      const lineRange = Range.create(i, 0, i, line.length);
      symbols.push(DocumentSymbol.create(name, 'export', SymbolKind.Property, lineRange, nameRange));
      continue;
    }
  }

  return symbols;
});

// ─── Folding Ranges ───
connection.onFoldingRanges((params: FoldingRangeParams): FoldingRange[] => {
  const doc = documents.get(params.textDocument.uri);
  if (!doc) return [];

  const text = doc.getText();
  const lines = text.split('\n');
  const ranges: FoldingRange[] = [];

  // Helper: add fold if span > 1 line
  function addFold(start: number, end: number, kind: FoldingRangeKind) {
    if (end - start > 1) ranges.push(FoldingRange.create(start, end, undefined, undefined, kind));
  }

  // Stack for bracket-based folding: { bracket: string, line: number }
  const bracketStack: { bracket: string; line: number }[] = [];
  let inString = false;
  let inComment = 0;
  let commentStart: number | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let j = 0;

    while (j < line.length) {
      // Track comments
      if (!inString && inComment === 0 && line[j] === '(' && line[j + 1] === '*') {
        inComment++;
        if (commentStart === null) commentStart = i;
        j += 2;
        continue;
      }
      if (inComment > 0 && line[j] === '*' && line[j + 1] === ')') {
        inComment--;
        if (inComment === 0 && commentStart !== null) {
          addFold(commentStart, i, FoldingRangeKind.Comment);
          commentStart = null;
        }
        j += 2;
        continue;
      }
      if (inComment > 0) { j++; continue; }

      // Track strings
      if (line[j] === '"' && !inString) { inString = true; j++; continue; }
      if (line[j] === '"' && inString) { inString = false; j++; continue; }
      if (inString) {
        if (line[j] === '\\' && j + 1 < line.length) j += 2;
        else j++;
        continue;
      }

      // Multi-char brackets (check before single-char)
      if (line[j] === '[' && line[j + 1] === '[') {
        bracketStack.push({ bracket: '[[', line: i });
        j += 2; continue;
      }
      if (line[j] === ']' && line[j + 1] === ']') {
        const open = bracketStack.pop();
        if (open) addFold(open.line, i, FoldingRangeKind.Region);
        j += 2; continue;
      }
      if (line[j] === '<' && line[j + 1] === '|') {
        bracketStack.push({ bracket: '<|', line: i });
        j += 2; continue;
      }
      if (line[j] === '|' && line[j + 1] === '>') {
        const open = bracketStack.pop();
        if (open) addFold(open.line, i, FoldingRangeKind.Region);
        j += 2; continue;
      }

      // Single-char brackets
      if (line[j] === '(') {
        bracketStack.push({ bracket: '(', line: i });
        j++; continue;
      }
      if (line[j] === ')') {
        const open = bracketStack.pop();
        if (open) addFold(open.line, i, FoldingRangeKind.Region);
        j++; continue;
      }
      if (line[j] === '[') {
        bracketStack.push({ bracket: '[', line: i });
        j++; continue;
      }
      if (line[j] === ']') {
        const open = bracketStack.pop();
        if (open) addFold(open.line, i, FoldingRangeKind.Region);
        j++; continue;
      }
      if (line[j] === '{') {
        bracketStack.push({ bracket: '{', line: i });
        j++; continue;
      }
      if (line[j] === '}') {
        const open = bracketStack.pop();
        if (open) addFold(open.line, i, FoldingRangeKind.Region);
        j++; continue;
      }

      j++;
    }
  }

  return ranges;
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
                   Math.max(0, wordStart - lastNewline - 1),
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
    const closeMatch = diagnostic.message.match(/^Unmatched (\)|\]|\}|]]|\|>)$/);
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
