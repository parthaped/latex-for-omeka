LaTeX for Omeka (module for Omeka S)
====================================

**LaTeX for Omeka** renders LaTeX written inside text values, such as transcriptions, on the pages of
an [Omeka S] site. A transcriber writes a table, an equation or a list in ordinary LaTeX. Visitors see
an HTML table, typeset math and real lists, and the text around the LaTeX looks exactly as it did before.

The stored value is never changed. The API, search, exports and anything else that reads the data still
see the text exactly as it was typed.

```latex
The carbon tests gave:
\begin{tabular}{lrr}
\toprule
Carbon & Ohms & Hours \\
\midrule
Paper  & 98   & 40    \\
Bamboo & 186  & 1200  \\
\bottomrule
\end{tabular}
and the heat follows \(H = I^2 R t\).
```

The module was written for archival transcriptions: ledgers, laboratory notebooks, test results.
Its design follows from that:

- **Dollar signs stay dollar signs** in running text.
- **Nothing a transcriber writes is ever dropped.** Anything it cannot draw is shown as written.
- **Text imported through [Scripto] works.**


Features
--------

- **Tables:** `tabular`, `tabular*`, `tabularx`, `tabulary` and `longtable`, including:
  - column types `l c r p{} m{} b{} X S`;
  - vertical rules `|` and `||`;
  - `@{.}` decimal alignment (dollars and cents on the point), `>{…}`, `<{…}`, `*{n}{…}`;
  - `\hline`, `\cline`, and booktabs' `\toprule`, `\midrule`, `\bottomrule` and `\cmidrule`;
  - `\multicolumn` and `\multirow`;
  - header and footer rows (`<thead>`, `<tfoot>`) from booktabs and from longtable's
    `\endhead`/`\endfoot`;
  - captions from a `table` float.
- **Math**, typeset by [KaTeX]:
  - `\( … \)` inline and `\[ … \]` display math;
  - `equation`, `align`, `gather`, `multline`, `eqnarray`, `array`, `cases` and the matrix environments.
- **Lists and blocks:** `itemize`, `enumerate`, `description`, `center`, `flushleft`, `flushright`,
  `quote`, `quotation`, `verse`, `minipage`, `multicols` and `verbatim`.
- **Text inside blocks:**
  - `\textbf`, `\textit`, `\emph`, `\underline`, `\sout`, `\textsc`, `\texttt`;
  - superscripts and subscripts, `\textcolor`, `\footnote`, declarations such as `{\bfseries …}`;
  - accents, TeX dashes and quotes, `~`, and symbols such as `\pounds`, `\textonehalf`, `\checkmark` and
    `\S`.
- **Safe:** everything typed is escaped, and links are only allowed to `http(s)` addresses. Colours and
  widths are checked before they reach a style attribute.
- **No JavaScript needed to read the text:** without it, or if it fails, the reader sees the value as Omeka
  always showed it.
- **Optional:** shows the `&amp;` and `&lt;` codes that Scripto's import leaves in text as `&` and `<`.


Requirements
------------

- **Omeka S 4.** Tested with Omeka S 4.2.1 on PHP 8.3 and MariaDB 11.4. It was tested in the default and
  Center Row themes, alongside IIIF Server 3.6.25, Universal Viewer 3.6.10 and Metadata Browse 1.6.1.
- **JavaScript** in the visitor's browser, to draw the tables and math.
- **KaTeX 0.16.** It is loaded from the jsDelivr CDN by default, or from a copy in the module (see
  [Configuration](#configuration)).


Installation
------------

See the general end-user documentation for [installing a module].

The module's folder must be named `LatexForOmeka`.

- **From a release:** download the latest zip from the [releases page] and unzip it in the `modules/`
  folder of Omeka S.
- **From the source:**
  ```sh
  cd /path/to/omeka-s/modules
  git clone https://github.com/parthaped/latex-for-omeka.git LatexForOmeka
  ```

Then go to **Modules** in the admin, install **LaTeX for Omeka**, and configure it.


Configuration
-------------

| Setting | Default | What it does |
|---|---|---|
| Properties to render | empty (every text value) | Only these properties are read for LaTeX, for example the transcription property. |
| Read $…$ as math outside LaTeX blocks | off | Treats `$…$` in running text as math. Leave it off for any collection with prices or accounts. |
| Show HTML entities as characters in | empty | For text imported by Scripto: shows `&amp;` as `&`, `&lt;` as `<`, and so on, in the chosen properties (usually `scripto:transcription`). Only complete entities are decoded, so "AT&T" stays as typed. The stored text is unchanged. |
| KaTeX location | jsDelivr, KaTeX 0.16.11 | Where KaTeX is loaded from. Leave it empty to use a copy in `asset/vendor/katex/`. |

To serve KaTeX from the module, for example on a site that blocks CDNs, copy it in and clear the
KaTeX location:

```sh
cd modules/LatexForOmeka
npm pack katex@0.16.11 && tar -xzf katex-0.16.11.tgz
mkdir -p asset/vendor/katex
cp -r package/dist/katex.min.js package/dist/katex.min.css package/dist/fonts asset/vendor/katex/
rm -rf package katex-0.16.11.tgz
```


Usage
-----

Write LaTeX in a text value as you would for pdflatex. A value is rendered only when it contains a LaTeX
block, which is one of:

- an environment, `\begin{…} … \end{…}`;
- display math, `\[ … \]`;
- inline math, `\( … \)`.

Everything else in the value is shown as before.

- **Outside a block:** `$` is a dollar sign. "Paid $5.00" never becomes math.
- **Inside a block, LaTeX's rules apply:**
  - `$…$` is math;
  - `%` starts a comment;
  - `&` separates table cells;
  - write `\$`, `\%` and `\&` for the characters themselves.
- **Inside a block, what a transcriber types by habit is still read as meant:**
  - `6%` and `6 %` are percentages. Only a `%` that does not follow a number starts a comment. In math,
    which KaTeX reads as TeX, every `%` starts a comment, so write `\%` there.
  - `$` is math only by Pandoc's rules, so "from $5 to $10" stays money.
  - In a row with more cells than the table has columns, `&` glued to a word (`&co`, `&c.`, `AT&T`) and
    the `&` of "& Co.", "& Sons" or "& Bros." stay in their cell. If the other rows fit the columns, any
    remaining extra `&` joins the leftmost cells, where names usually are.
  - A `{` or `}` without a partner is shown as typed instead of swallowing the rest of the table.
- **Equation numbers are dropped,** since a transcription has none of its own. Use `\tag{…}` to show the
  number written on the page.
- **What the module cannot draw is shown as written.** An unknown command appears in monospace, and an
  unsupported environment such as `tikzpicture` appears as a preformatted block.

### With Scripto

[Scripto] keeps transcriptions in a MediaWiki. On import, it runs the wiki text through MediaWiki's parser
and strips the HTML tags. So:

- **Wrap each LaTeX block in `<nowiki>…</nowiki>` on the wiki page.** Otherwise MediaWiki reads parts of
  the LaTeX as wiki markup:
  - `''` (TeX's closing quote) is read as italics and disappears;
  - `{{…}}` is read as a template;
  - a line starting with `*`, `#` or `:` loses that character;
  - `----` and `[[…]]` are lost.

  With `<nowiki>`, the block arrives exactly as typed, and the tags themselves are not stored.

  ```
  The tests gave:
  <nowiki>\begin{tabular}{lr}
  Bamboo & 1200 \\
  \end{tabular}</nowiki>
  ```

- **HTML entities.** The imported text keeps HTML entities (`&` is stored as `&amp;`). Inside LaTeX
  blocks the module always decodes them, since there they can only mean the character. To show the
  characters everywhere else too, choose the transcription property under *Show HTML entities as
  characters in*.
- **Edit through the wiki.** Scripto's import replaces the property's values with what is on the wiki, so
  LaTeX written straight into an Omeka value is lost at the next import.
- **Scripto's own pages show the raw LaTeX.** Its transcription pages are drawn from the wiki, not from
  Omeka's value display.


How it works
------------

1. **On the server.** `Module.php` listens to Omeka's `rep.value.html` event. When a literal value holds a
   LaTeX block, the module wraps Omeka's normal HTML for it in an element carrying the raw text, and adds
   the stylesheet, KaTeX and the renderer to the page. Values without LaTeX are left alone and load
   nothing. This happens only on site and admin pages. IIIF manifests (for example from IIIF Server) and
   other outputs keep Omeka's own HTML, so they carry the transcription as plain text.
2. **In the browser.** `asset/js/latex-for-omeka.js` reads the raw text and builds the tables, lists and
   paragraphs. It hands the math to KaTeX, which cannot draw `tabular` itself.

The renderer has no dependencies and runs the same way in Node. Other tools, such as a transcription
editor's preview, can use it to show text exactly as the site will.


Development
-----------

```sh
npm test                     # the renderer's tests (Node 18 or later)
python -m http.server 8077   # then open http://localhost:8077/demo/ to see the examples rendered
```

`demo/index.html` shows transcriptions next to their rendering, using the same markup the module writes.
The text in it is invented.

A release zip, which leaves out the tests and the demo through `.gitattributes`:

```sh
git archive --output=LatexForOmeka.zip --prefix=LatexForOmeka/ <tag>
```


Warning
-------

Use it at your own risk. It's always recommended to back up your files and your databases, and to check
your archives regularly so you can roll back if needed.


Troubleshooting
---------------

See the online issues on the [module issues] page.


Known issues
------------

- Drawings (`tikzpicture`, `picture`) and other environments the module does not know are shown as
  written, not drawn.
- Omeka S 3 has not been tested.
- Values of the `html` data type are not read. LaTeX must be in a plain text (literal) value.


License
-------

This module is published under the [GNU General Public License, version 3] or, at your option, any
later version. See [LICENSE](LICENSE).

KaTeX, which the module loads, is published under the [MIT license](https://github.com/KaTeX/KaTeX/blob/main/LICENSE).


Copyright
---------

* Copyright the LaTeX for Omeka contributors, 2026


[Omeka S]: https://omeka.org/s
[KaTeX]: https://katex.org
[Scripto]: https://omeka.org/s/modules/Scripto
[installing a module]: https://omeka.org/s/docs/user-manual/modules/#installing-modules
[releases page]: https://github.com/parthaped/latex-for-omeka/releases
[module issues]: https://github.com/parthaped/latex-for-omeka/issues
[GNU General Public License, version 3]: https://www.gnu.org/licenses/gpl-3.0.html
