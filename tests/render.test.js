'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { render } = require('../asset/js/latex-for-omeka.js');

const html = (text, options) => render(text, options).html;

// --- text without LaTeX stays exactly as Omeka shows it

test('a value without LaTeX is not marked as found', () => {
  assert.equal(render('Dear Sir, I received yours of the 4th.').found, false);
});

test('a value without LaTeX renders exactly as Omeka renders a literal', () => {
  assert.equal(html('Menlo Park\nN.J. <b>&'), 'Menlo Park<br />\nN.J. &lt;b&gt;&amp;');
});

test('dollar amounts in a letter are not read as math', () => {
  assert.equal(render('Paid $5.00 and $10.25 for lamps.').found, false);
});

test('a begin with no end is left as text', () => {
  assert.equal(render('\\begin{tabular}{ll} a & b').found, false);
});

// --- math

test('inline math between \\( and \\) becomes an inline math span', () => {
  assert.match(html('Ohm: \\(E = IR\\) holds.'), /Ohm: <span class="lfo-math" data-display="false">E = IR<\/span> holds\./);
});

test('display math between \\[ and \\] becomes a display block', () => {
  assert.match(html('\\[ W = I^2 R t \\]'), /^<div class="lfo-math" data-display="true">W = I\^2 R t<\/div>$/);
});

test('a numbered equation is typeset without an invented number', () => {
  assert.match(html('\\begin{equation}a=b\\label{x}\\end{equation}'), /\\begin\{equation\*\}a=b\\end\{equation\*\}/);
});

test('eqnarray, which KaTeX lacks, becomes an array', () => {
  assert.match(html('\\begin{eqnarray}a&=&b\\end{eqnarray}'), /\\begin\{array\}\{rcl\}a&amp;=&amp;b\\end\{array\}/);
});

test('$...$ in running text is math when the site turns it on', () => {
  assert.match(html('Area $\\pi r^2$ here', { dollarMath: true }), /<span class="lfo-math" data-display="false">\\pi r\^2<\/span>/);
});

test('even with dollar math on, "$5 and $10" stays text', () => {
  assert.equal(render('cost $5 and $10', { dollarMath: true }).found, false);
});

// --- tables

const ledger = String.raw`\begin{tabular}{|l|r@{.}l|}
\hline
Lamps & 12 & 50 \\
Wire  & 3  & 05 \\ \hline
\end{tabular}`;

test('a tabular becomes an HTML table', () => {
  assert.match(html(ledger), /<table class="lfo-table">/);
});

test('each row of a tabular becomes a table row', () => {
  assert.equal((html(ledger).match(/<tr/g) || []).length, 2);
});

test('r@{.}l puts the point after the dollars with no gap before the cents', () => {
  assert.match(html(ledger), /<td class="lfo-r lfo-tr">12\.<\/td><td class="lfo-l lfo-br lfo-tl">50<\/td>/);
});

test('a leading | draws a rule left of the first column', () => {
  assert.match(html(ledger), /<td class="lfo-l lfo-bl lfo-br">Lamps<\/td>/);
});

test('an \\hline before a row draws a rule above it', () => {
  assert.match(html(ledger), /<tr class="lfo-rt-single"><td class="lfo-l lfo-bl lfo-br">Lamps/);
});

test('an \\hline after the last row draws a rule below it', () => {
  assert.match(html(ledger), /<tr class="lfo-rb-single"><td class="lfo-l lfo-bl lfo-br">Wire/);
});

test('two \\hline in a row draw a double rule', () => {
  assert.match(html('\\begin{tabular}{l}\\hline\\hline a\\\\\\end{tabular}'), /<tr class="lfo-rt-double">/);
});

const booktabs = String.raw`\begin{tabular}{lrr}
\toprule
Carbon & Ohms & Hours \\
\midrule
Paper & 112 & 40 \\
Bamboo & 98 & 1200 \\
\bottomrule
\end{tabular}`;

test('booktabs rows above \\midrule become the table header', () => {
  assert.match(html(booktabs), /<thead><tr class="lfo-rt-heavy"><th class="lfo-l" scope="col">Carbon<\/th>/);
});

test('booktabs body rows follow the header', () => {
  assert.match(html(booktabs), /<\/thead><tbody><tr class="lfo-rt-single"><td class="lfo-l">Paper<\/td>/);
});

// Regression from the edisondigital look-alike: E2021AAB's balance sheet put its ten asset rows in a bold header.
test('a ledger whose only \\midrule sits above its total has no header', () => {
  const t = '\\begin{tabular}{lr}\\toprule Cash & 1 \\\\ Notes & 2 \\\\ Stock & 3 \\\\ Plant & 4 \\\\ \\midrule Total & 10 \\\\ \\bottomrule\\end{tabular}';
  assert.doesNotMatch(html(t), /<thead>/);
});

test('a booktabs header remains a header with only one data row', () => {
  const t = String.raw`\begin{tabular}{lr}\toprule Name & Value \\ \midrule Cash & 1 \\ \bottomrule\end{tabular}`;
  assert.match(html(t), /<thead>.*<th class="lfo-l" scope="col">Name<\/th>/);
  assert.match(html(t), /<\/thead><tbody>.*<td class="lfo-l">Cash<\/td>/);
});

test('a multirow booktabs header can be longer than the body', () => {
  const t = String.raw`\begin{tabular}{lr}\toprule Group & Results \\ Name & Value \\ Units & Dollars \\ Period & Annual \\ \midrule Cash & 1 \\ \bottomrule\end{tabular}`;
  const result = html(t);
  assert.equal((result.split('</thead>')[0].match(/<tr/g) || []).length, 4);
  assert.match(result, /<\/thead><tbody>.*<td class="lfo-l">Cash<\/td>/);
});

test('a short ledger with a formatted final total has no invented header', () => {
  const t = String.raw`\begin{tabular}{lr}\toprule Cash & 1 \\ \midrule \textbf{Grand total:} & 1 \\ \bottomrule\end{tabular}`;
  assert.doesNotMatch(html(t), /<thead>/);
  assert.match(html(t), /<td class="lfo-l"><b>Grand total:<\/b><\/td>/);
});

test('a summary table keeps its column headers above a final total', () => {
  const t = String.raw`\begin{tabular}{lr}\toprule Category & Amount \\ \midrule Total & 10 \\ \bottomrule\end{tabular}`;
  const result = html(t);
  assert.match(result, /<thead>.*<th class="lfo-l" scope="col">Category<\/th><th class="lfo-r" scope="col">Amount<\/th>/);
  assert.match(result, /<\/thead><tbody>.*<td class="lfo-l">Total<\/td>/);
});

test('multirow headings above a final total stay headers', () => {
  const t = String.raw`\begin{tabular}{lr}\toprule Category & Amount \\ Period & Annual \\ \midrule \textbf{Grand total} & 10 \\ \bottomrule\end{tabular}`;
  const result = html(t);
  assert.equal((result.split('</thead>')[0].match(/<th /g) || []).length, 4);
  assert.match(result, /<\/thead><tbody>.*<td class="lfo-l"><b>Grand total<\/b><\/td>/);
});

test('currency amounts above a final total remain ledger data', () => {
  const t = String.raw`\begin{tabular}{lr}\toprule Cash & \$1,200.50 \\ Notes & \pounds 30 \\ \midrule Total & 1230.50 \\ \bottomrule\end{tabular}`;
  assert.doesNotMatch(html(t), /<thead>/);
});

test('a table without booktabs rules has no invented header', () => {
  assert.doesNotMatch(html(ledger), /<thead>/);
});

test('\\multicolumn spans columns with its own alignment', () => {
  assert.match(html('\\begin{tabular}{lll}\\multicolumn{2}{c}{Total} & 9\\\\\\end{tabular}'), /<td class="lfo-c" colspan="2">Total<\/td>/);
});

const multirow = String.raw`\begin{tabular}{ll}
\multirow{2}{*}{Menlo} & Jan \\
 & Feb \\
\end{tabular}`;

test('\\multirow spans rows', () => {
  assert.match(html(multirow), /<td class="lfo-l lfo-vm" rowspan="2">Menlo<\/td>/);
});

test('the empty cell under a \\multirow is dropped', () => {
  assert.match(html(multirow), /<tr><td class="lfo-l">Feb<\/td><\/tr>/);
});

test('a negative \\multirow spans the rows above it', () => {
  const t = '\\begin{tabular}{ll} & Jan \\\\ \\multirow{-2}{*}{Menlo} & Feb \\\\\\end{tabular}';
  assert.match(html(t), /<td class="lfo-l lfo-vm" rowspan="2">Menlo<\/td><td class="lfo-l">Jan<\/td>/);
});

test('\\cline draws a rule over only its columns', () => {
  const t = '\\begin{tabular}{ll} a & b \\\\ \\cline{2-2} c & d \\\\\\end{tabular}';
  assert.match(html(t), /<td class="lfo-l">c<\/td><td class="lfo-l lfo-ct">d<\/td>/);
});

test('a short row is padded to the full width', () => {
  assert.equal((html('\\begin{tabular}{lll} a \\\\\\end{tabular}').match(/<td/g) || []).length, 3);
});

test('a p column wraps at its width', () => {
  assert.match(html('\\begin{tabular}{p{3cm}} long \\\\\\end{tabular}'), /<td class="lfo-l lfo-wrap lfo-vt" style="width:3cm">long<\/td>/);
});

test('a width that is not a length never reaches the style attribute', () => {
  assert.doesNotMatch(html('\\begin{tabular}{p{3cm;color:red}} x \\\\\\end{tabular}'), /style=/);
});

test('*{3}{c} repeats a column three times', () => {
  assert.equal((html('\\begin{tabular}{*{3}{c}} a & b & c \\\\\\end{tabular}').match(/lfo-c/g) || []).length, 3);
});

test('inside a table, a paired $ is math', () => {
  assert.match(html('\\begin{tabular}{l} $\\frac12$ \\\\\\end{tabular}'), /<span class="lfo-math" data-display="false">\\frac12<\/span>/);
});

test('inside a table, an unpaired $ is a dollar sign', () => {
  assert.match(html('\\begin{tabular}{l} $12 \\\\\\end{tabular}'), /<td class="lfo-l">\$12<\/td>/);
});

test('inside a table, \\$ is a dollar sign', () => {
  assert.match(html('\\begin{tabular}{l} \\$12 & \\$3 \\\\\\end{tabular}'), /<td class="lfo-l">\$12<\/td>/);
});

test('\\& in a cell is an ampersand, not a new cell', () => {
  assert.match(html('\\begin{tabular}{l} Bergmann \\& Co. \\\\\\end{tabular}'), /<td class="lfo-l">Bergmann &amp; Co\.<\/td>/);
});

test('a % comment in a table is dropped', () => {
  assert.match(html('\\begin{tabular}{l} 50\\% % note\n\\\\\\end{tabular}'), /<td class="lfo-l">50%<\/td>/);
});

const longtable = String.raw`\begin{longtable}{ll}
Date & Item \\ \hline
\endhead
\hline Carried forward & \\
\endfoot
Jan 4 & Lamps \\
\end{longtable}`;

test('a longtable header goes to thead with the rule written under it', () => {
  assert.match(html(longtable), /<thead><tr class="lfo-rb-single"><th class="lfo-l" scope="col">Date<\/th>/);
});

test('a longtable footer goes to tfoot with its own rule', () => {
  assert.match(html(longtable), /<tfoot><tr class="lfo-rt-single"><td class="lfo-l">Carried forward/);
});

test('a longtable body row takes no rule from the header', () => {
  assert.match(html(longtable), /<tbody><tr><td class="lfo-l">Jan 4/);
});

test('a table float keeps its caption', () => {
  const t = '\\begin{table}[h]\\centering\\caption{Tests of lamps}\\begin{tabular}{l} a\\\\\\end{tabular}\\end{table}';
  assert.match(html(t), /^<figure class="lfo-float lfo-center"><figcaption>Tests of lamps<\/figcaption><div class="lfo-table-wrap">/);
});

test('a caption after the tabular stays below it', () => {
  const t = '\\begin{table}\\begin{tabular}{l} a\\\\\\end{tabular}\\caption{Below}\\end{table}';
  assert.match(html(t), /<\/table><\/div><figcaption>Below<\/figcaption><\/figure>$/);
});

// --- running text inside blocks

test('\\textbf in a cell is bold', () => {
  assert.match(html('\\begin{tabular}{l} \\textbf{Total} \\\\\\end{tabular}'), /<b>Total<\/b>/);
});

test('a declaration like \\bfseries lasts to the end of its group', () => {
  assert.match(html('\\begin{center}{\\bfseries a} b\\end{center}'), /<p><span class="lfo-bf">a<\/span> b<\/p>/);
});

test('accents combine into the accented letter', () => {
  assert.match(html("\\begin{center}\\'e\\\"{o}\\c{c}\\'{\\i}\\end{center}"), /<p>éöçí<\/p>/);
});

test('TeX dashes and quotes become typographic ones', () => {
  assert.match(html("\\begin{center}``1879--80''---so\\end{center}"), /<p>“1879–80”—so<\/p>/);
});

test('a named \\textcolor colours its text', () => {
  assert.match(html('\\begin{center}\\textcolor{red}{void}\\end{center}'), /<span style="color:red">void<\/span>/);
});

test('a colour that is not a known name is dropped, keeping the text', () => {
  assert.match(html('\\begin{center}\\textcolor{red;background:url(x)}{void}\\end{center}'), /<p>void<\/p>/);
});

test('\\href links only to web addresses', () => {
  assert.match(html('\\begin{center}\\href{javascript:alert(1)}{click}\\end{center}'), /<p>click<\/p>/);
});

test('markup typed inside a block is shown as text, never run', () => {
  assert.match(html('\\begin{center}<script>alert(1)</script>\\end{center}'), /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
});

test('an unknown command is shown as written', () => {
  assert.match(html('\\begin{center}\\foo bar\\end{center}'), /<span class="lfo-unknown" title="LaTeX command shown as written">\\foo<\/span>bar/);
});

test('a blank line inside a block starts a new paragraph', () => {
  assert.match(html('\\begin{quote}one\n\ntwo\\end{quote}'), /<blockquote class="lfo-quote"><p>one<\/p><p>two<\/p><\/blockquote>/);
});

// --- lists and other environments

test('itemize becomes a bulleted list', () => {
  assert.match(html('\\begin{itemize}\\item Lamps \\item Wire\\end{itemize}'), /<ul class="lfo-list"><li>Lamps<\/li><li>Wire<\/li><\/ul>/);
});

test('enumerate becomes a numbered list', () => {
  assert.match(html('\\begin{enumerate}\\item a\\end{enumerate}'), /<ol class="lfo-list"><li>a<\/li><\/ol>/);
});

test('description items keep their labels', () => {
  assert.match(html('\\begin{description}\\item[Volts] 110\\end{description}'), /<dl class="lfo-description"><dt>Volts<\/dt><dd>110<\/dd><\/dl>/);
});

test('verbatim keeps its text exactly', () => {
  assert.match(html('\\begin{verbatim}\n  a & b \\\\ %x\n\\end{verbatim}'), /<pre class="lfo-verbatim">  a &amp; b \\\\ %x<\/pre>/);
});

test('an unsupported environment is shown as written rather than lost', () => {
  assert.match(html('\\begin{tikzpicture}\\draw (0,0) -- (1,1);\\end{tikzpicture}'), /<pre class="lfo-raw lfo-unsupported"[^>]*>\\begin\{tikzpicture\}\\draw \(0,0\) -- \(1,1\);\\end\{tikzpicture\}<\/pre>/);
});

test('a table nested in a list renders as a table', () => {
  assert.match(html('\\begin{itemize}\\item \\begin{tabular}{l} x \\\\\\end{tabular}\\end{itemize}'), /<li><div class="lfo-table-wrap">/);
});

// --- the text around a block

test('the newlines that frame a block are not extra line breaks', () => {
  assert.equal(html('Above\n\\[x\\]\nBelow'), 'Above<div class="lfo-math" data-display="true">x</div>Below');
});

test('text around a block keeps its other line breaks', () => {
  assert.match(html('One\nTwo\n\\[x\\]'), /^One<br \/>\nTwo<div/);
});

test('text around a block is escaped as Omeka escapes it', () => {
  assert.match(html('"A" & <B>\n\\[x\\]'), /^&quot;A&quot; &amp; &lt;B&gt;<div/);
});

// --- text imported by Scripto, which keeps the wiki's HTML entities

test('a table imported by Scripto, with & stored as &amp;, still splits into cells', () => {
  assert.match(html('\\begin{tabular}{ll} Lamps &amp; 12 \\\\\\end{tabular}'), /<td class="lfo-l">Lamps<\/td><td class="lfo-l">12<\/td>/);
});

test('math imported by Scripto, with < stored as &lt;, is typeset with <', () => {
  assert.match(html('\\[ a &lt; b \\]'), /data-display="true">a &lt; b<\/div>/);
});

test('an &amp; inside an align is an alignment point', () => {
  assert.match(html('\\begin{align}a &amp;= b\\end{align}'), /\\begin\{align\*\}a &amp;= b\\end\{align\*\}/);
});

test('entities outside a LaTeX block are left exactly as Omeka shows them', () => {
  assert.match(html('Drexel, Morgan &amp; Co.\n\\[x\\]'), /^Drexel, Morgan &amp;amp; Co\.<div/);
});

test('text the server already decoded is not decoded a second time', () => {
  assert.match(html('\\[ \\text{&lt;} \\]', { entitiesDecoded: true }), /data-display="true">\\text\{&amp;lt;\}<\/div>/);
});

// --- characters a transcription means literally, inside a table

const withJones = rows => html(`\\begin{tabular}{lr}\n${rows}\nJones & 2.00 \\\\\n\\end{tabular}`);

test('a company ampersand in a ledger row stays in its cell', () => {
  assert.match(withJones('Edison & Co. & 4.50 \\\\'), /<td class="lfo-l">Edison &amp; Co\.<\/td><td class="lfo-r">4\.50<\/td>/);
});

test('an ampersand glued to a word stays in its cell', () => {
  assert.match(withJones('Smith &co. & 4.50 \\\\'), /<td class="lfo-l">Smith &amp;co\.<\/td>/);
});

test('an et cetera ampersand stays in its cell', () => {
  assert.match(withJones('nails, screws, &c. & 1.10 \\\\'), /<td class="lfo-l">nails, screws, &amp;c\.<\/td>/);
});

test('a company ampersand imported by Scripto as &amp; stays in its cell', () => {
  assert.match(withJones('Drexel, Morgan &amp; Co. & 9.00 \\\\'), /<td class="lfo-l">Drexel, Morgan &amp; Co\.<\/td>/);
});

test('an unusual ampersand in one row joins the leftmost cell when the other rows fit', () => {
  assert.match(withJones('Bergmann & Hammer & 3.00 \\\\'), /<td class="lfo-l">Bergmann &amp; Hammer<\/td>/);
});

test('a table whose column spec is too short still shows every cell', () => {
  assert.equal((html('\\begin{tabular}{l} a & b \\\\ c & d \\\\ \\end{tabular}').match(/<td/g) || []).length, 4);
});

test('ampersands without spaces still separate cells when the row fits', () => {
  assert.match(html('\\begin{tabular}{ll} a&b \\\\ \\end{tabular}'), /<td class="lfo-l">a<\/td><td class="lfo-l">b<\/td>/);
});

test('compact rows preserve embedded company initials before repairing separators', () => {
  const t = String.raw`\begin{tabular}{lll}Item&AT&T&10\\Other & Company & 20\\\end{tabular}`;
  assert.match(html(t), /<td class="lfo-l">Item<\/td><td class="lfo-l">AT&amp;T<\/td><td class="lfo-l">10<\/td>/);
});

test('compact rows preserve R&D without joining the preceding cell', () => {
  const t = String.raw`\begin{tabular}{lll}Department&R&D&10\\\end{tabular}`;
  assert.match(html(t), /<td class="lfo-l">Department<\/td><td class="lfo-l">R&amp;D<\/td><td class="lfo-l">10<\/td>/);
});

test('numeric-percent comments cannot close math environments early', () => {
  const t = String.raw`\begin{align}x=1% ignored \end{align}
+y=2
\end{align}`;
  const result = html(t);
  assert.match(result, /\+y=2\n\\end\{align\*\}<\/div>$/);
  assert.doesNotMatch(result, /<br/);
});

test('numeric-percent comments cannot open nested starred math environments', () => {
  const t = String.raw`\begin{align*}x=1% ignored \begin{align*}
+y=2
\end{align*}`;
  assert.equal(render(t).found, true);
  assert.match(html(t), /data-display="true">\\begin\{align\*\}x=1% ignored/);
  assert.match(html(t), /\+y=2\n\\end\{align\*\}<\/div>$/);
});

test('a percentage in a table cell is kept', () => {
  assert.match(withJones('Interest at 6% & 12.00 \\\\'), /<td class="lfo-l">Interest at 6%<\/td><td class="lfo-r">12\.00<\/td>/);
});

test('a percentage written with a space is kept', () => {
  assert.match(withJones('Interest at 6 % & 12.00 \\\\'), /<td class="lfo-l">Interest at 6 %<\/td>/);
});

test('a percentage does not hide an environment ending on the same line', () => {
  assert.match(html('\\begin{tabular}{l} 6% \\\\ \\end{tabular}'), /<td class="lfo-l">6%<\/td>/);
});

test('a percentage in running text inside a block keeps the rest of the line', () => {
  assert.match(html('\\begin{center}rate 6% for the year\\end{center}'), /<p>rate 6% for the year<\/p>/);
});

test('two dollar amounts in one cell stay as money', () => {
  assert.match(withJones('from $5 to $10 & 3 \\\\'), /<td class="lfo-l">from \$5 to \$10<\/td>/);
});

test('dollar math in a cell is still typeset', () => {
  assert.match(withJones('$x^2$ & 3 \\\\'), /<td class="lfo-l"><span class="lfo-math" data-display="false">x\^2<\/span><\/td>/);
});

test('a stray opening brace stays in its own cell', () => {
  assert.match(withJones('open { brace & 1 \\\\'), /<td class="lfo-l">open \{ brace<\/td><td class="lfo-r">1<\/td>/);
});

test('a stray closing brace is shown', () => {
  assert.match(withJones('close } brace & 1 \\\\'), /<td class="lfo-l">close \} brace<\/td>/);
});

// --- robustness

test('column declarations stay separate from the cell text', () => {
  const t = String.raw`\begin{tabular}{>{\bfseries}l} Total \\ \end{tabular}`;
  assert.match(html(t), /<span class="lfo-bf">Total<\/span>/);
  assert.doesNotMatch(html(t), /lfo-unknown/);
});

test('column suffixes stay separate from a cell control word', () => {
  const t = String.raw`\begin{tabular}{l<{each}} \pounds \\ \end{tabular}`;
  assert.match(html(t), /<td class="lfo-l">£each<\/td>/);
});

test('nested verbatim preserves percent signs and line breaks', () => {
  const t = String.raw`\begin{quote}\begin{verbatim}
50% of cost
x & y
\end{verbatim}\end{quote}`;
  assert.equal(html(t), '<blockquote class="lfo-quote"><pre class="lfo-verbatim">50% of cost\nx &amp; y</pre></blockquote>');
});

test('inline verbatim preserves comments and table separators as literal text', () => {
  const t = String.raw`\begin{tabular}{l} \verb|100% & a\\b| \\ \end{tabular}`;
  assert.match(html(t), /<td class="lfo-l"><code>100% &amp; a\\\\b<\/code><\/td>/);
  assert.equal((html(t).match(/<td/g) || []).length, 1);
});

test('starred inline verbatim preserves percent signs', () => {
  assert.match(html(String.raw`\begin{center}\verb*|100%| more\end{center}`), /<code>100%<\/code> more/);
});

test('commented environment endings do not truncate tables', () => {
  const t = String.raw`\begin{tabular}{ll} A & B \\ % ignore \end{tabular}
C & D \\
\end{tabular}`;
  assert.match(html(t), /<td class="lfo-l">C<\/td><td class="lfo-l">D<\/td>/);
  assert.equal((html(t).match(/<tr/g) || []).length, 2);
  assert.doesNotMatch(html(t), /\\end/);
});

test('commented environment openings do not leave tables unclosed', () => {
  const t = String.raw`\begin{tabular}{l} % ignore \begin{tabular}
A \\ \end{tabular}`;
  assert.match(html(t), /<td class="lfo-l">A<\/td>/);
});

test('escaped percent signs do not hide the real environment ending', () => {
  assert.match(html(String.raw`\begin{center}50\%\end{center}`), /<p>50%<\/p>/);
});

test('environment endings inside verbatim do not close the enclosing environment', () => {
  const t = String.raw`\begin{quote}\begin{verbatim}
\end{quote}
\end{verbatim}after\end{quote}`;
  assert.equal(html(t), '<blockquote class="lfo-quote"><pre class="lfo-verbatim">\\end{quote}</pre><p>after</p></blockquote>');
  assert.match(html(String.raw`\begin{center}\verb|\end{center}| after\end{center}`), /<code>\\end\{center\}<\/code> after/);
});

test('no input, however malformed, makes the renderer throw', () => {
  const pieces = ['\\begin{tabular}{', '}', '{', '&', '\\\\', '\\multirow{-9}{*}{x}', '\\multicolumn{99}{c}{',
    '$', '\\(', '\\[', '\\end{tabular}', '\\hline', '\\begin{itemize}', '\\item[', '%', '\\', 'x', '\n', '\\cline{3-1}'];
  let seed = 7;
  const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  for (let n = 0; n < 2000; n++) {
    let s = '';
    for (let k = 0; k < 12; k++) s += pieces[Math.floor(rand() * pieces.length)];
    assert.doesNotThrow(() => render(s));
  }
});
