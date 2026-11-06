import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from review_labels import decide  # noqa: E402


class Review(unittest.TestCase):
    proposals = [{"item": "a", "label": "topic.strikes", "score": 9}, {"item": "b", "label": "topic.strikes", "score": 4},
                 {"item": "a", "label": "person.london", "score": 2}, {"item": "a", "label": "place.gary", "score": 3}]

    def test_policy_accepts_above_threshold_rejects_listed_and_leaves_the_rest(self):
        decisions = decide({"accept": {"topic.strikes": {"min_score": 5}}, "reject": ["person.london"]}, self.proposals)
        self.assertEqual(decisions, [{"item": "a", "label": "topic.strikes", "state": "accepted"},
                                     {"item": "a", "label": "person.london", "state": "rejected"}])

    def test_shipped_policy_is_valid_and_decides_nothing_yet(self):
        policy = json.loads((Path(__file__).resolve().parents[1] / "labels/review.json").read_text())
        self.assertEqual(decide(policy, self.proposals), [])

    def test_conflicting_policy_is_refused(self):
        with self.assertRaises(ValueError):
            decide({"accept": {"place.gary": {}}, "reject": ["place.gary"]}, self.proposals)


if __name__ == "__main__":
    unittest.main()
