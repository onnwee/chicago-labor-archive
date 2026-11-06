import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_import import parse_date, publication, title_for  # noqa: E402


class DatesAndTitles(unittest.TestCase):
    def test_label_dates_keep_their_precision(self):
        self.assertEqual(parse_date("Volume 4, No. 102, February 23, 1910", "x.pdf"), ("1910-02-23", "label day"))
        self.assertEqual(parse_date("Vol. 14, No. 1, July, 1913", "x.pdf"), ("1913-07", "label month"))
        self.assertEqual(parse_date("Volume 1, Number 11, May 1911", "v01n11-mar-1911-Hope.pdf"), ("1911-05", "label month"))

    def test_file_name_dates_are_a_fallback(self):
        self.assertEqual(parse_date("alt presentation", "v14n01-jul-1913-ISR.pdf"), ("1913-07", "file name month"))
        self.assertEqual(parse_date("PDF", "v1n35-mar-13-1915-TAS.pdf"), ("1915-03-13", "file name day"))
        self.assertEqual(parse_date("", "060200-proletarec-v01n02.pdf"), ("1906-02", "file name month"))
        self.assertEqual(parse_date("", "990323-workerscall-v01n03.pdf"), ("1899-03-23", "file name day"))
        self.assertEqual(parse_date("PDF", "antiwar.pdf"), ("", "unknown"))
        self.assertEqual(parse_date("February 30, 1910", "x.pdf"), ("1910", "label year"))

    def test_link_text_is_not_a_title(self):
        self.assertEqual(title_for("Hope", "Volume 1, Number 2, June 1910", "a.pdf"), ("Hope, Volume 1, Number 2, June 1910", "label"))
        self.assertEqual(title_for("ISR", "click here", "debs-negro.pdf")[0], "ISR: debs negro")
        self.assertEqual(title_for("STO", "PDF", "ut7editorial.pdf")[0], "STO: ut7editorial")

    def test_only_register_local_titles_are_selected(self):
        self.assertEqual(publication("Chicago Daily Socialist (1906-1912)"), ("Chicago Daily Socialist", None))
        self.assertIsNone(publication("Appeal to Reason (1895-1922)")[0])
        self.assertIsNone(publication("Social Democratic Herald (1898-1913)")[0])
        self.assertIsNone(publication("Something Else")[0])


if __name__ == "__main__":
    unittest.main()
