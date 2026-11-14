#!/bin/sh
# Builds report/limbo-report.pdf from limbo-report.tex. Needs tectonic (brew install tectonic).
set -e
cd "$(dirname "$0")"
tectonic limbo-report.tex
