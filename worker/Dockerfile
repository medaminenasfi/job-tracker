# LaTeX compilation sandbox (MVP3 Phase 4).
#
# Only purpose: run `pdflatex` on an admin-authored template with escaped user
# values. Never run this image with anything else mounted in — the API shells
# out to `docker run` with --network none --read-only --cap-drop ALL, so the
# container has no network, no writable filesystem outside /job, and no
# capabilities.
#
# Build:  docker build -t jobtracker/latex-worker:latest worker/
# TeX Live is deliberately NOT texlive-full: base + recommended + fonts covers
# standard CV templates and keeps the image ~10x smaller.
# texlive-latex-extra adds titlesec, enumitem and fullpage, which the popular
# Word-mirroring CV templates load for their section headings and margins.
# poppler-utils provides `pdftoppm`, used by the Phase 6 live-preview path to
# rasterize the compiled PDF into a small PNG inside the same sandbox - a preview
# never bypasses these isolation rules, it just adds one low-res render step.

FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
      texlive-latex-base texlive-latex-recommended texlive-latex-extra \
      texlive-fonts-recommended \
      poppler-utils \
    && rm -rf /var/lib/apt/lists/*

# The API runs every compile with --read-only and a tmpfs on /tmp, so TeX needs a
# writable HOME/TEXMFVAR there or font-cache creation fails.
ENV HOME=/tmp \
    TEXMFVAR=/tmp/texmf \
    TEXMFCACHE=/tmp/texmf-var

RUN useradd --no-create-home --uid 10001 texworker
# /job is the per-job scratch dir: the API uploads input.tex into it through the
# Docker archive API and reads output.pdf back the same way, so it must be
# world-writable for both root (extraction) and the non-root TeX process.
RUN mkdir -p /job && chmod 1777 /job
USER texworker
WORKDIR /job

# -no-shell-escape is the belt to the escaping function's braces: a template can
# never shell out, even if escaping were bypassed.
ENTRYPOINT ["pdflatex", "-no-shell-escape", "-interaction=nonstopmode", "-halt-on-error", "-output-directory=/job"]
