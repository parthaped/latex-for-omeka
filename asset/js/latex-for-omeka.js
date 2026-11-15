/* LaTeX for Omeka: renders the LaTeX blocks in a transcription as HTML tables, lists and KaTeX math. */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.LatexForOmeka = api;
    api.start();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---------------------------------------------------------------- text helpers

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }

  // Omeka's own literal rendering, so text outside the blocks looks exactly as it did.
  function nl2br(s) {
    return s.replace(/(\r\n|\n\r|\n|\r)/g, '<br />$1');
  }

  var ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

  // Scripto stores the wiki's HTML with tags stripped but entities kept, so "a & b" arrives as "a &amp; b".
  function decodeEntities(s) {
    return s.replace(/&(#[xX][0-9a-fA-F]{1,6}|#\d{1,7}|amp|lt|gt|quot|apos|nbsp);/g, function (m, e) {
      if (e[0] !== '#') return ENTITIES[e];
      var code = /^#[xX]/.test(e) ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      if (code === 160) return ' ';
      try { return String.fromCodePoint(code); } catch (err) { return m; }
    });
  }

  function mathHtml(tex, display, block) {
    var tag = block ? 'div' : 'span';
    return '<' + tag + ' class="lfo-math" data-display="' + (display ? 'true' : 'false') + '">' +
      esc(tex.trim()) + '</' + tag + '>';
  }

  function raw(src, cls, title) {
    return '<pre class="lfo-raw ' + cls + '" title="' + esc(title) + '">' + esc(src) + '</pre>';
  }

  // A reader over a string for LaTeX arguments: {required}, [optional], one token.
  function Cursor(s, i) {
    this.s = s;
    this.i = i || 0;
  }
  Cursor.prototype.done = function () { return this.i >= this.s.length; };
  Cursor.prototype.skipSpace = function () {
    while (this.i < this.s.length && /\s/.test(this.s[this.i])) this.i++;
  };
  Cursor.prototype.req = function () {
    this.skipSpace();
    var c = this.s[this.i];
    if (c === undefined || c === '}') return '';
    if (c === '{') return this.balanced('}');
    if (c === '\\') {
      var m = /\\(?:[A-Za-z]+|[\s\S])?/y;
      m.lastIndex = this.i;
      var r = m.exec(this.s);
      this.i += r[0].length;
      return r[0];
    }
    this.i++;
    return c;
  };
  Cursor.prototype.opt = function (open, close) {
    open = open || '[';
    close = close || ']';
    var save = this.i;
    this.skipSpace();
    if (this.s[this.i] !== open) {
      this.i = save;
      return null;
    }
    return this.balanced(close);
  };
  // At an opening bracket: the text up to its closing partner, braces kept balanced.
  Cursor.prototype.balanced = function (close) {
    var start = ++this.i;
    var depth = 0;
    while (this.i < this.s.length) {
      var c = this.s[this.i];
      if (c === '\\') { this.i += 2; continue; }
      if (c === '{') depth++;
      else if (c === '}') {
        if (depth === 0 && close === '}') return this.s.slice(start, this.i++);
        depth = Math.max(0, depth - 1);
      } else if (c === close && depth === 0) {
        return this.s.slice(start, this.i++);
      }
      this.i++;
    }
    this.i = this.s.length;
    return this.s.slice(start);
  };

  // LaTeX comments run to the end of the line and swallow the next line's indent.
  function stripComments(s) {
    var out = '';
    var i = 0;
    while (i < s.length) {
      var c = s[i];
      var literalEnd = verbatimEnd(s, i);
      if (literalEnd !== null) {
        out += s.slice(i, literalEnd);
        i = literalEnd;
        continue;
      }
      if (c === '\\') { out += s.slice(i, i + 2); i += 2; continue; }
      if (c === '%') {
        while (i < s.length && s[i] !== '\n') i++;
        i++;
        while (i < s.length && (s[i] === ' ' || s[i] === '\t')) i++;
        continue;
      }
      out += c;
      i++;
    }
    return out;
  }

  // Calls visit(i) at each position outside braces and nested environments; visit returns chars consumed.
  function scanTop(s, visit) {
    var depth = 0;
    var env = 0;
    var i = 0;
    while (i < s.length) {
      if (depth === 0 && env === 0) {
        var n = visit(i);
        if (n) { i += n; continue; }
      }
      var literalEnd = verbatimEnd(s, i);
      if (literalEnd !== null) { i = literalEnd; continue; }
      var c = s[i];
      if (c === '\\') {
        if (s.startsWith('\\begin{', i)) env++;
        else if (s.startsWith('\\end{', i)) env = Math.max(0, env - 1);
        i += 2;
        continue;
      }
      if (c === '{') depth++;
      else if (c === '}') depth = Math.max(0, depth - 1);
      i++;
    }
  }

  var VERBATIM = { verbatim: 1, 'verbatim*': 1, lstlisting: 1, Verbatim: 1 };

  // Literal regions must be opaque to comment removal and structural scanning.
  function verbatimEnd(s, i) {
    if (s[i] !== '\\') return null;
    var verb = /^\\verb(?![A-Za-z])\*?([^\s])/.exec(s.slice(i));
    if (verb) {
      var end = s.indexOf(verb[1], i + verb[0].length);
      return end < 0 ? s.length : end + 1;
    }
    var env = /^\\begin\{(verbatim\*?|lstlisting|Verbatim)\}/.exec(s.slice(i));
    if (!env) return null;
    var close = '\\end{' + env[1] + '}';
    var endEnv = s.indexOf(close, i + env[0].length);
    return endEnv < 0 ? s.length : endEnv + close.length;
  }

  // At "\begin{name}": where its body starts and ends, or null when it is never closed.
  function findEnv(s, i) {
    var m = /\\begin\{([A-Za-z]+\*?)\}/y;
    m.lastIndex = i;
    var r = m.exec(s);
    if (!r) return null;
    var name = r[1];
    var open = '\\begin{' + name + '}';
    var close = '\\end{' + name + '}';
    var bodyStart = i + r[0].length;
    if (VERBATIM[name]) {
      var e = s.indexOf(close, bodyStart);
      return e < 0 ? null : { name: name, bodyStart: bodyStart, bodyEnd: e, end: e + close.length };
    }
    var depth = 1;
    var k = bodyStart;
    while (k < s.length) {
      if (s[k] === '%') {
        while (k < s.length && s[k] !== '\n') k++;
        continue;
      }
      var literalEnd = verbatimEnd(s, k);
      if (literalEnd !== null) { k = literalEnd; continue; }
      if (s[k] === '\\') {
        if (s.startsWith(open, k)) { depth++; k += open.length; continue; }
        if (s.startsWith(close, k)) {
          depth--;
          if (depth === 0) return { name: name, bodyStart: bodyStart, bodyEnd: k, end: k + close.length };
          k += close.length;
          continue;
        }
        k += 2;
        continue;
      }
      k++;
    }
    return null;
  }

  function findClose(s, from, close) {
    var k = from;
    while (k < s.length) {
      if (s.startsWith(close, k)) return k;
      k += s[k] === '\\' ? 2 : 1;
    }
    return -1;
  }

  // ---------------------------------------------------------------- the transcription

  /** {found, html}: the value's HTML with every LaTeX block rendered; found is false when there were none. */
  function render(text, options) {
    options = options || {};
    var s = String(text == null ? '' : text);
    // The module may already have decoded the value on the server; a second pass would change real "&lt;" text.
    var decode = options.entitiesDecoded ? function (t) { return t; } : decodeEntities;
    var pieces = [];
    var last = 0;
    var i = 0;
    var found = false;
    while (i < s.length) {
      var c = s[i];
      var hit = null;
      if (c === '\\') {
        var n = s[i + 1];
        if (n === '\\') { i += 2; continue; }
        if (n === 'b') hit = topEnvironment(s, i, decode);
        else if (n === '[') hit = topMath(s, i, '\\]', true, decode);
        else if (n === '(') hit = topMath(s, i, '\\)', false, decode);
      } else if (c === '$' && options.dollarMath) {
        hit = topDollar(s, i, decode);
      }
      if (!hit) { i++; continue; }
      found = true;
      pieces.push({ kind: 'text', text: s.slice(last, i) });
      pieces.push(hit);
      i = last = hit.end;
    }
    if (!found) return { found: false, html: nl2br(esc(s)) };
    pieces.push({ kind: 'text', text: s.slice(last) });
    var html = '';
    for (var k = 0; k < pieces.length; k++) {
      var p = pieces[k];
      if (p.kind !== 'text') { html += p.html; continue; }
      var t = p.text;
      // A block already starts and ends its own line: the newline beside it is not an extra break.
      if (k > 0 && pieces[k - 1].kind === 'block') t = t.replace(/^[ \t]*\r?\n/, '');
      if (k + 1 < pieces.length && pieces[k + 1].kind === 'block') t = t.replace(/\r?\n[ \t]*$/, '');
      html += nl2br(esc(t));
    }
    return { found: true, html: html };
  }

  function topEnvironment(s, i, decode) {
    var env = findEnv(s, i);
    if (!env) return null;
    return {
      kind: env.name === 'math' ? 'inline' : 'block',
      html: renderEnvironment(env.name, decode(s.slice(env.bodyStart, env.bodyEnd)),
        decode(s.slice(i, env.end))),
      end: env.end,
    };
  }

  function topMath(s, i, close, display, decode) {
    var k = findClose(s, i + 2, close);
    if (k < 0) return null;
    var tex = decode(s.slice(i + 2, k));
    if (!tex.trim()) return null;
    return { kind: display ? 'block' : 'inline', html: mathHtml(tex, display, display), end: k + 2 };
  }

  // $...$ only when the site opts in, with Pandoc's rules so "$5 and $10" stays text.
  function topDollar(s, i, decode) {
    if (i > 0 && s[i - 1] === '\\') return null;
    if (s[i + 1] === '$') {
      var d = findClose(s, i + 2, '$$');
      if (d < 0 || !s.slice(i + 2, d).trim()) return null;
      return { kind: 'block', html: mathHtml(decode(s.slice(i + 2, d)), true, true), end: d + 2 };
    }
    if (!s[i + 1] || /\s/.test(s[i + 1])) return null;
    var k = findClose(s, i + 1, '$');
    if (k < 0 || /\s/.test(s[k - 1]) || /\d/.test(s[k + 1] || '')) return null;
    var tex = decode(s.slice(i + 1, k));
    if (/\n[ \t]*\n/.test(tex)) return null;
    return { kind: 'inline', html: mathHtml(tex, false, false), end: k + 1 };
  }

  // ---------------------------------------------------------------- environments

  var MATH_ENVS = {
    equation: 1, align: 1, alignat: 1, gather: 1, multline: 1, flalign: 1, eqnarray: 1, displaymath: 1,
    math: 1, array: 1, matrix: 1, pmatrix: 1, bmatrix: 1, Bmatrix: 1, vmatrix: 1, Vmatrix: 1, smallmatrix: 1,
    cases: 1, split: 1, aligned: 1, gathered: 1, alignedat: 1, CD: 1,
  };
  // A transcription has no equation numbers of its own: numbered forms become their starred twins.
  var MATH_RENAME = {
    equation: 'equation*', align: 'align*', alignat: 'alignat*', gather: 'gather*', flalign: 'align*',
    'flalign*': 'align*', multline: 'gather*', 'multline*': 'gather*', split: 'aligned',
  };
  var TABULAR = { tabular: 1, tabularx: 1, tabulary: 1, longtable: 1 };

  function renderEnvironment(name, body, src) {
    try {
      return environment(name, body, src);
    } catch (e) {
      return raw(src, 'lfo-error', 'This LaTeX could not be read, so it is shown as written');
    }
  }

  function environment(name, body, src) {
    var base = name.replace(/\*$/, '');
    if (VERBATIM[name]) {
      return '<pre class="lfo-verbatim">' + esc(body.replace(/^[ \t]*\r?\n/, '').replace(/\r?\n[ \t]*$/, '')) + '</pre>';
    }
    if (MATH_ENVS[base]) return mathEnvironment(name, body);
    body = stripComments(body);
    if (TABULAR[base]) return tabular(name, base, body);
    var c;
    switch (base) {
      case 'table':
      case 'figure':
        return floatEnvironment(body);
      case 'center':
        return '<div class="lfo-center">' + blockContent(body) + '</div>';
      case 'flushleft':
        return '<div class="lfo-left">' + blockContent(body) + '</div>';
      case 'flushright':
        return '<div class="lfo-right">' + blockContent(body) + '</div>';
      case 'itemize':
      case 'enumerate':
      case 'description':
        return list(base, body);
      case 'quote':
      case 'quotation':
      case 'verse':
        return '<blockquote class="lfo-quote">' + blockContent(body) + '</blockquote>';
      case 'minipage':
        c = new Cursor(body);
        c.opt(); c.opt(); c.opt(); c.req();
        return '<div class="lfo-minipage">' + blockContent(body.slice(c.i)) + '</div>';
      case 'multicols':
        c = new Cursor(body);
        c.req();
        return '<div class="lfo-columns">' + blockContent(body.slice(c.i)) + '</div>';
    }
    return raw(src, 'lfo-unsupported', 'The LaTeX environment “' + name + '” is shown as written');
  }

  function mathEnvironment(name, body) {
    var clean = body.replace(/\\label\s*\{[^}]*\}/g, '').replace(/\\(?:nonumber|notag)(?![A-Za-z])/g, '');
    if (name === 'math') return mathHtml(clean, false, false);
    if (name === 'displaymath') return mathHtml(clean, true, true);
    if (name === 'eqnarray' || name === 'eqnarray*') {
      return mathHtml('\\begin{array}{rcl}' + clean + '\\end{array}', true, true);
    }
    var env = MATH_RENAME[name] || name;
    return mathHtml('\\begin{' + env + '}' + clean + '\\end{' + env + '}', true, true);
  }

  // Running text with paragraphs and nested environments; bare skips the <p> around a lone paragraph.
  function blockContent(src, bare) {
    var parts = [];
    var last = 0;
    scanTop(src, function (i) {
      if (src[i] !== '\\' || !src.startsWith('\\begin{', i)) return 0;
      var env = findEnv(src, i);
      if (!env || env.name === 'math') return 0;
      parts.push({ text: src.slice(last, i) });
      parts.push({ html: renderEnvironment(env.name, src.slice(env.bodyStart, env.bodyEnd), src.slice(i, env.end)) });
      last = env.end;
      return env.end - i;
    });
    parts.push({ text: src.slice(last) });
    var out = [];
    parts.forEach(function (p) {
      if (p.html !== undefined) { out.push({ block: true, html: p.html }); return; }
      p.text.split(/\n[ \t]*\n|\\par(?![A-Za-z])/).forEach(function (para) {
        var h = inline(para).trim();
        if (h) out.push({ block: false, html: h });
      });
    });
    if (bare && out.length === 1 && !out[0].block) return out[0].html;
    return out.map(function (o) { return o.block ? o.html : '<p>' + o.html + '</p>'; }).join('');
  }

  function floatEnvironment(body) {
    var c = new Cursor(body);
    c.opt();
    var rest = body.slice(c.i);
    var caption = null;
    var cut = null;
    scanTop(rest, function (i) {
      if (caption !== null || !/^\\caption(?![A-Za-z])/.test(rest.slice(i, i + 9))) return 0;
      var cur = new Cursor(rest, i + 8);
      if (rest[cur.i] === '*') cur.i++;
      cur.opt();
      caption = inline(cur.req()).trim();
      cut = [i, cur.i];
      return cur.i - i;
    });
    var captionFirst = false;
    if (cut) {
      var firstEnv = rest.indexOf('\\begin{');
      captionFirst = firstEnv < 0 || cut[0] < firstEnv;
      rest = rest.slice(0, cut[0]) + rest.slice(cut[1]);
    }
    var centered = /\\centering(?![A-Za-z])/.test(rest);
    var fig = caption ? '<figcaption>' + caption + '</figcaption>' : '';
    return '<figure class="lfo-float' + (centered ? ' lfo-center' : '') + '">' +
      (captionFirst ? fig : '') + blockContent(rest) + (captionFirst ? '' : fig) + '</figure>';
  }

  function list(base, body) {
    var c = new Cursor(body);
    c.opt();
    body = body.slice(c.i);
    var marks = [];
    scanTop(body, function (i) {
      if (body[i] !== '\\' || !/^\\item(?![A-Za-z])/.test(body.slice(i, i + 6))) return 0;
      var cur = new Cursor(body, i + 5);
      var label = cur.opt();
      marks.push({ at: i, end: cur.i, label: label });
      return cur.i - i;
    });
    var items = marks.map(function (m, k) {
      return { label: m.label, text: body.slice(m.end, k + 1 < marks.length ? marks[k + 1].at : body.length) };
    });
    if (base === 'description') {
      return '<dl class="lfo-description">' + items.map(function (it) {
        return '<dt>' + inline(it.label || '').trim() + '</dt><dd>' + blockContent(it.text, true) + '</dd>';
      }).join('') + '</dl>';
    }
    var tag = base === 'enumerate' ? 'ol' : 'ul';
    return '<' + tag + ' class="lfo-list">' + items.map(function (it) {
      if (it.label === null) return '<li>' + blockContent(it.text, true) + '</li>';
      return '<li class="lfo-custom"><span class="lfo-item-label">' + inline(it.label).trim() + '</span> ' +
        blockContent(it.text, true) + '</li>';
    }).join('') + '</' + tag + '>';
  }

  // ---------------------------------------------------------------- tables

  function cssLength(s) {
    s = String(s).trim();
    var m = /^(\d*\.?\d+)\s*(cm|mm|in|pt|pc|em|ex|bp|px)$/.exec(s);
    if (m) return m[1] + (m[2] === 'bp' ? 'pt' : m[2]);
    m = /^(\d*\.?\d*)\s*\\(?:linewidth|textwidth|columnwidth|hsize)$/.exec(s);
    if (m) return String(Math.round(Math.min(1, parseFloat(m[1] || '1')) * 1000) / 10) + '%';
    return null;
  }

  function newColumn(pre) {
    return { align: 'l', wrap: false, valign: null, width: null, rules: 0, sep: null, tight: false, pre: pre, post: '' };
  }

  // Separate control words at argument boundaries without adding visible space.
  function joinLatex(left, right) {
    return left + (/(?:^|[^\\])(?:\\\\)*\\[A-Za-z]+$/.test(left) && /^[A-Za-z]/.test(right) ? '{}' : '') + right;
  }

  // The column spec, e.g. "|l|r@{.}l|" or "*{3}{c}": each column's alignment, rules and separators.
  function parseSpec(spec) {
    var cols = [];
    var lead = { rules: 0, sep: null, tight: false };
    var pre = '';
    var c = new Cursor(spec);
    var guard = 0;
    while (!c.done() && guard++ < 5000) {
      var ch = c.s[c.i++];
      if (/\s/.test(ch)) continue;
      var last = cols[cols.length - 1];
      if (ch === '|' || ch === ':') {
        if (last) last.rules++; else lead.rules++;
      } else if (ch === '@' || ch === '!') {
        var t = c.req();
        var target = last || lead;
        target.sep = t;
        target.tight = ch === '@';
      } else if (ch === '>') {
        pre = joinLatex(pre, c.req());
      } else if (ch === '<') {
        var post = c.req();
        if (last) last.post = joinLatex(last.post, post);
      } else if (ch === '*') {
        var n = Math.min(parseInt(c.req(), 10) || 0, 100);
        var inner = c.req();
        c.s = c.s.slice(0, c.i) + new Array(n + 1).join(inner) + c.s.slice(c.i);
      } else {
        var col = newColumn(pre);
        pre = '';
        if (ch === 'c' || ch === 'C') col.align = 'c';
        else if (ch === 'r' || ch === 'R') col.align = 'r';
        if (ch === 'p' || ch === 'm' || ch === 'b') {
          col.wrap = true;
          col.width = cssLength(c.req());
          col.valign = { p: 'top', m: 'middle', b: 'bottom' }[ch];
        } else if (ch === 'X' || ch === 'L' || ch === 'C' || ch === 'R' || ch === 'J') {
          col.wrap = true;
        } else if (ch === 'S') {
          col.align = 'r';
          c.opt();
        } else if (ch === 'D') {
          c.req(); c.req(); c.req();
          col.align = 'r';
        } else if (ch === 'w' || ch === 'W') {
          var a = c.req().trim();
          col.align = a === 'c' ? 'c' : a === 'r' ? 'r' : 'l';
          col.width = cssLength(c.req());
        }
        cols.push(col);
      }
    }
    return { cols: cols, lead: lead };
  }

  function splitRows(body) {
    var rows = [];
    var last = 0;
    var BREAK = /\\\\\*?|\\tabularnewline(?![A-Za-z])/y;
    scanTop(body, function (i) {
      if (body[i] !== '\\') return 0;
      BREAK.lastIndex = i;
      var m = BREAK.exec(body);
      if (!m) return 0;
      var n = m[0].length;
      var space = /\s*\[[^\]]*\]/y;
      space.lastIndex = i + n;
      var r = space.exec(body);
      if (r) n += r[0].length;
      rows.push(body.slice(last, i));
      last = i + n;
      return n;
    });
    rows.push(body.slice(last));
    return rows;
  }

  function splitCells(row) {
    var cells = [];
    var last = 0;
    scanTop(row, function (i) {
      if (row[i] !== '&') return 0;
      cells.push(row.slice(last, i));
      last = i + 1;
      return 1;
    });
    cells.push(row.slice(last));
    return cells;
  }

  function parseSpan(s) {
    var m = /^\s*(\d+)\s*(?:-\s*(\d+))?\s*$/.exec(s);
    if (!m) return null;
    var a = parseInt(m[1], 10);
    var b = m[2] ? parseInt(m[2], 10) : a;
    return [Math.min(a, b), Math.max(a, b)];
  }

  var SECTION_MARKERS = { endfirsthead: 'firsthead', endhead: 'head', endfoot: 'foot', endlastfoot: 'lastfoot' };

  // The rules (\hline, \toprule, \cline{2-3} ...) and longtable markers that open a row.
  function leadingRules(chunk) {
    var cur = new Cursor(chunk);
    var rules = [];
    var WORD = /\\([A-Za-z]+)(?![A-Za-z])/y;
    for (;;) {
      cur.skipSpace();
      WORD.lastIndex = cur.i;
      var r = WORD.exec(chunk);
      if (!r) break;
      var name = r[1];
      var after = cur.i + r[0].length;
      if (name === 'hline' || name === 'firsthline' || name === 'lasthline') {
        cur.i = after;
        rules.push({ kind: 'single' });
      } else if (name === 'toprule' || name === 'bottomrule' || name === 'midrule') {
        cur.i = after;
        cur.opt();
        rules.push({ kind: name === 'midrule' ? 'single' : 'heavy', name: name });
      } else if (name === 'specialrule') {
        cur.i = after;
        cur.req(); cur.req(); cur.req();
        rules.push({ kind: 'heavy' });
      } else if (name === 'cline' || name === 'cmidrule') {
        cur.i = after;
        if (name === 'cmidrule') { cur.opt(); cur.opt('(', ')'); }
        var span = parseSpan(cur.req());
        if (span) rules.push({ kind: 'single', span: span });
      } else if (name === 'hhline') {
        cur.i = after;
        rules.push({ kind: cur.req().indexOf('=') >= 0 ? 'double' : 'single' });
      } else if (name === 'addlinespace') {
        cur.i = after;
        cur.opt();
        rules.push({ kind: 'space' });
      } else if (name === 'morecmidrules') {
        cur.i = after;
      } else if (name === 'noalign' || name === 'rowcolor') {
        cur.i = after;
        cur.opt();
        cur.req();
      } else if (SECTION_MARKERS[name]) {
        cur.i = after;
        rules.push({ marker: SECTION_MARKERS[name] });
      } else {
        break;
      }
    }
    return { rules: rules, rest: chunk.slice(cur.i) };
  }

  function parseCell(src, col, spec) {
    var s = src.trim();
    var own = null;
    var colspan = 1;
    var mc = /^\\multicolumn(?![A-Za-z])/.exec(s);
    if (mc) {
      var cur = new Cursor(s, mc[0].length);
      colspan = Math.max(1, Math.min(parseInt(cur.req(), 10) || 1, 200));
      own = parseSpec(cur.req());
      s = cur.req() + s.slice(cur.i);
    }
    var rowspan = 1;
    var mr = /^\s*\\multirow(?![A-Za-z])/.exec(s);
    if (mr) {
      var r = new Cursor(s, mr[0].length);
      r.opt();
      rowspan = parseInt(r.req(), 10) || 1;
      r.opt();
      r.req();
      r.opt();
      s = r.req() + s.slice(r.i);
    }
    var props = own ? (own.cols[0] || newColumn('')) : (spec.cols[col] || newColumn(''));
    var lastProps = own ? props : (spec.cols[col + colspan - 1] || props);
    var lead = own ? own.lead : (col === 0 ? spec.lead : null);
    var prevCol = !own && col > 0 ? spec.cols[col - 1] : null;
    var text = joinLatex(joinLatex(props.pre || '', s), lastProps.post || '');
    var html = inline(text).trim();
    if (lead && lead.sep !== null) html = inline(lead.sep).trim() + html;
    if (lastProps.sep !== null) html += inline(lastProps.sep).trim();
    return {
      html: html,
      blank: !s.trim(),
      col: col,
      colspan: colspan,
      rowspan: rowspan,
      align: props.align,
      wrap: props.wrap,
      valign: props.valign,
      width: colspan === 1 ? props.width : null,
      left: lead ? lead.rules : 0,
      right: lastProps.rules,
      tightL: !!((lead && lead.tight) || (prevCol && prevCol.tight)),
      tightR: lastProps.tight,
    };
  }

  function ruleKind(rules) {
    var full = rules.filter(function (r) { return !r.span && r.kind !== 'space'; });
    if (!full.length) return rules.some(function (r) { return r.kind === 'space'; }) ? 'space' : null;
    if (full.some(function (r) { return r.kind === 'heavy'; })) return 'heavy';
    if (full.length > 1 || full[0].kind === 'double') return 'double';
    return 'single';
  }

  function spansCell(rules, cell) {
    return rules.some(function (r) {
      return r.span && r.span[0] <= cell.col + cell.colspan && r.span[1] >= cell.col + 1;
    });
  }

  // HTML rowspans: drop the empty placeholder cells LaTeX keeps under a \multirow.
  function resolveSpans(rows) {
    rows.forEach(function (row, r) {
      row.cells.forEach(function (cell) {
        if (cell.rowspan >= 0) return;
        var n = -cell.rowspan;
        var target = rows[Math.max(0, r - n + 1)];
        var above = target.cells.filter(function (c) { return c.col === cell.col; })[0];
        cell.rowspan = 1;
        if (above && above !== cell && above.blank) {
          above.html = cell.html;
          above.blank = cell.blank;
          above.rowspan = Math.min(n, r - rows.indexOf(target) + 1);
          cell.html = '';
          cell.blank = true;
        }
      });
    });
    var cover = {};
    rows.forEach(function (row, r) {
      row.kept = [];
      row.cells.forEach(function (cell) {
        var owner = null;
        for (var k = cell.col; k < cell.col + cell.colspan; k++) {
          if (cover[k] && cover[k].left > 0) owner = cover[k].cell;
        }
        if (owner) {
          // LaTeX would print over the spanned cell; keep the words rather than lose them.
          if (!cell.blank) owner.html += (owner.html ? '<br />' : '') + cell.html;
          return;
        }
        cell.rowspan = Math.max(1, Math.min(cell.rowspan, rows.length - r));
        row.kept.push(cell);
      });
      Object.keys(cover).forEach(function (k) { cover[k].left--; });
      row.kept.forEach(function (cell) {
        if (cell.rowspan < 2) return;
        for (var k = cell.col; k < cell.col + cell.colspan; k++) cover[k] = { left: cell.rowspan - 1, cell: cell };
      });
    });
  }

  function cellHtml(c, tag, row) {
    var cls = ['lfo-' + c.align];
    if (c.wrap) cls.push('lfo-wrap');
    if (c.left) cls.push(c.left > 1 ? 'lfo-bl2' : 'lfo-bl');
    if (c.right) cls.push(c.right > 1 ? 'lfo-br2' : 'lfo-br');
    if (c.tightL) cls.push('lfo-tl');
    if (c.tightR) cls.push('lfo-tr');
    if (spansCell(row.top, c)) cls.push('lfo-ct');
    if (row.bottom && spansCell(row.bottom, c)) cls.push('lfo-cb');
    if (c.rowspan > 1) cls.push('lfo-vm');
    else if (c.valign) cls.push('lfo-v' + c.valign[0]);
    var attrs = ' class="' + cls.join(' ') + '"';
    if (c.colspan > 1) attrs += ' colspan="' + c.colspan + '"';
    if (c.rowspan > 1) attrs += ' rowspan="' + c.rowspan + '"';
    if (c.width) attrs += ' style="width:' + c.width + '"';
    if (tag === 'th') attrs += c.colspan > 1 ? ' scope="colgroup"' : ' scope="col"';
    return '<' + tag + attrs + '>' + c.html + '</' + tag + '>';
  }

  function rowHtml(row, tag) {
    var cls = [];
    var top = ruleKind(row.top);
    if (top) cls.push('lfo-rt-' + top);
    var bottom = row.bottom ? ruleKind(row.bottom) : null;
    if (bottom) cls.push('lfo-rb-' + bottom);
    return '<tr' + (cls.length ? ' class="' + cls.join(' ') + '"' : '') + '>' +
      row.kept.map(function (c) { return cellHtml(c, tag, row); }).join('') + '</tr>';
  }

  function tabular(name, base, body) {
    var c = new Cursor(body);
    if (name === 'tabular*' || base === 'tabularx' || base === 'tabulary') c.req();
    c.opt();
    var spec = parseSpec(c.req());
    var ncols = Math.max(1, spec.cols.length);
    var chunks = splitRows(body.slice(c.i));
    var rows = [];
    var pending = [];
    var sectionStart = 0;
    var caption = null;
    var sections = {};
    chunks.forEach(function (chunk, k) {
      var lead = leadingRules(chunk);
      lead.rules.forEach(function (r) {
        if (!r.marker) { pending.push(r); return; }
        // A rule written before \endhead or \endfoot closes that section, under its last row.
        if (pending.length && rows.length > sectionStart) {
          rows[rows.length - 1].bottom = pending;
          pending = [];
        }
        sections[r.marker] = rows.slice(sectionStart);
        sectionStart = rows.length;
      });
      var rest = lead.rest;
      if (base === 'longtable') {
        var cap = /^\s*\\caption(?![A-Za-z])/.exec(rest);
        if (cap) {
          var cur = new Cursor(rest, cap[0].length);
          if (rest[cur.i] === '*') cur.i++;
          cur.opt();
          caption = inline(cur.req()).trim();
          return;
        }
      }
      if (!rest.trim() && k === chunks.length - 1) return;
      var cells = [];
      var col = 0;
      splitCells(rest).forEach(function (part) {
        var cell = parseCell(part, col, spec);
        cells.push(cell);
        col += cell.colspan;
      });
      for (; col < ncols; col++) cells.push(parseCell('', col, spec));
      rows.push({ top: pending, cells: cells });
      pending = [];
    });
    if (rows.length && pending.length) rows[rows.length - 1].bottom = pending;

    var head = [];
    var foot = [];
    var bodyRows = rows.slice(sectionStart);
    if (base === 'longtable') {
      head = sections.firsthead || sections.head || [];
      foot = sections.lastfoot || sections.foot || [];
    } else if (rows.length && rows[0].top.some(function (r) { return r.name === 'toprule'; })) {
      // Booktabs: keep headers unless numeric ledger entries precede a final labelled total.
      for (var k = 1; k < rows.length; k++) {
        if (rows[k].top.some(function (r) { return r.name === 'midrule'; })) {
          var label = rows[k].cells[0].html.replace(/<[^>]*>/g, '').trim();
          var finalTotal = k === rows.length - 1 && /^(?:(?:grand|sub)\s*)?totals?(?:\s|:|$)/i.test(label);
          var ledgerBeforeTotal = finalTotal && rows.slice(0, k).every(function (row) {
            return row.cells.slice(1).some(function (cell) {
              var amount = cell.html.replace(/<[^>]*>/g, '').trim();
              return /^\(?[+\-−]?\s*[$£€]?\s*\d[\d,\s]*(?:\.\d+)?\)?$/.test(amount);
            });
          });
          if (!ledgerBeforeTotal) {
            head = rows.slice(0, k);
            bodyRows = rows.slice(k);
          }
          break;
        }
      }
    }
    [head, bodyRows, foot].forEach(resolveSpans);
    var html = '<div class="lfo-table-wrap"><table class="lfo-table">';
    if (caption) html += '<caption>' + caption + '</caption>';
    if (head.length) html += '<thead>' + head.map(function (r) { return rowHtml(r, 'th'); }).join('') + '</thead>';
    html += '<tbody>' + bodyRows.map(function (r) { return rowHtml(r, 'td'); }).join('') + '</tbody>';
    if (foot.length) html += '<tfoot>' + foot.map(function (r) { return rowHtml(r, 'td'); }).join('') + '</tfoot>';
    return html + '</table></div>';
  }

  // ---------------------------------------------------------------- running text inside a block

  var SYMBOLS = {
    textbackslash: '\\', textasciitilde: '~', textasciicircum: '^', textunderscore: '_', textbar: '|',
    textless: '&lt;', textgreater: '&gt;', textbraceleft: '{', textbraceright: '}', textdollar: '$',
    ldots: '…', dots: '…', textellipsis: '…', pounds: '£', textsterling: '£',
    textcent: '¢', cent: '¢', S: '§', P: '¶', textsection: '§', textparagraph: '¶',
    dag: '†', ddag: '‡', textdagger: '†', textdaggerdbl: '‡', copyright: '©',
    textcopyright: '©', textregistered: '®', texttrademark: '™', textdegree: '°', degree: '°',
    textonehalf: '½', textonequarter: '¼', textthreequarters: '¾', checkmark: '✓',
    textbullet: '•', textperiodcentered: '·', textquoteleft: '‘', textquoteright: '’',
    textquotedblleft: '“', textquotedblright: '”', textendash: '–', textemdash: '—',
    textordfeminine: 'ª', textordmasculine: 'º', textmu: 'µ', textnumero: '№',
    guillemotleft: '«', guillemotright: '»', guillemetleft: '«', guillemetright: '»',
    ss: 'ß', SS: 'SS', ae: 'æ', AE: 'Æ', oe: 'œ', OE: 'Œ', o: 'ø', O: 'Ø',
    aa: 'å', AA: 'Å', l: 'ł', L: 'Ł', i: 'ı', j: 'ȷ', texttimes: '×',
    textdiv: '÷', textpm: '±', textminus: '−', textvisiblespace: '␣',
    quad: ' ', qquad: '  ', enspace: ' ', enskip: ' ', thinspace: ' ',
    LaTeX: 'LaTeX', TeX: 'TeX', newline: '<br />', par: '<br />', hfill: ' ', dotfill: ' … ',
  };

  var ACCENTS = {
    "'": '́', '`': '̀', '^': '̂', '"': '̈', '~': '̃', '=': '̄', '.': '̇',
    u: '̆', v: '̌', H: '̋', c: '̧', k: '̨', r: '̊', d: '̣', b: '̱',
    t: '͡',
  };

  // [signature, open, close]: o = optional argument skipped, r = required skipped, c = content shown.
  var COMMANDS = {
    textbf: ['c', '<b>', '</b>'], textit: ['c', '<i>', '</i>'], textsl: ['c', '<i>', '</i>'],
    emph: ['c', '<em>', '</em>'], underline: ['c', '<u>', '</u>'], uline: ['c', '<u>', '</u>'],
    uuline: ['c', '<u class="lfo-double">', '</u>'], sout: ['c', '<s>', '</s>'], st: ['c', '<s>', '</s>'],
    xout: ['c', '<s>', '</s>'], textsc: ['c', '<span class="lfo-sc">', '</span>'],
    texttt: ['c', '<code>', '</code>'], textsf: ['c', '<span class="lfo-sf">', '</span>'],
    textrm: ['c', '', ''], textnormal: ['c', '', ''], textup: ['c', '', ''], textmd: ['c', '', ''],
    mbox: ['c', '', ''], hbox: ['c', '', ''], text: ['c', '', ''],
    textsuperscript: ['c', '<sup>', '</sup>'], textsubscript: ['c', '<sub>', '</sub>'],
    footnote: ['oc', '<span class="lfo-footnote">', '</span>'], fbox: ['c', '<span class="lfo-box">', '</span>'],
    framebox: ['ooc', '<span class="lfo-box">', '</span>'], makebox: ['ooc', '', ''],
    makecell: ['oc', '<span class="lfo-stack">', '</span>'], shortstack: ['oc', '<span class="lfo-stack">', '</span>'],
    parbox: ['ooorc', '<span class="lfo-stack">', '</span>'], raisebox: ['rooc', '', ''],
    caption: ['oc', '<span class="lfo-caption">', '</span>'], multicolumn: ['rrc', '', ''],
    multirow: ['oroorc', '', ''],
    // Layout and colour instructions with nothing to show on a web page.
    centering: [''], raggedright: [''], raggedleft: [''], noindent: [''], indent: [''], smallskip: [''],
    medskip: [''], bigskip: [''], vfill: [''], null: [''], relax: [''], protect: [''], strut: [''],
    clearpage: [''], newpage: [''], pagebreak: ['o'], nolinebreak: ['o'], nopagebreak: ['o'], unskip: [''],
    ignorespaces: [''], arraybackslash: [''], hline: [''], toprule: ['o'], midrule: ['o'], bottomrule: ['o'],
    cline: ['r'], cmidrule: ['opr'], addlinespace: ['o'], specialrule: ['rrr'], morecmidrules: [''],
    endhead: [''], endfirsthead: [''], endfoot: [''], endlastfoot: [''], label: ['r'], index: ['r'],
    vspace: ['r'], hspace: ['r', ' ', ''], phantom: ['r'], hphantom: ['r'], vphantom: ['r'], rule: ['orr'],
    rowcolor: ['or'], cellcolor: ['or'], columncolor: ['or'], arrayrulecolor: ['or'], setlength: ['rr'],
    addtolength: ['rr'], renewcommand: ['rr'], extracolsep: ['r'], selectfont: [''], fontsize: ['rr'],
    linespread: ['r'], linebreak: ['o', '<br />', ''], footnotemark: ['o'],
  };

  var DECLARATIONS = {
    bf: 'lfo-bf', bfseries: 'lfo-bf', it: 'lfo-it', itshape: 'lfo-it', sl: 'lfo-it', slshape: 'lfo-it',
    em: 'lfo-it', sc: 'lfo-sc', scshape: 'lfo-sc', tt: 'lfo-tt', ttfamily: 'lfo-tt', sf: 'lfo-sf',
    sffamily: 'lfo-sf', rm: 'lfo-normal', rmfamily: 'lfo-normal', normalfont: 'lfo-normal', upshape: 'lfo-normal',
    mdseries: 'lfo-normal', tiny: 'lfo-tiny', scriptsize: 'lfo-scriptsize', footnotesize: 'lfo-footnotesize',
    small: 'lfo-small', normalsize: 'lfo-normalsize', large: 'lfo-large', Large: 'lfo-large2', LARGE: 'lfo-large3',
    huge: 'lfo-huge', Huge: 'lfo-huge2',
  };

  // Math commands written outside math by mistake: shown as math rather than as raw commands.
  var MATH_ONLY = {
    frac: 'rr', dfrac: 'rr', tfrac: 'rr', sqrt: 'or', times: '', div: '', pm: '', mp: '', cdot: '', leq: '',
    geq: '', neq: '', approx: '', infty: '', sim: '', to: '', rightarrow: '', leftarrow: '', Rightarrow: '',
    alpha: '', beta: '', gamma: '', delta: '', theta: '', lambda: '', mu: '', pi: '', sigma: '', omega: '',
    Omega: '', circ: '',
  };

  var COLOR_NAMES = /^(red|green|blue|cyan|magenta|yellow|black|white|gray|grey|darkgray|lightgray|brown|lime|olive|orange|pink|purple|teal|violet)$/i;

  function colorCss(model, value) {
    value = String(value).trim();
    if (model && /^html$/i.test(model.trim())) return /^[0-9A-Fa-f]{6}$/.test(value) ? '#' + value : null;
    if (model) return null;
    var mix = /^([A-Za-z]+)!(\d{1,3})$/.exec(value);
    if (mix && COLOR_NAMES.test(mix[1])) {
      return 'color-mix(in srgb, ' + mix[1].toLowerCase() + ' ' + Math.min(100, parseInt(mix[2], 10)) + '%, white)';
    }
    return COLOR_NAMES.test(value) ? value.toLowerCase() : null;
  }

  function safeUrl(u) {
    u = String(u).trim();
    return /^https?:\/\/[^\s"'<>]+$/i.test(u) ? u : null;
  }

  function inline(src) {
    return new Inline(String(src)).all();
  }

  function Inline(s) {
    this.s = s;
    this.i = 0;
  }

  Inline.prototype.all = function () {
    var out = '';
    while (this.i < this.s.length) {
      out += this.seq();
      if (this.s[this.i] === '}') this.i++;
    }
    return out;
  };

  // Up to the brace that closes the current group, which is left for the caller.
  Inline.prototype.seq = function () {
    var out = '';
    while (this.i < this.s.length && this.s[this.i] !== '}') out += this.item();
    return out;
  };

  Inline.prototype.group = function () {
    this.i++;
    var h = this.seq();
    if (this.s[this.i] === '}') this.i++;
    return h;
  };

  Inline.prototype.req = function () {
    var c = new Cursor(this.s, this.i);
    var v = c.req();
    this.i = c.i;
    return v;
  };

  Inline.prototype.opt = function (open, close) {
    var c = new Cursor(this.s, this.i);
    var v = c.opt(open, close);
    this.i = c.i;
    return v;
  };

  var RUN = /[^\\{}$%~\-`'&\s]+/y;

  Inline.prototype.item = function () {
    var s = this.s;
    var c = s[this.i];
    switch (c) {
      case '\\': return this.command();
      case '{': return this.group();
      case '$': return this.dollar();
      case '%': this.comment(); return '';
      case '~': this.i++; return ' ';
      case '-':
        if (s.startsWith('---', this.i)) { this.i += 3; return '—'; }
        if (s.startsWith('--', this.i)) { this.i += 2; return '–'; }
        this.i++;
        return '-';
      case '`':
        if (s[this.i + 1] === '`') { this.i += 2; return '“'; }
        this.i++;
        return '‘';
      case "'":
        if (s[this.i + 1] === "'") { this.i += 2; return '”'; }
        this.i++;
        return '’';
      case '&': this.i++; return '&amp;';
    }
    if (/\s/.test(c)) {
      var ws = /\s+/y;
      ws.lastIndex = this.i;
      var w = ws.exec(s)[0];
      this.i += w.length;
      return (w.match(/\n/g) || []).length > 1 ? '<br />' : ' ';
    }
    RUN.lastIndex = this.i;
    var m = RUN.exec(s);
    if (!m) { this.i++; return esc(c); }
    this.i += m[0].length;
    return esc(m[0]);
  };

  Inline.prototype.comment = function () {
    var s = this.s;
    while (this.i < s.length && s[this.i] !== '\n') this.i++;
    this.i++;
    while (this.i < s.length && (s[this.i] === ' ' || s[this.i] === '\t')) this.i++;
  };

  Inline.prototype.dollar = function () {
    var s = this.s;
    if (s[this.i + 1] === '$') {
      var d = findClose(s, this.i + 2, '$$');
      if (d >= 0) {
        var tex = s.slice(this.i + 2, d);
        this.i = d + 2;
        return mathHtml(tex, true, false);
      }
      this.i += 2;
      return '$$';
    }
    var k = findClose(s, this.i + 1, '$');
    // An unpaired dollar is a dollar sign, not the start of math that never ends.
    if (k < 0) { this.i++; return '$'; }
    var t = s.slice(this.i + 1, k);
    this.i = k + 1;
    return mathHtml(t, false, false);
  };

  Inline.prototype.accent = function (mark) {
    var arg = this.req();
    if (!arg) return esc(mark);
    if (arg === '\\i') arg = 'i';
    else if (arg === '\\j') arg = 'j';
    var chars = Array.from(arg.replace(/^\\[ij](?![A-Za-z])/, function (m) { return m[1]; }));
    if (!chars.length) return '';
    return esc((chars[0] + ACCENTS[mark] + chars.slice(1).join('')).normalize('NFC'));
  };

  Inline.prototype.afterWord = function () {
    var sp = /[ \t]*(?:\r?\n[ \t]*(?!\r?\n))?/y;
    sp.lastIndex = this.i;
    this.i += sp.exec(this.s)[0].length;
  };

  Inline.prototype.command = function () {
    var s = this.s;
    var start = this.i;
    var next = s[this.i + 1];
    if (next === undefined) { this.i++; return '\\'; }
    if (!/[A-Za-z]/.test(next)) {
      this.i += 2;
      return this.symbol(next);
    }
    if (s.startsWith('\\begin{', start)) {
      var env = findEnv(s, start);
      if (env) {
        this.i = env.end;
        return renderEnvironment(env.name, s.slice(env.bodyStart, env.bodyEnd), s.slice(start, env.end));
      }
    }
    var word = /\\([A-Za-z]+)/y;
    word.lastIndex = start;
    var name = word.exec(s)[1];
    this.i = start + name.length + 1;
    var starred = s[this.i] === '*' && (COMMANDS[name] || name === 'verb');
    if (starred) this.i++;
    if (name === 'verb') return this.verb();
    this.afterWord();
    if (name === 'begin') {
      // Never closed, so it is not an environment: show it rather than lose it.
      return '<span class="lfo-unknown">' + esc('\\begin{' + this.req() + '}') + '</span>';
    }
    if (name === 'end') { this.req(); return ''; }
    if (name === 'item') {
      var label = this.opt();
      return label === null ? '• ' : inline(label).trim() + ' ';
    }
    if (Object.prototype.hasOwnProperty.call(SYMBOLS, name)) {
      if (s.startsWith('{}', this.i)) this.i += 2;
      return SYMBOLS[name];
    }
    if (ACCENTS[name] && name.length === 1) return this.accent(name);
    if (name === 'textcolor' || name === 'colorbox') {
      var model = this.opt();
      var css = colorCss(model, this.req());
      var body = inline(this.req());
      if (!css) return body;
      return '<span style="' + (name === 'colorbox' ? 'background-color:' : 'color:') + css + '">' + body + '</span>';
    }
    if (name === 'color') {
      var colour = colorCss(this.opt(), this.req());
      var rest = this.seq();
      return colour ? '<span style="color:' + colour + '">' + rest + '</span>' : rest;
    }
    if (name === 'url' || name === 'href') {
      var url = this.req();
      var label2 = name === 'href' ? inline(this.req()) : esc(url);
      var safe = safeUrl(url);
      return safe ? '<a href="' + esc(safe) + '" rel="nofollow noopener">' + label2 + '</a>' : label2;
    }
    if (Object.prototype.hasOwnProperty.call(DECLARATIONS, name)) {
      return '<span class="' + DECLARATIONS[name] + '">' + this.seq() + '</span>';
    }
    if (Object.prototype.hasOwnProperty.call(COMMANDS, name)) {
      var spec = COMMANDS[name];
      var content = '';
      for (var k = 0; k < spec[0].length; k++) {
        var kind = spec[0][k];
        if (kind === 'o') this.opt();
        else if (kind === 'p') this.opt('(', ')');
        else if (kind === 'r') this.req();
        else content = inline(this.req());
      }
      if (spec[0].indexOf('c') < 0) return spec.length > 1 ? spec[1] : '';
      return spec[1] + content + spec[2];
    }
    if (Object.prototype.hasOwnProperty.call(MATH_ONLY, name)) {
      var tex = '\\' + name;
      for (var a = 0; a < MATH_ONLY[name].length; a++) {
        if (MATH_ONLY[name][a] === 'o') {
          var o = this.opt();
          if (o !== null) tex += '[' + o + ']';
        } else {
          tex += '{' + this.req() + '}';
        }
      }
      return mathHtml(tex, false, false);
    }
    return '<span class="lfo-unknown" title="LaTeX command shown as written">' + esc('\\' + name) + '</span>';
  };

  Inline.prototype.symbol = function (ch) {
    var s = this.s;
    switch (ch) {
      case '\\':
        if (s[this.i] === '*') this.i++;
        this.opt();
        return '<br />';
      case '(': case '[': {
        var close = ch === '(' ? '\\)' : '\\]';
        var k = findClose(s, this.i, close);
        if (k < 0) return esc('\\' + ch);
        var tex = s.slice(this.i, k);
        this.i = k + 2;
        return mathHtml(tex, ch === '[', false);
      }
      case '&': return '&amp;';
      case '%': case '#': case '_': case '{': case '}': case '$': return ch;
      case ',': return ' ';
      case ';': case ':': return ' ';
      case '!': case '-': case '/': case '@': return '';
      case '|': return '‖';
      case ' ': case '\n': case '\t': case '\r': return ' ';
    }
    if (ACCENTS[ch]) return this.accent(ch);
    return esc('\\' + ch);
  };

  Inline.prototype.verb = function () {
    var s = this.s;
    var delim = s[this.i];
    if (!delim) return '';
    var end = s.indexOf(delim, this.i + 1);
    if (end < 0) end = s.length;
    var text = s.slice(this.i + 1, end);
    this.i = end + 1;
    return '<code>' + esc(text) + '</code>';
  };

  // ---------------------------------------------------------------- the page

  function typeset(root) {
    var katex = typeof window !== 'undefined' ? window.katex : null;
    var nodes = root.querySelectorAll('.lfo-math:not(.lfo-typeset)');
    if (!katex) return nodes.length === 0;
    Array.prototype.forEach.call(nodes, function (el) {
      try {
        katex.render(el.textContent, el, {
          displayMode: el.getAttribute('data-display') === 'true',
          throwOnError: false,
          strict: 'ignore',
          trust: false,
        });
        el.classList.add('lfo-typeset');
      } catch (e) {
        el.classList.add('lfo-math-error');
      }
    });
    return true;
  }

  /** Renders one value the module marked; the original text stays when nothing in it is LaTeX. */
  function renderElement(el) {
    var src = el.getAttribute('data-latex-for-omeka');
    if (src === null || el.classList.contains('lfo-rendered')) return false;
    var result = render(src, {
      dollarMath: el.getAttribute('data-dollar-math') === '1',
      entitiesDecoded: el.getAttribute('data-entities-decoded') === '1',
    });
    if (!result.found) return false;
    el.innerHTML = result.html;
    el.classList.add('lfo-rendered');
    typeset(el);
    return true;
  }

  function start() {
    if (typeof document === 'undefined') return;
    var run = function () {
      Array.prototype.forEach.call(document.querySelectorAll('[data-latex-for-omeka]'), renderElement);
      // KaTeX may still be loading when it comes from a slow CDN: typeset again once it has.
      if (!window.katex) window.addEventListener('load', function () { typeset(document); }, { once: true });
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
    else run();
  }

  return { render: render, renderElement: renderElement, typeset: typeset, start: start, inline: inline };
});
