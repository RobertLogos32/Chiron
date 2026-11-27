from unittest import TestCase

from src.core.agent import selection_context


class SelectionContextTests(TestCase):
    def test_local_writing_requests_use_the_board_tool(self):
        for prompt, placement in [
            ("Scrivimi un testo sui limiti", None),
            ("Scrivimi degli esercizi sui limiti", None),
            ("Puoi scrivermi un promemoria?", None),
            ("Risolvimi questo esercizio", None),
            ("Scrivimi qua dei esercizi sui limiti", None),
            ("Scrivimi qua sotto dei es sui limiti", "below"),
            ("Scrivi degli esercizi sotto la selezione", "below"),
            ("Scrivi qui degli esercizi sui limiti", None),
        ]:
            with self.subTest(prompt=prompt):
                context = selection_context(prompt, None, True)
                self.assertEqual(context["write_tool"], "write_board_solution")
                self.assertEqual(context["write_placement"], placement)

    def test_latex_and_chat_requests_keep_their_destination(self):
        latex = selection_context("Scrivimi qui sotto la formula in LaTeX", None, True)
        self.assertEqual(latex["write_tool"], "write_latex")
        self.assertEqual(latex["write_placement"], "below")

        for prompt in [
            "Scrivimi qui in chat degli esercizi sui limiti",
            "Risolvi il limite e rispondi qui",
            "Non scrivere sulla lavagna, dammi degli esercizi",
            "Non scrivermi la soluzione, dammi un indizio",
        ]:
            with self.subTest(prompt=prompt):
                context = selection_context(prompt, None, True)
                self.assertFalse(context["can_write"])
                self.assertIsNone(context["write_tool"])

    def test_missing_board_does_not_authorize_writes(self):
        context = selection_context("Scrivimi qua sotto dei es sui limiti", None, False)
        self.assertFalse(context["can_write"])
        self.assertIsNone(context["write_tool"])
        self.assertIsNone(context["write_placement"])

    def test_only_solution_requests_get_the_orange_style(self):
        for prompt, expected in [
            ("Scrivimi due es di matematica base qua", "note"),
            ("Scrivimi qui sotto degli esercizi sui limiti", "note"),
            ("Scrivi la formula in LaTeX", "note"),
            ("Risolvimi questa equazione", "solution"),
            ("Risolvi questa equazione in LaTeX", "solution"),
        ]:
            with self.subTest(prompt=prompt):
                context = selection_context(prompt, None, True)
                self.assertEqual(context["write_style"], expected)
