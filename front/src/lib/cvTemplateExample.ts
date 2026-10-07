// The shipped, sandbox-verified example CV template (MVP3).
//
// This exact source was compiled through the real LaTeX sandbox (pdflatex +
// pdftoppm) with the shared sample data and produced a clean single-page CV, so
// it is safe to offer as the admin editor's starting point and as the
// "Insert example" action. It only uses packages on the backend allowlist and
// only the documented placeholders.
//
// String.raw keeps every backslash literal — a normal template literal would
// silently eat the LaTeX escapes.
export const EXAMPLE_CV_TEMPLATE = String.raw`\documentclass[10pt,a4paper]{article}

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
`;
