import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from label_documents import THRESHOLDS, damp_boilerplate, propose  # noqa: E402

VOCABULARY = json.loads((Path(__file__).resolve().parents[1] / "labels/vocabulary.json").read_text())


class Lexicon(unittest.TestCase):
    def test_vocabulary_is_valid_for_the_engine(self):
        ids = [v["id"] for v in VOCABULARY]
        self.assertEqual(len(ids), len(set(ids)))
        for v in VOCABULARY:
            self.assertRegex(v["id"], r"^[a-z0-9][a-z0-9._-]{0,99}$")
            self.assertIn(v["kind"], THRESHOLDS)
            self.assertTrue(v["label"].strip() and v["aliases"])

    def test_names_need_their_capitals_and_topics_need_repetition(self):
        pages = {"a": [(1, "Debs spoke. Comrade Debs answered the strikers."), (2, "The strike and the lockout; scabs. Another strike.")],
                 "b": [(1, "the debs of the season; one strike only")]}
        proposals = {(p["item"], p["label"]): p for p in propose(VOCABULARY, pages)}
        self.assertIn(("a", "person.debs"), proposals)
        self.assertIn(("a", "topic.strikes"), proposals)
        self.assertNotIn(("b", "person.debs"), proposals)
        self.assertNotIn(("b", "topic.strikes"), proposals)
        evidence = proposals[("a", "topic.strikes")]["evidence"]
        self.assertEqual(evidence["pages_matched"], 2)
        self.assertEqual([p["page"] for p in evidence["pages"]], [1, 2])

    def test_abbreviations_match_with_their_periods_and_not_inside_words(self):
        pages = {"a": [(1, "The I. W. W. and the I.W.W. organizers."), (3, "Wobblies at work; IWWs")]}
        labels = {p["label"] for p in propose(VOCABULARY, pages)}
        self.assertIn("org.iww", labels)
        pages = {"b": [(1, "Gary, Ind. and Gary, Indiana"), (2, "Garyson")]}
        self.assertIn("place.gary", {p["label"] for p in propose(VOCABULARY, pages)})

    def test_publication_boilerplate_is_dropped_and_reported(self):
        publication = {f"isr-{n}": "International Socialist Review" for n in range(12)}
        publication["other"] = "Hope"
        proposals = [{"item": item, "label": "person.kerr"} for item in publication] + [{"item": "isr-0", "label": "topic.strikes"}]
        proposals += [{"item": item, "label": "topic.strikes"} for item in publication if item != "isr-0"]
        kinds = {v["id"]: v["kind"] for v in VOCABULARY}
        kept, dropped = damp_boilerplate(proposals, publication, kinds)
        self.assertEqual(dropped, {"International Socialist Review": ["person.kerr"]})
        kept = {(p["item"], p["label"]) for p in kept}
        self.assertIn(("other", "person.kerr"), kept)
        self.assertEqual(sum(label == "topic.strikes" for _, label in kept), 13)


if __name__ == "__main__":
    unittest.main()
