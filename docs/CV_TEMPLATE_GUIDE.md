# CV Template Authoring Guide

How to write a LaTeX CV template for the Job Tracker CV Builder, what the
compiler allows, and how to make the result fit on one page.

A template is a **complete LaTeX document** — it supplies its own
`\documentclass` and preamble. The builder replaces a fixed set of
`{{placeholders}}` with the user's escaped content and compiles the result in a
locked-down sandbox (`pdflatex`, no network, no shell escape). The same source
drives the live preview PNG and the final downloadable PDF, so what you see in
the preview is exactly what the user gets.

---

## 1. The placeholders

These are the only tokens a template may use. Anything else fails the
activation checklist and is rejected on save. The list is served live to the
admin editor by `GET /api/admin/cv-templates/placeholders`, so it never drifts
from the backend.

| Token | Label | Multi-line | What to put in the form |
| --- | --- | --- | --- |
| `{{fullName}}` | Full name | no | As it should appear at the top of the CV |
| `{{headline}}` | Headline | no | One line under the name, e.g. Senior Full-Stack Engineer |
| `{{profile}}` | Profile | **yes** | A short summary paragraph about the candidate |
| `{{email}}` | Email | no | Contact email address |
| `{{phone}}` | Phone | no | Contact phone number |
| `{{links}}` | Links | **yes** | LinkedIn, GitHub, portfolio… one per line |
| `{{experience}}` | Experience | **yes** | One entry per line, e.g. `Engineer, ACME (2021 – Present)` |
| `{{education}}` | Education | **yes** | One entry per line, e.g. `MSc Mathematics, University of London` |
| `{{certificates}}` | Certificates | **yes** | One certificate per line, e.g. `AWS Certified Solutions Architect (2023)` |
| `{{skills}}` | Skills | **yes** | Comma-separated, or one skill group per line |

A placeholder may be used more than once, and may sit inside other LaTeX groups
(for example `\textbf{ {{fullName}} }`). Put a space inside the braces when the
token is adjacent to other text so TeX does not glue them together.

---

## 2. Multi-line fields — how line breaks work

This is the part that trips people up, so read it once.

**You do not need `\obeylines`, `\\`, or `\par` to break the lines of a
multi-line field.** In LaTeX a plain newline in the source is normally just a
space, which would collapse a field like

```
Engineer, ACME (2021 – Present)
Intern, StartupX (2020)
```

into one run-on sentence. The build pipeline already fixes this: before
substitution, every run of newlines inside a value is converted to a hard line
break (`\\{}`). So the two lines above render as two lines on the CV with no
extra work from you.

What this means for authors:

- Just drop `{{experience}}`, `{{education}}`, `{{certificates}}`, `{{links}}`,
  `{{profile}}` and `{{skills}}` on their own line in the template and let the
  user put one entry per line in the form.
- Values are trimmed, so a field never starts or ends with a stray break.
- Do **not** wrap these placeholders in your own `\obeylines` block expecting it
  to add breaks — the newlines are already gone by the time TeX sees them. It is
  harmless but redundant.

---

## 3. Values are text, never LaTeX

Every value is escaped to literal text before it is substituted: `&`, `%`, `$`,
`#`, `_`, `{`, `}`, `~`, `^`, `\` and similar are all made safe. A user cannot
inject LaTeX through a CV field, and you should **not** rely on the user typing
markup. Put all formatting (bold, colour, spacing) in the template around the
placeholder, not in the data.

---

## 4. What the sandbox allows

### Allowed packages

`\usepackage` is allowlisted — every entry only affects typography or layout and
none can touch files or the shell. Loading anything else is rejected by name.

```
amsmath  amssymb  array  babel  charter  color  courier  csquotes
enumitem  fancyhdr  fontenc  fullpage  geometry  hyperref  iftex
inconsolata  inputenc  koma-script  latexsym  lipsum  mathptmx  marvosym
microtype  multicol  needspace  newtxtext  parskip  ragged2e  setspace
soul  tabularray  tabularx  tgheros  tgtermes  titlesec  xcolor  xurl
```

The worker image ships `texlive-latex-base`, `-recommended`, `-extra` and
`fonts-recommended`. If a package above is not installed the preview will say so;
stick to the common ones (`geometry`, `titlesec`, `enumitem`, `xcolor`,
`hyperref`, `fontenc`, `inputenc`, `parskip`, `fancyhdr`, `tabularx`) and you
will be fine.

### Forbidden primitives

These are blocked outright because they read/write files, read the terminal, or
escape to the shell. A template containing any of them is rejected:

```
\input  \include  \RequirePackage  \write  \immediate  \openout  \openin
\read  \readline  \catcode  \special  \write18  \directlua  \latelua
\pdfliteral  \def  \let  \csname  \expandafter  \newread  \newwrite
\endinput  \loop
```

Note `\def` and `\let`: use LaTeX-level `\newcommand` / `\renewcommand` /
`\providecommand` to define your own macros instead. (`\definecolor` is fine —
the block matches whole commands only, so it is not caught by `\def`.)

### Other rules

- `\documentclass` should be `article` (the base class the sandbox expects).
- Keep it to packages that produce a PDF with `pdflatex` — no `fontspec` /
  LuaLaTeX / XeLaTeX-only features.
- Compilation is time- and resource-limited. A template that loops or pulls in
  enormous fonts will time out; the user sees a plain "generation failed"
  message, never a raw log.

---

## 5. Making it fit on one page

A CV that spills to a second page looks unfinished. Levers, in order of impact:

1. **Margins.** `\usepackage[margin=1.5cm]{geometry}` (or `0.6in`) reclaims a
   lot of space. Below ~1.2cm starts to look cramped.
2. **Base font size.** `\documentclass[10pt,a4paper]{article}`. 11pt is the
   default; 10pt fits noticeably more. Avoid going under 10pt.
3. **Section spacing.** With `titlesec`,
   `\titlespacing*{\section}{0pt}{8pt}{3pt}` tightens the gap above/below each
   heading.
4. **Paragraph spacing.** `parskip` adds a small skip between blocks; if the CV
   is list-based, `enumitem` with `itemsep=1pt, topsep=2pt, parsep=0pt` is
   tighter.
5. **Header rule / vertical glue.** Trim `\vspace` around the name block.
6. **Content, not type.** If it still overflows, the fix is fewer lines per
   entry, not a smaller font. Encourage short one-line entries.

Preview against realistic data: the live preview uses the shared sample CV
(Ada Lovelace, two-line experience, etc.), so a template that fits the sample
but breaks on a longer real CV is a warning sign — test with a deliberately long
experience field before activating.

---

## 6. A complete, verified example

This exact source was compiled through the real sandbox with the sample data and
produced a clean single-page CV. It is also what the admin editor starts from
("New template" / "Insert example"), and lives in the frontend at
`front/src/lib/cvTemplateExample.ts`.

```latex
\documentclass[10pt,a4paper]{article}

% --- Packages (all on the sandbox allowlist) -------------------------------
\usepackage[T1]{fontenc}
\usepackage[utf8]{inputenc}
\usepackage[margin=1.6cm]{geometry}
\usepackage{titlesec}
\usepackage{enumitem}
\usepackage{xcolor}
\usepackage[colorlinks=true,linkcolor=accent,urlcolor=accent]{hyperref}
\usepackage{parskip}

\definecolor{accent}{HTML}{2563EB}

% Compact, accented, uppercase section headings.
\titleformat{\section}{\large\bfseries\color{accent}}{}{0em}{\MakeUppercase}
\titlespacing*{\section}{0pt}{10pt}{3pt}

\pagestyle{empty}

\begin{document}

% --- Header: name + headline ----------------------------------------------
{\Huge\bfseries {{fullName}}\par}
\vspace{2pt}
{\large\color{accent} {{headline}}\par}

\vspace{4pt}
{\color{accent}\hrule height 0.8pt}
\vspace{6pt}

% --- Profile ---------------------------------------------------------------
\section*{Profile}
{{profile}}

% --- Contact ---------------------------------------------------------------
\section*{Contact}
{{email}} \quad {{phone}}

{{links}}

% --- Experience ------------------------------------------------------------
\section*{Experience}
{{experience}}

% --- Education -------------------------------------------------------------
\section*{Education}
{{education}}

% --- Certificates ----------------------------------------------------------
\section*{Certificates}
{{certificates}}

% --- Skills ----------------------------------------------------------------
\section*{Skills}
{{skills}}

\end{document}
```

Two more ready-made starting points live in `docs/templates/`:

- `minimal-reference.tex` — a centred-header, bulleted one-pager.
- `resume-blue-accent.tex` — a richer Word-style layout with custom
  `\newcommand` macros and a two-column date layout.
- `blue-accent-adapted.tex` — the same Word/ChatGPT blue-accent design adapted
  end to end: no `\input`, no `\pdfgentounicode`, the documented placeholders in
  place of hardcoded personal data, and one-line-per-entry sections. Verified
  in the real sandbox (single page) and through the live preview endpoint.

The first two predate the automatic line-break handling and still wrap
multi-line fields in `\obeylines`; that is now redundant (see §2) but harmless.
Prefer the example above or `blue-accent-adapted.tex` for new templates.

### Adapting a finished CV (e.g. one ChatGPT wrote from your resume)

A finished CV is **not** a template. Before it can go in the editor it must be
converted, and the conversion always hits the same five points:

1. Delete `\input{...}` / `\pdfgentounicode` / `\write18`-style lines outright —
   they are blocked primitives and the save/preview fails naming them.
2. Replace every piece of personal data with the matching `{{placeholder}}`.
   A template with no placeholders prints the author's own CV for every user.
3. Collapse multi-argument entry macros (`\resumeSubheading{role}{dates}{company}{city}`)
   into one-line-per-entry lists, because Experience arrives as a single string.
4. Delete sections that have no placeholder (Projects, Languages) or fold their
   content into `{{profile}}` / `{{experience}}` / `{{skills}}`. A Summary becomes
   `{{profile}}`; a Certifications section becomes `{{certificates}}`.
5. Fix the class options (`9pt` is not real; use `10pt`) and drop redundant
   packages (`color` next to `xcolor`).
6. Put `\item` in front of every multi-line placeholder that sits inside an
   `itemize`/`enumerate`. A placeholder alone in a list is the single most
   common fatal error: pdflatex stops with "perhaps a missing \item" and
   produces no PDF at all. One `\item {{experience}}` is enough — the entries
   already arrive one line each.

`docs/templates/blue-accent-adapted.tex` is a worked example of exactly this
conversion, with each change commented at the top of the file.
`docs/templates/blue-accent-user.tex` is the same design kept as close to the
original as possible, with only the `\item` fix applied.
`docs/templates/blue-accent-exact.tex` is the finished Word-style CV converted
with the smallest possible diff: same colours, margins, section rules and list
spacing, personal data swapped for the documented placeholders, and the
placeholder-free sections (Projects/Languages) removed.

---

## 7. Before you activate

The admin editor shows a live checklist. A template can only be offered to users
once:

1. **It has a name** users will recognise in the gallery.
2. **A preview compiles** — save a preview that renders at least once. A template
   that never compiled may reference a package the sandbox lacks.
3. **It uses only documented placeholders** — the checklist names any stray
   token (e.g. `{{projects}}`).

You can still save a draft with items outstanding, but an *active* template with
a missing preview may show users a template that does not render.

---

## 8. Ready-to-use AI prompt

Paste this into an AI assistant to generate a compliant template, then drop the
result into the admin editor and compile a preview before activating.

```
Write a complete single-page LaTeX CV template for a job-application builder.

Hard requirements:
- It must be a full document starting with \documentclass[10pt,a4paper]{article}.
- Use ONLY these packages: fontenc, inputenc, geometry, titlesec, enumitem,
  xcolor, hyperref, parskip, fancyhdr, tabularx, marvosym, latexsym.
- Do NOT use any of these primitives: \input, \include, \def, \let, \write,
  \immediate, \openout, \openin, \read, \catcode, \special, \write18,
  \directlua, \pdfliteral, \csname, \expandafter, \newcommand is allowed.
- Insert EXACTLY these placeholders and no others, each on its own line:
  {{fullName}}, {{headline}}, {{profile}}, {{email}}, {{phone}}, {{links}},
  {{experience}}, {{education}}, {{certificates}}, {{skills}}.
- The multi-line placeholders ({{profile}}, {{links}}, {{experience}},
  {{education}}, {{certificates}}, {{skills}}) already receive one hard line
  break per entry, so do NOT wrap them in \obeylines or add your own \\ between
  entries.
- Content is pre-escaped plain text; do not assume the user typed any markup.

Design goals:
- Fits on ONE page with realistic content. Use ~1.5cm margins, compact section
  spacing (titlesec \titlespacing), and a clean accent colour.
- Sections: a name/headline header, Profile, Contact, Experience, Education,
  Certificates, Skills.
- Professional, ATS-friendly, no photos or graphics.

Return only the .tex source in a single code block, with brief % comments
explaining each section.
```

### 8.1 Short version — when you already have an example

Paste this together with your example template (a finished CV, a template you
found, or one another AI wrote). It is enough for any AI to adapt the example
without producing sandbox errors:

```
Adapt the LaTeX CV template below to my CV builder. Rules:
- Full document starting \documentclass[10pt,a4paper]{article}; pdflatex only.
- Packages ONLY from: fontenc, inputenc, geometry, fullpage, titlesec, enumitem,
  xcolor, hyperref, parskip, fancyhdr, tabularx, marvosym, latexsym.
- NEVER use: \input, \include, \RequirePackage, \def, \let, \write, \read,
  \catcode, \special, \write18, \directlua, \pdfliteral, \csname, \expandafter,
  \pdfgentounicode, \obeylines. (\newcommand and \renewcommand are allowed.)
- Replace ALL personal data with EXACTLY these tokens and no others:
  {{fullName}} {{headline}} {{profile}} {{email}} {{phone}} {{links}}
  {{experience}} {{education}} {{certificates}} {{skills}}
- The multi-line tokens (profile, links, experience, education, certificates,
  skills) already arrive with one hard line break per line: put each alone on its
  own line; no \obeylines and no manual \\ between entries.
- Delete any section that has no token (Projects, Languages) or merge its
  content into profile / experience / certificates / skills. A Summary becomes
  {{profile}}; a Certifications section becomes {{certificates}}.
- Keep my example's visual style and fit one page (small margins, compact
  titlesec spacing).
Return only the .tex source in one code block.
```

### 8.2 Detailed version — "make it match my example exactly"

Use this when the example has a strong visual identity (corporate colours,
Word-mirroring layout, custom macros) and you want the adaptation to keep it.
Paste the prompt, then paste the example CV where indicated:

```
You are converting a FINISHED LaTeX CV (pasted at the end) into a template for
a CV-builder web app. The builder merges user-typed plain text into the
template and compiles it with pdflatex in a locked-down sandbox. Reproduce the
example's visual identity as closely as the rules below allow.

HARD RULES (violating any one makes the compile fail):
1. Output ONE complete document starting with
   \documentclass[letterpaper,10pt]{article} (use a4paper if the example does).
   Never 8pt/9pt (article has no such option) and never a second
   \documentclass — pasting two templates together is a fatal error.
2. Packages ONLY from this allow-list: amsmath, amssymb, array, babel,
   charter, color, courier, csquotes, enumitem, fancyhdr, fontenc, fullpage,
   geometry, hyperref, iftex, inconsolata, inputenc, koma-script, latexsym,
   lipsum, mathptmx, marvosym, microtype, multicol, needspace, newtxtext,
   parskip, ragged2e, setspace, soul, tabularray, tabularx, tgheros, tgtermes,
   titlesec, xcolor, xurl. Drop everything else silently.
3. NEVER emit, in any form: \input, \include, \RequirePackage, \def, \let,
   \write, \immediate, \openout, \openin, \read, \catcode, \special,
   \write18, \directlua, \pdfliteral, \csname, \expandafter,
   \pdfgentounicode, \obeylines. Only \newcommand / \renewcommand are allowed.
4. Replace EVERY piece of personal data (name, title, email, phone, city,
   URLs, jobs, degrees, skill lines, summary text) with EXACTLY these
   tokens and no others, each token alone on its own line:
   {{fullName}} {{headline}} {{profile}} {{email}} {{phone}} {{links}}
   {{experience}} {{education}} {{certificates}} {{skills}}
   Any author text left behind would print on every user's CV.
5. The multi-line tokens (profile, links, experience, education, certificates,
   skills) arrive as ONE escaped string that already contains one hard line break
   per line. So: never wrap them in \obeylines; never add \\ between their
   entries; and if a token sits inside itemize/enumerate it MUST be prefixed with
   \item (e.g. `\item {{experience}}` or `\resumeItem{ {{experience}} }`). A bare
   token in a list is a fatal pdflatex error ("perhaps a missing \item") that
   produces no PDF at all — the single most common mistake; check every list.
6. Content is pre-escaped plain text (& % $ # _ { } ~ ^ are escaped by the
   builder), so never assume the user typed markup, and never keep
   multi-argument entry macros such as
   \resumeSubheading{role}{dates}{company}{city} or two-column tabular* date
   layouts: one merged string cannot fill four arguments. Render entries as
   one-line-per-entry lists using the example's own leftmargin / itemsep /
   topsep / parsep options.
7. Delete every section with no token (Projects, Languages...) or fold its
   purpose into profile / experience / certificates / skills. A Summary or
   objective becomes {{profile}}; a Certifications section becomes
   {{certificates}}. Never invent new tokens.
8. Must compile to ONE page with realistic content: copy the example's margin
   setup and compact spacing (\titlespacing, small \vspace, \small or
   \footnotesize where the example uses them). No photos, graphics or
   minipage portraits.

DESIGN FIDELITY (copy from the example, unchanged):
- Every \definecolor name and its HTML/RGB value; reuse those names everywhere.
- The header layout (alignment, font sizes, line order) with tokens in place
  of the data; keep separators such as $\quad|\quad$.
- The \titleformat / \titlespacing section style, rules and colours.
- The pagestyle/fancyhdr setup and the margin commands (geometry options or
  \addtolength pairs), whichever the example uses.
- The example's list styles as \newcommand list-start / list-end macros when
  the example defined them.
- The example's section titles, in its language, for the sections that remain.

OUTPUT:
Return ONLY the .tex source in a single code block. At the top of the file, as
% comments, list every change you made versus the example, one line per
change, so a human can audit it.

EXAMPLE TO ADAPT:
<paste the finished CV here>
```
