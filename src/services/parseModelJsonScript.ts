/**
 * Parses LLM output expected to be a JSON object with string keys "title" and "script".
 * Handles markdown fences and leading/trailing prose via brace-aware extraction.
 */

function extractFirstJsonObject(text: string): string | null {
  const start = text.indexOf('{');
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i]!;
    if (escape) {
      escape = false;
      continue;
    }
    if (c === '\\' && inString) {
      escape = true;
      continue;
    }
    if (c === '"' && !escape) {
      inString = !inString;
      continue;
    }
    if (!inString) {
      if (c === '{') depth++;
      else if (c === '}') {
        depth--;
        if (depth === 0) return text.slice(start, i + 1);
      }
    }
  }
  return null;
}

function preview(raw: string, max = 280): string {
  const one = raw.replace(/\s+/g, ' ').trim();
  return one.length <= max ? one : `${one.slice(0, max)}…`;
}

export function parseTitleScriptFromModel(raw: string): { title: string; script: string } {
  let s = raw.trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)```$/m.exec(s);
  if (fence) s = fence[1]!.trim();

  const validate = (obj: unknown): { title: string; script: string } => {
    if (!obj || typeof obj !== 'object') {
      throw new Error('Model JSON was not an object');
    }
    const o = obj as { title?: unknown; script?: unknown };
    const title = typeof o.title === 'string' ? o.title.trim() : '';
    const script = typeof o.script === 'string' ? o.script.trim() : '';
    if (!title || !script) {
      throw new Error('Model JSON missing non-empty title and script strings');
    }
    return { title, script };
  };

  const attempts: string[] = [s];
  const extracted = extractFirstJsonObject(s);
  if (extracted && extracted !== s) attempts.push(extracted);

  let lastErr: unknown;
  for (const candidate of attempts) {
    try {
      return validate(JSON.parse(candidate));
    } catch (e) {
      lastErr = e;
    }
  }

  const hint =
    lastErr instanceof Error ? lastErr.message : String(lastErr);
  throw new Error(
    `Could not parse model JSON (${hint}). Output preview: ${preview(raw)}`,
  );
}
