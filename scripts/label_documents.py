#!/usr/bin/env python3
"""Propose topic and tag labels from indexed page text (method lexicon-v1).

Reads the controlled vocabulary and a CSV export of indexed pages
(`item_id,publication,page,text`) and writes engine label proposals with page
evidence:

    label_documents.py --vocabulary labels/vocabulary.json --pages pages.csv --output proposals.json

Matching is literal: lowercase aliases match case-insensitively, aliases with
capitals or abbreviations match exactly, both on word boundaries. A label is
proposed when its matches reach the kind's threshold. A label found in most of
one publication's documents (mastheads, publisher advertisements, standing
columns) says little about any single issue, so it is dropped for that
publication and reported instead. Proposals stay private in the engine until an
editor accepts them; this script decides nothing.
"""
import argparse
import csv
import json
import re
import sys
from collections import defaultdict
from pathlib import Path

METHOD = "lexicon-v1"
# Minimum total matches before a label is proposed. Topics use common words, so
# they need more evidence than names.
THRESHOLDS = {"topic": 4, "place": 2, "organization": 2, "person": 2, "event": 2}
MAX_EVIDENCE_PAGES = 10
# A label proposed for this share of a publication's documents (with at least
# BOILERPLATE_MIN_DOCUMENTS documents) is treated as publication boilerplate.
BOILERPLATE_SHARE = 0.6
BOILERPLATE_MIN_DOCUMENTS = 10
# Only names are damped: mastheads and publisher advertisements repeat people
# and organizations. A topic recurring across a publication is still content.
BOILERPLATE_KINDS = {"person", "organization"}


def compile_vocabulary(labels: list[dict]) -> list[tuple[dict, re.Pattern]]:
    compiled = []
    for label in labels:
        terms = sorted({a for a in label.get("aliases", []) if a.strip()}, key=len, reverse=True)
        if not terms:
            continue
        exact = [re.escape(t) for t in terms if t != t.lower()]
        loose = [re.escape(t) for t in terms if t == t.lower()]
        parts = []
        if exact:
            parts.append("(?:" + "|".join(exact) + ")")
        if loose:
            parts.append("(?i:" + "|".join(loose) + ")")
        # Word boundaries that also work around trailing periods in abbreviations.
        compiled.append((label, re.compile(r"(?<![\w])(?:" + "|".join(parts) + r")(?![\w])")))
    return compiled


def excerpt(text: str, start: int, end: int, width: int = 80) -> str:
    left = max(0, start - width)
    right = min(len(text), end + width)
    return " ".join(text[left:right].split())


def propose(vocabulary: list[dict], pages: dict[str, list[tuple[int, str]]]) -> list[dict]:
    compiled = compile_vocabulary(vocabulary)
    proposals = []
    for item, item_pages in sorted(pages.items()):
        for label, pattern in compiled:
            per_page = []
            for page, text in sorted(item_pages):
                matches = list(pattern.finditer(text))
                if matches:
                    terms = sorted({m.group(0) for m in matches})
                    per_page.append({"page": page, "count": len(matches), "terms": terms[:8],
                                     "excerpt": excerpt(text, matches[0].start(), matches[0].end())})
            total = sum(p["count"] for p in per_page)
            if total < THRESHOLDS[label["kind"]]:
                continue
            best = sorted(per_page, key=lambda p: (-p["count"], p["page"]))[:MAX_EVIDENCE_PAGES]
            proposals.append({
                "item": item, "label": label["id"], "method": METHOD, "score": float(total),
                "evidence": {"method": METHOD, "total": total, "pages_matched": len(per_page),
                             "pages": sorted(best, key=lambda p: p["page"])},
            })
    return proposals


def damp_boilerplate(proposals: list[dict], publication: dict[str, str], kinds: dict[str, str]) -> tuple[list[dict], dict[str, list[str]]]:
    documents: dict[str, set[str]] = defaultdict(set)
    for item, pub in publication.items():
        documents[pub].add(item)
    hits: dict[tuple[str, str], int] = defaultdict(int)
    for p in proposals:
        hits[(publication.get(p["item"], ""), p["label"])] += 1
    boiler = {key for key, n in hits.items()
              if kinds.get(key[1]) in BOILERPLATE_KINDS and len(documents[key[0]]) >= BOILERPLATE_MIN_DOCUMENTS
              and n >= BOILERPLATE_SHARE * len(documents[key[0]])}
    dropped: dict[str, list[str]] = defaultdict(list)
    for pub, label in sorted(boiler):
        dropped[pub].append(label)
    return [p for p in proposals if (publication.get(p["item"], ""), p["label"]) not in boiler], dict(dropped)


def read_pages(path: Path) -> tuple[dict[str, list[tuple[int, str]]], dict[str, str]]:
    csv.field_size_limit(sys.maxsize)
    pages: dict[str, list[tuple[int, str]]] = defaultdict(list)
    publication: dict[str, str] = {}
    with open(path, newline="", encoding="utf-8") as f:
        for item, pub, page, text in csv.reader(f):
            pages[item].append((int(page), text))
            publication[item] = pub
    return pages, publication


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--vocabulary", required=True, type=Path)
    parser.add_argument("--pages", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    vocabulary = json.loads(args.vocabulary.read_text())
    pages, publication = read_pages(args.pages)
    kinds = {v["id"]: v["kind"] for v in vocabulary}
    proposals, boilerplate = damp_boilerplate(propose(vocabulary, pages), publication, kinds)
    args.output.write_text(json.dumps(proposals, ensure_ascii=False))
    by_label: dict[str, int] = defaultdict(int)
    for p in proposals:
        by_label[p["label"]] += 1
    print(json.dumps({"method": METHOD, "items_read": len(pages), "proposals": len(proposals),
                      "items_labeled": len({p["item"] for p in proposals}),
                      "dropped_as_publication_boilerplate": boilerplate,
                      "by_label": dict(sorted(by_label.items(), key=lambda kv: -kv[1]))}, indent=1))
    return 0


if __name__ == "__main__":
    sys.exit(main())
