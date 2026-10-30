/**
 * Feature 1 — Context Engineering: Sub-5ms Gap Detector (Module 5, Piece 4)
 *
 * Inspects developer prompts deterministically for missing context without making
 * any external LLM calls. Executes in <5ms.
 *
 * The 3 Gap Categories:
 *  1. missing_file: Mentions code symbol/function/component without explicit file path.
 *  2. missing_error: References failure keywords ("crash", "500", "broken") without error log/stack trace.
 *  3. ambiguous_intent: Vague instructions ("add retry", "handle auth", "cache this") without strategy.
 */

import type {
  WorkspaceContext,
  DetectedGap,
  GapAnalysisResult,
  GapCategory,
} from '../types/context-engineering.js';

// Common source file extensions
const FILE_PATH_REGEX = /\b[\w./\\-]+\.(ts|tsx|js|jsx|mjs|cjs|py|json|css|scss|html|go|rs|java|c|cpp|h|md|yml|yaml)\b/i;
const HAS_PATH_SEPARATOR = /[\/\\][\w.-]+/;

// Symbols: camelCase, PascalCase, or snake_case with at least 3 chars
const SYMBOL_REGEX = /\b([a-z]+[A-Z0-9][a-zA-Z0-9]*|[A-Z][a-zA-Z0-9]+|[a-z0-9]+_[a-z0-9_]+)\b/g;

// Common programming and English noise words that look like PascalCase or camelCase but aren't code symbols
const IGNORED_SYMBOLS = new Set([
  'English', 'JavaScript', 'TypeScript', 'Python', 'React', 'Vue', 'Angular',
  'Node', 'Docker', 'Linux', 'Windows', 'MacOS', 'Google', 'Ollama', 'OpenAI',
  'GitHub', 'GitLab', 'HTTP', 'HTTPS', 'JSON', 'HTML', 'CSS', 'REST', 'API',
  'GraphQL', 'SQL', 'NoSQL', 'CRUD', 'UI', 'UX', 'CLI', 'GUI', 'URL', 'URI',
  'PRD', 'TODO', 'FIXME', 'NOTE', 'INFO', 'WARN', 'ERROR', 'OK',
  'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
  'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August',
  'September', 'October', 'November', 'December',
]);

// Failure keywords that suggest an error context gap when no error details are provided
const ERROR_KEYWORDS: { pattern: RegExp; token: string }[] = [
  { pattern: /\b(crashed|crash|crashing)\b/i, token: 'crash' },
  { pattern: /\b(type\s*error|typeerror)\b/i, token: 'type error' },
  { pattern: /\b(syntax\s*error|syntaxerror)\b/i, token: 'syntax error' },
  { pattern: /\b(reference\s*error|referenceerror)\b/i, token: 'reference error' },
  { pattern: /\b(broken|breaks|broke)\b/i, token: 'broken' },
  { pattern: /\b(500(\s*error)?|internal\s*server\s*error)\b/i, token: '500 error' },
  { pattern: /\b(fails|failing|failed|failure)\b/i, token: 'failure' },
  { pattern: /\b(segfault|segmentation\s*fault)\b/i, token: 'segfault' },
  { pattern: /\b(unhandled\s*rejection|promise\s*rejected)\b/i, token: 'promise rejected' },
  { pattern: /\b(null\s*pointer|undefined\s*is\s*not\s*a\s*function)\b/i, token: 'null pointer' },
  // System / Node error codes reported without a trace ("getting ECONNREFUSED")
  {
    pattern: /\b(ECONNREFUSED|ECONNRESET|ECONNABORTED|ETIMEDOUT|ENOTFOUND|EADDRINUSE|EACCES|EPERM|ENOENT|EPIPE|EHOSTUNREACH|ENETUNREACH|EAI_AGAIN|EMFILE|ERR_[A-Z0-9_]+)\b/,
    token: 'error code',
  },
];

// Indicators that an error trace or log snippet is ALREADY present in the prompt
const ERROR_DETAILS_REGEX = /(?:error:\s*.+|at\s+[\w./\\-]+:\d+:\d+|stack\s*trace:?|```[\s\S]*?(?:error|exception)[\s\S]*?```|\b(status\s*code|code:\s*\d{3})\b)/i;

// Explicit retrieval cues & CLI flags (Decision T9 / TC-RET-GAP-5)
const EXPLICIT_RETRIEVAL_PATTERNS: { pattern: RegExp; token: string }[] = [
  { pattern: /\b(recall|remember\s+when|what\s+was\s+the\s+decision\s+on|what\s+did\s+we\s+decide)\b/i, token: 'explicit recall' },
  { pattern: /--context\s+["']?([^"'\n]+)["']?/i, token: 'explicit context flag' },
];

// Ambiguous architectural intent patterns (e.g. "add retry", "handle auth")
const AMBIGUOUS_INTENT_PATTERNS: { pattern: RegExp; token: string }[] = [
  { pattern: /\b(add|implement|setup)\s+(retry|retries|backoff)\b/i, token: 'add retry' },
  { pattern: /\b(handle|add|fix)\s+(auth|authentication|authorization|login)\b/i, token: 'handle auth' },
  { pattern: /\b(cache|caching)\s+(this|data|response|query|results?)\b/i, token: 'cache this' },
  { pattern: /\b(make\s+it\s+faster|optimize\s+performance|speed\s+up)\b/i, token: 'optimize performance' },
  { pattern: /\b(clean\s*up|refactor\s+this|restructure)\b/i, token: 'refactor this' },
  { pattern: /\b(secure\s+this|add\s+security|validate\s+input)\b/i, token: 'secure this' },
  { pattern: /\b(handle\s+errors?|add\s+error\s+handling)\b/i, token: 'handle errors' },
  { pattern: /\b(add\s+logging|log\s+this|more\s+logs)\b/i, token: 'add logging' },
  { pattern: /\b(rate\s*limit|throttl(e|ing))\b/i, token: 'rate limit' },
];

/**
 * Deterministically detects context gaps in a prompt in <5ms.
 */
export function detectPromptGaps(
  prompt: string,
  context?: WorkspaceContext
): GapAnalysisResult {
  const startTime = performance.now();
  const gaps: DetectedGap[] = [];

  if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
    return {
      hasGaps: false,
      gaps: [],
      executionTimeMs: Number((performance.now() - startTime).toFixed(3)),
    };
  }

  const promptText = prompt.trim();
  const hasExplicitFilePath = FILE_PATH_REGEX.test(promptText) || HAS_PATH_SEPARATOR.test(promptText);

  // --------------------------------------------------------------------------
  // 1. Missing File Context Gap
  // --------------------------------------------------------------------------
  if (!hasExplicitFilePath) {
    const rawMatches = promptText.match(SYMBOL_REGEX) ?? [];
    const candidateSymbols: string[] = [];

    for (const token of rawMatches) {
      if (token.length >= 3 && !IGNORED_SYMBOLS.has(token)) {
        // Exclude purely uppercase acronyms unless mixed casing
        if (!/^[A-Z0-9_]+$/.test(token) || token.includes('_')) {
          if (!candidateSymbols.includes(token)) {
            candidateSymbols.push(token);
          }
        }
      }
    }

    for (const sym of candidateSymbols.slice(0, 3)) {
      let resolvedFile: string | undefined;

      // Cross-reference with WorkspaceContext
      if (context?.activeFilePath) {
        const basename = context.activeFilePath.split(/[\/\\]/).pop() ?? '';
        if (
          basename.toLowerCase().includes(sym.toLowerCase()) ||
          sym.toLowerCase().includes(basename.replace(/\.[^/.]+$/, '').toLowerCase())
        ) {
          resolvedFile = context.activeFilePath;
        }
      }

      if (!resolvedFile && context?.recentModifiedFiles && context.recentModifiedFiles.length > 0) {
        for (const recent of context.recentModifiedFiles) {
          const basename = recent.split(/[\/\\]/).pop() ?? '';
          if (
            basename.toLowerCase().includes(sym.toLowerCase()) ||
            sym.toLowerCase().includes(basename.replace(/\.[^/.]+$/, '').toLowerCase())
          ) {
            resolvedFile = recent;
            break;
          }
        }
      }

      gaps.push({
        category: 'missing_file',
        rawToken: sym,
        suggestedQuery: sym,
        resolvedFromWorkspace: resolvedFile,
      });
    }
  }

  // --------------------------------------------------------------------------
  // 2. Missing Error Context Gap
  // --------------------------------------------------------------------------
  const hasErrorDetails = ERROR_DETAILS_REGEX.test(promptText);
  if (!hasErrorDetails) {
    for (const errDef of ERROR_KEYWORDS) {
      if (errDef.pattern.test(promptText)) {
        gaps.push({
          category: 'missing_error',
          rawToken: errDef.token,
          suggestedQuery: `failure error ${errDef.token}`,
        });
        break; // Flag the primary error gap once
      }
    }
  }

  // --------------------------------------------------------------------------
  // 3. Ambiguous Architectural Intent Gap & Explicit Retrieval (Decision T9)
  // --------------------------------------------------------------------------
  for (const expDef of EXPLICIT_RETRIEVAL_PATTERNS) {
    const match = promptText.match(expDef.pattern);
    if (match) {
      gaps.push({
        category: 'ambiguous_intent',
        rawToken: match[0],
        suggestedQuery: match[1] || match[0],
      });
      break;
    }
  }

  for (const intentDef of AMBIGUOUS_INTENT_PATTERNS) {
    if (intentDef.pattern.test(promptText)) {
      gaps.push({
        category: 'ambiguous_intent',
        rawToken: intentDef.token,
        suggestedQuery: `rule convention ${intentDef.token}`,
      });
      break; // Record primary intent ambiguity
    }
  }

  const executionTimeMs = Number((performance.now() - startTime).toFixed(3));

  return {
    hasGaps: gaps.length > 0,
    gaps,
    executionTimeMs,
  };
}
