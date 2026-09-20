/**
 * Typeset a string into a fixed box on a canvas.
 *
 * The hand-painted sign boards are the one place in the film where text has to
 * look deliberately lettered rather than laid out by a browser, so this does
 * two things a naive greedy wrap does not:
 *
 *  1. It breaks on WORD tokens from `Intl.Segmenter`, not on spaces. Thai has
 *     no word spaces, so space-splitting leaves one unbreakable token the
 *     width of the whole sentence. Only if a single word is still too wide
 *     does it fall back to breaking on graphemes.
 *
 *  2. It balances the lines. Greedy packing fills line 1 to the ceiling and
 *     orphans a word or two onto the last line, which looks like a mistake on
 *     a painted board. After the greedy pass it re-wraps at the ideal even
 *     width (total / lineCount) and eases that limit up in 3.5% steps until
 *     the text fits in the same number of lines - then rejects the result
 *     outright if the shortest line is under a quarter of the widest.
 *
 * The size loop steps down 2px at a time and returns the largest size that
 * satisfies line count, width and balance.
 */

export interface FitResult {
  readonly lines: readonly string[];
  readonly size: number;
}

/** Builds a CSS font shorthand for a given pixel size. */
export type FontAt = (size: number) => string;

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

function segment(text: string, granularity: 'word' | 'grapheme'): string[] | null {
  if (typeof Intl === 'undefined' || typeof Intl.Segmenter !== 'function') return null;
  try {
    const seg = new Intl.Segmenter('th', { granularity });
    return Array.from(seg.segment(text), (s) => s.segment);
  } catch {
    return null;
  }
}

export function fitLines(
  g: Ctx,
  text: string,
  budget: number,
  font: FontAt,
  maxSize: number,
  minSize: number,
  maxLines: number,
): FitResult {
  const cells = segment(text, 'word') ?? segment(text, 'grapheme') ?? Array.from(text);
  const fine = segment(text, 'grapheme') ?? Array.from(text);

  const wrap = (limit: number, toks: readonly string[]): string[] => {
    const out: string[] = [];
    let line = '';
    for (const tk of toks) {
      const test = line + tk;
      if (line !== '' && g.measureText(test).width > limit) {
        out.push(line);
        // A leading space would be visible as an indent on a centred line.
        line = tk === ' ' ? '' : tk;
      } else {
        line = test;
      }
    }
    if (line !== '') out.push(line);
    return out;
  };

  /** Wrap on words; only split inside a word if one still overflows alone. */
  const wrapAny = (limit: number): string[] => {
    const byWord = wrap(limit, cells);
    const overflows = byWord.some((l) => l.length > 1 && g.measureText(l).width > limit);
    return overflows ? wrap(limit, fine) : byWord;
  };

  let last: FitResult = { lines: [text], size: minSize };

  for (let size = maxSize; size >= minSize; size -= 2) {
    g.font = font(size);

    const greedy = wrapAny(budget);
    const n = Math.min(maxLines, Math.max(1, greedy.length));
    const total = g.measureText(cells.join('')).width;

    // Balanced pass: aim for an even total/n per line, easing the limit up
    // until the text actually fits in n lines.
    let lines = greedy;
    for (let k = 0; k <= 14; k++) {
      const limit = Math.min(budget, (total / n) * (1 + k * 0.035) + size * 0.5);
      const cand = wrapAny(limit);
      if (cand.length <= n) {
        lines = cand;
        break;
      }
    }

    let widest = 0;
    let shortest = Infinity;
    for (const l of lines) {
      const w = g.measureText(l).width;
      if (w > widest) widest = w;
      if (w < shortest) shortest = w;
    }

    const balanced = lines.length === 1 || shortest >= widest * 0.25;
    last = { lines, size };

    if (lines.length <= maxLines && widest <= budget && balanced) {
      g.font = font(size);
      return last;
    }
  }

  g.font = font(last.size);
  return last;
}
