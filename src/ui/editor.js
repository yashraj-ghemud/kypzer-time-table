/**
 * Code-editor-style textarea: a transparent textarea over a highlighted mirror.
 * Tokens come from the parser (spans), so the highlight shows exactly what the engine understood.
 * Programmatic rewrites go through execCommand('insertText') to keep native undo (Ctrl+Z) working.
 */
import { h, esc, prefersReducedMotion } from '../core/dom.js';

const EXAMPLES = [
  '3:45pm : come to room\n3:50 to 5 pm : work\n5:00 to 7 pm : call to wife',
  'subah 7 baje gym\nsadhe 9 se 1 baje tak padhai\ndopahar 1 baje khana\nrevision 2h',
  '9 to 12 deep work\nlunch at 12:30 for 45 min\nstandup 2pm 15m\nreport 1h before 6pm !\nevening walk 30m',
];

export function createEditor(root, { onInput, onCaretEntry, placeholder = true } = {}) {
  root.innerHTML = '';
  const hl = h('pre.ed-hl', { 'aria-hidden': 'true' });
  const ta = h('textarea', { spellcheck: 'false', autocapitalize: 'off', autocomplete: 'off', 'aria-label': 'Type your day', id: 'plan-input' });
  const empty = h('div.ed-empty', { 'aria-hidden': 'true' });
  root.append(hl, ta, empty);

  let tokens = [];
  let lineRange = null;
  let flash = null;

  function render() {
    const text = ta.value;
    let out = '';
    let pos = 0;
    const marks = [];
    for (const t of tokens) if (t.s >= pos && t.e <= text.length) marks.push(t);
    // entry highlight ranges as background wraps (non-overlapping with tokens: we emit segments)
    const bounds = new Set([0, text.length]);
    for (const m of marks) {
      bounds.add(m.s);
      bounds.add(m.e);
    }
    const bgs = [lineRange, flash].filter(Boolean);
    for (const r of bgs) {
      bounds.add(Math.max(0, r.s));
      bounds.add(Math.min(text.length, r.e));
    }
    const pts = [...bounds].sort((a, b) => a - b);
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      if (b <= a) continue;
      const tok = marks.find((m) => m.s <= a && b <= m.e);
      const cls = [];
      if (tok) cls.push('tk-' + tok.type);
      if (lineRange && lineRange.s <= a && b <= lineRange.e) cls.push('hl-line');
      if (flash && flash.s <= a && b <= flash.e) cls.push('flash-line');
      const chunk = esc(text.slice(a, b));
      out += cls.length ? `<span class="${cls.join(' ')}">${chunk}</span>` : chunk;
      pos = b;
    }
    // trailing newline needs a character so heights match
    hl.innerHTML = out + '\n ';
    empty.style.display = text ? 'none' : '';
    autosize();
  }

  function autosize() {
    ta.style.height = 'auto';
    ta.style.height = Math.max(250, ta.scrollHeight) + 'px';
  }

  // animated placeholder: types example plans
  let phTimer = 0;
  function runPlaceholder() {
    clearTimeout(phTimer);
    if (!placeholder) return;
    if (prefersReducedMotion()) {
      empty.innerHTML = esc(EXAMPLES[0]);
      return;
    }
    let ex = 0;
    let i = 0;
    let dir = 1;
    const tick = () => {
      if (ta.value) {
        phTimer = setTimeout(tick, 600);
        return;
      }
      const s = EXAMPLES[ex];
      i += dir;
      if (i > s.length) {
        dir = -1;
        i = s.length;
        phTimer = setTimeout(tick, 2200);
        empty.innerHTML = esc(s) + '<span class="caret"></span>';
        return;
      }
      if (i < 0) {
        dir = 1;
        i = 0;
        ex = (ex + 1) % EXAMPLES.length;
      }
      empty.innerHTML = esc(s.slice(0, i)) + '<span class="caret"></span>';
      phTimer = setTimeout(tick, dir > 0 ? 26 + Math.random() * 40 : 8);
    };
    tick();
  }
  runPlaceholder();

  ta.addEventListener('input', () => {
    render();
    onInput && onInput(ta.value);
  });
  ta.addEventListener('scroll', () => {
    hl.scrollTop = ta.scrollTop;
  });
  const caret = () => onCaretEntry && onCaretEntry(ta.selectionStart);
  ta.addEventListener('click', caret);
  ta.addEventListener('keyup', (e) => {
    if (e.key.startsWith('Arrow') || e.key === 'Home' || e.key === 'End') caret();
  });
  ta.addEventListener('keydown', (e) => {
    if (e.key === 'Tab' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
      // keep Tab for focus navigation (accessibility)
    }
  });
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => autosize()).observe(root);

  return {
    el: ta,
    get value() {
      return ta.value;
    },
    setValue(v, { silent = false } = {}) {
      if (ta.value === v) return;
      ta.value = v;
      render();
      if (!silent && onInput) onInput(v);
    },
    /** Replace whole text keeping undo history where possible. */
    replaceAll(v) {
      if (ta.value === v) return;
      const before = ta.value;
      ta.focus({ preventScroll: true });
      ta.setSelectionRange(0, before.length);
      let ok = false;
      try {
        ok = document.execCommand('insertText', false, v);
      } catch {
        ok = false;
      }
      if (!ok || ta.value !== v) {
        ta.value = v;
        render();
        onInput && onInput(v);
      }
    },
    setTokens(t) {
      tokens = t || [];
      render();
    },
    highlightRange(r) {
      lineRange = r;
      render();
    },
    flashRange(r) {
      flash = r;
      render();
      clearTimeout(this._ft);
      this._ft = setTimeout(() => {
        flash = null;
        render();
      }, 1400);
    },
    focus() {
      ta.focus();
    },
    selectRange(s, e) {
      ta.focus();
      ta.setSelectionRange(s, e);
    },
    refresh: render,
  };
}

export { EXAMPLES };
