#!/usr/bin/env node
/**
 * Built-in function sync checker.
 * Compares builtin definitions across:
 *   - src/server.ts  (BUILTINS record for completions/hover)
 *   - syntaxes/syma.tmLanguage.json  (grammar patterns for highlighting)
 *
 * Usage: node scripts/sync-builtins.js
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

// ── Extract from server.ts ──

function extractServerBuiltins() {
  const src = fs.readFileSync(path.join(ROOT, 'src', 'server.ts'), 'utf-8');
  const builtins = new Map();

  // Find the BUILTINS record: `'Name': { signature, doc, kind }`
  const recordPattern = /^\s+'(\w+)':\s*\{/gm;
  let match;
  while ((match = recordPattern.exec(src)) !== null) {
    builtins.set(match[1], { source: 'server.ts (BUILTINS)' });
  }

  return builtins;
}

function extractArray(src, name) {
  const set = new Set();
  const section = src.match(new RegExp(`const ${name}\\s*=\\s*\\[([\\s\\S]*?)\\];`));
  if (section) {
    const itemPattern = /'([\w@]+)'/g;
    let m;
    while ((m = itemPattern.exec(section[1])) !== null) {
      set.add(m[1]);
    }
  }
  return set;
}

function extractServerKeywords() {
  const src = fs.readFileSync(path.join(ROOT, 'src', 'server.ts'), 'utf-8');
  return extractArray(src, 'KEYWORDS');
}

function extractServerTypes() {
  const src = fs.readFileSync(path.join(ROOT, 'src', 'server.ts'), 'utf-8');
  return extractArray(src, 'TYPES');
}

// ── Extract from grammar ──

function extractGrammarBuiltins() {
  const grammar = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'syntaxes', 'syma.tmLanguage.json'), 'utf-8')
  );

  const builtins = new Map();
  const patterns = grammar.repository?.builtins?.patterns || [];

  for (const pattern of patterns) {
    const name = pattern.name || '';
    const m = pattern.match || '';
    // Extract function names from regex like \b(?:Sin|Cos|Tan)\b
    const fnMatch = m.match(/\\b\(\?:([^)]+)\)\\b/);
    if (fnMatch) {
      const fns = fnMatch[1].split('|');
      for (const fn of fns) {
        builtins.set(fn, {
          source: `grammar (${name})`,
          category: name.replace(/^support\.function\.builtin\./, '').replace(/\.syma$/, ''),
        });
      }
    }
  }

  return builtins;
}

function extractGrammarKeywords() {
  const grammar = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'syntaxes', 'syma.tmLanguage.json'), 'utf-8')
  );

  const keywords = new Map();
  const patterns = grammar.repository?.keywords?.patterns || [];

  for (const pattern of patterns) {
    const name = pattern.name || '';
    const m = pattern.match || '';
    const fnMatch = m.match(/\\b\(\?:([^)]+)\)\\b/);
    if (fnMatch) {
      const fns = fnMatch[1].split('|');
      for (const fn of fns) {
        keywords.set(fn, { category: name });
      }
    }
  }

  // Handle @transform specially (different pattern)
  if (grammar.repository?.keywords?.patterns) {
    const transformPattern = grammar.repository.keywords.patterns.find(
      (p) => p.match === '@transform\\b'
    );
    if (transformPattern) {
      keywords.set('@transform', { category: transformPattern.name });
    }
  }

  return keywords;
}

function extractGrammarTypes() {
  const grammar = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'syntaxes', 'syma.tmLanguage.json'), 'utf-8')
  );

  const types = new Map();
  const patterns = grammar.repository?.types?.patterns || [];

  for (const pattern of patterns) {
    const m = pattern.match || '';
    const fnMatch = m.match(/\\b\(\?:([^)]+)\)\\b/);
    if (fnMatch) {
      const fns = fnMatch[1].split('|');
      for (const fn of fns) {
        types.set(fn, { source: `grammar (${pattern.name})` });
      }
    }
  }

  return types;
}

// ── Report ──

function report() {
  const serverBuiltins = extractServerBuiltins();
  const grammarBuiltins = extractGrammarBuiltins();
  const serverKeywords = extractServerKeywords();
  const grammarKeywords = extractGrammarKeywords();
  const grammarTypes = extractGrammarTypes();

  const serverBuiltinNames = new Set(serverBuiltins.keys());
  const grammarBuiltinNames = new Set(grammarBuiltins.keys());

  console.log('=== Built-in Function Sync Check ===\n');

  // Builtins in server.ts but not in grammar
  const onlyInServer = [...serverBuiltinNames].filter((n) => !grammarBuiltinNames.has(n));
  if (onlyInServer.length > 0) {
    console.log(`In server.ts BUILTINS but MISSING from grammar patterns (${onlyInServer.length}):`);
    for (const name of onlyInServer.sort()) {
      console.log(`  - ${name}`);
    }
    console.log();
  }

  // Builtins in grammar but not in server.ts
  const onlyInGrammar = [...grammarBuiltinNames].filter((n) => !serverBuiltinNames.has(n));
  if (onlyInGrammar.length > 0) {
    console.log(`In grammar patterns but MISSING from server.ts BUILTINS (${onlyInGrammar.length}):`);
    for (const name of onlyInGrammar.sort()) {
      const info = grammarBuiltins.get(name);
      console.log(`  - ${name}  (${info?.category || 'unknown category'})`);
    }
    console.log();
  }

  console.log(`server.ts BUILTINS count: ${serverBuiltinNames.size}`);
  console.log(`Grammar builtin patterns count: ${grammarBuiltinNames.size}`);
  console.log(`Overlap: ${[...serverBuiltinNames].filter((n) => grammarBuiltinNames.has(n)).length}`);

  // Keyword check
  console.log('\n=== Keyword Sync Check ===\n');

  const grammarKeywordNames = new Set(grammarKeywords.keys());
  const onlyServerKeywords = [...serverKeywords].filter((n) => !grammarKeywordNames.has(n));
  const onlyGrammarKeywords = [...grammarKeywordNames].filter((n) => !serverKeywords.has(n));

  if (onlyServerKeywords.length > 0) {
    console.log(`In server.ts KEYWORDS but MISSING from grammar (${onlyServerKeywords.length}):`);
    for (const name of onlyServerKeywords.sort()) {
      console.log(`  - ${name}`);
    }
    console.log();
  }

  if (onlyGrammarKeywords.length > 0) {
    console.log(`In grammar keywords but MISSING from server.ts (${onlyGrammarKeywords.length}):`);
    for (const name of onlyGrammarKeywords.sort()) {
      console.log(`  - ${name}`);
    }
    console.log();
  }

  // Type check
  console.log('\n=== Type Sync Check ===\n');

  const src = fs.readFileSync(path.join(ROOT, 'src', 'server.ts'), 'utf-8');
  const serverTypeNames = extractArray(src, 'TYPES');

  const grammarTypeNames = new Set(grammarTypes.keys());
  const onlyServerTypes = [...serverTypeNames].filter((n) => !grammarTypeNames.has(n));
  const onlyGrammarTypes = [...grammarTypeNames].filter((n) => !serverTypeNames.has(n));

  if (onlyServerTypes.length > 0) {
    console.log(`In server.ts TYPES but MISSING from grammar (${onlyServerTypes.length}):`);
    for (const name of onlyServerTypes.sort()) {
      console.log(`  - ${name}`);
    }
    console.log();
  }

  if (onlyGrammarTypes.length > 0) {
    console.log(`In grammar types but MISSING from server.ts (${onlyGrammarTypes.length}):`);
    for (const name of onlyGrammarTypes.sort()) {
      console.log(`  - ${name}`);
    }
    console.log();
  }

  console.log(`server.ts TYPES count: ${serverTypeNames.size}`);
  console.log(`Grammar types count: ${grammarTypeNames.size}`);

  // Summary
  console.log('\n=== Summary ===');
  const knownDiff = (k) => k === 'Function'; // intentional: keyword in server.ts, type in grammar
  const realIssues =
    onlyInServer.length > 0 ||
    onlyInGrammar.length > 0 ||
    onlyServerKeywords.filter((k) => !knownDiff(k)).length > 0 ||
    onlyGrammarKeywords.filter((k) => !knownDiff(k)).length > 0 ||
    [...onlyServerTypes].filter((k) => !knownDiff(k)).length > 0 ||
    [...onlyGrammarTypes].filter((k) => !knownDiff(k)).length > 0;

  if (realIssues) {
    console.log('⚠️  Mismatches found — review above and update files to sync.');
  } else {
    console.log('✅ All builtins, keywords, and types are in sync!');
    if (onlyInGrammar.length > 0 || onlyServerKeywords.length > 0) {
      console.log('  (Known diff: Function classified as keyword in server.ts, type in grammar)');
    }
  }
}

report();
