'use strict';
const { spawn } = require('child_process');
const os   = require('os');
const path = require('path');
const fs   = require('fs');

function findClaudeExe() {
  if (process.env.CLAUDE_PATH && fs.existsSync(process.env.CLAUDE_PATH)) {
    return process.env.CLAUDE_PATH;
  }

  const localBin = path.join('.local', 'bin');
  const roots = [
    os.homedir(),
    'C:\\Users\\Administrator',
    'C:\\Users\\sandeep',
  ];

  for (const root of roots) {
    for (const name of ['claude.exe', 'claude']) {
      const p = path.join(root, localBin, name);
      try { if (fs.existsSync(p)) return p; } catch { /* skip */ }
    }
  }

  for (const name of ['claude.cmd', 'claude.exe', 'claude']) {
    for (const base of ['C:\\Users\\Administrator\\AppData\\Roaming\\npm', 'C:\\Users\\sandeep\\AppData\\Roaming\\npm']) {
      const p = path.join(base, name);
      try { if (fs.existsSync(p)) return p; } catch { /* skip */ }
    }
  }

  return 'claude';
}

const CLAUDE_EXE = findClaudeExe();
console.log('[claudeCLI] using:', CLAUDE_EXE);

/**
 * Call the Claude Code CLI in non-interactive print mode.
 * Sends the prompt via stdin to avoid Windows command-line length limits.
 * Does NOT ask Claude to use any file tools — include PDF text in the prompt directly.
 *
 * timeoutMs guards against a hung subprocess (seen in production: OCR runs
 * spawn one of these per scanned page, with several running concurrently —
 * a single stuck call with no timeout blocked an entire analysis run
 * indefinitely, with no error and no way to recover except manually
 * resetting the session). Default is generous since some prompts are large,
 * but finite.
 */
function callClaudeCLI(prompt, timeoutMs = 120000) {
  return new Promise((resolve, reject) => {
    const proc = spawn(CLAUDE_EXE, ['--print'], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      proc.kill('SIGKILL');
      reject(new Error(`Claude CLI timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    proc.stdout.on('data', (chunk) => { stdout += chunk; });
    proc.stderr.on('data', (chunk) => { stderr += chunk; });

    proc.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new Error(`Failed to spawn claude CLI: ${err.message}`));
    });

    proc.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code !== 0) {
        // stderr is very often empty for this failure (the process just dies
        // mid-run with no diagnostic output) — include whatever stdout was
        // produced before the exit too, since that's sometimes the only clue.
        const detail = stderr.trim() || (stdout.trim() ? `(no stderr; stdout: ${stdout.trim().slice(0, 500)})` : '(no stderr or stdout)');
        return reject(new Error(`Claude CLI exited with code ${code} — ${detail}`));
      }
      resolve(stdout.trim());
    });

    proc.stdin.write(prompt, 'utf8');
    proc.stdin.end();
  });
}

/**
 * Strip markdown code fences that Claude sometimes wraps HTML in.
 * e.g. ```html ... ``` → the inner content only.
 */
function stripMarkdownFences(text) {
  const match = text.match(/^```(?:html)?\s*\n?([\s\S]*?)\n?```\s*$/i);
  return match ? match[1].trim() : text.trim();
}

/**
 * Extract body content from a full HTML document.
 * If Claude returns <!DOCTYPE html>...<body>...</body>..., we only want
 * the body fragment for the TipTap editor (it doesn't handle full documents).
 */
function extractBodyContent(html) {
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  if (bodyMatch) return bodyMatch[1].trim();
  // Not a full document — return as-is
  return html.trim();
}

module.exports = { callClaudeCLI, stripMarkdownFences, extractBodyContent };
