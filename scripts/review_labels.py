#!/usr/bin/env python3
"""Turn the editor's review policy into engine label decisions.

    review_labels.py --policy labels/review.json --proposals proposals.json --output decisions.json

`labels/review.json` is versioned with the repository, so every acceptance or
rejection has a reviewable commit. `accept` maps a label ID to a minimum score
(total lexicon matches); proposals below it stay proposed. `reject` lists label
IDs whose proposals are all rejected. Labels absent from both stay proposed.
"""
import argparse
import json
import sys
from pathlib import Path


def decide(policy: dict, proposals: list[dict]) -> list[dict]:
    accept = policy.get("accept", {})
    reject = set(policy.get("reject", []))
    overlap = reject & set(accept)
    if overlap:
        raise ValueError(f"labels both accepted and rejected: {sorted(overlap)}")
    decisions = []
    for p in proposals:
        if p["label"] in reject:
            decisions.append({"item": p["item"], "label": p["label"], "state": "rejected"})
        elif p["label"] in accept and p["score"] >= accept[p["label"]].get("min_score", 0):
            decisions.append({"item": p["item"], "label": p["label"], "state": "accepted"})
    return decisions


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--policy", required=True, type=Path)
    parser.add_argument("--proposals", required=True, type=Path, nargs="+")
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    policy = json.loads(args.policy.read_text())
    proposals = [p for path in args.proposals for p in json.loads(path.read_text())]
    decisions = decide(policy, proposals)
    args.output.write_text(json.dumps(decisions))
    print(json.dumps({"proposals": len(proposals), "accepted": sum(d["state"] == "accepted" for d in decisions),
                      "rejected": sum(d["state"] == "rejected" for d in decisions)}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
