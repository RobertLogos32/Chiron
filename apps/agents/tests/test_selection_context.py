from unittest import IsolatedAsyncioTestCase, TestCase
from unittest.mock import AsyncMock, Mock, patch

from langchain_core.messages import AIMessage

from src.core.agent import answer_selection, selection_context
from src.core.tools.cursor_tools import SelectionSource


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

    def test_requests_for_a_calculation_route_to_the_calculator(self):
        for prompt in [
            "Risolvimi questa equazione",
            "Calcola questo limite",
            "Deriva questa funzione",
            "Integra la funzione",
            "Semplificami questa espressione",
            "Risolvi la disequazione",
            "Scomponi questo polinomio",
            "Fattorizza il numeratore",
            "Trova il dominio della funzione",
            "Trova gli autovalori della matrice",
            "Determina il rango al variare di k",
            "Diagonalizza la matrice",
            "Riduci a scala la matrice",
            "Studia la convergenza della serie",
            "Trova i punti critici",
            "Trova la media e la varianza",
            "Risolvi l'equazione differenziale",
        ]:
            with self.subTest(prompt=prompt):
                self.assertTrue(selection_context(prompt, None, True)["calculate"])
        self.assertFalse(selection_context("Scrivimi tre esercizi sui limiti", None, True)["calculate"])

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

    def test_paraphrase_writes_only_when_requested(self):
        write = selection_context("Fammi la parafrasi e scrivimela", None, True)
        self.assertTrue(write["paraphrase"])
        self.assertEqual(write["write_tool"], "write_board_solution")
        self.assertEqual(write["write_style"], "note")
        reply = selection_context("Fammi la parafrasi di questa poesia", None, True)
        self.assertFalse(reply["can_write"])
        self.assertIsNone(reply["write_tool"])


class ParaphraseTests(IsolatedAsyncioTestCase):
    async def test_selected_verses_are_sent_and_short_fragment_is_retried(self):
        poem = (
            "Scende la sera e il vento tace\nnel giardino che aspettava la pioggia.\n\n"
            "La luna rischiara la strada e una finestra illumina l'angolo del cortile."
        )
        full_answer = (
            "Scende la sera e il vento smette di soffiare nel giardino, dove si attendeva la pioggia.\n\n"
            "La luce della luna rende visibile la strada. Da una finestra arriva un po' di luce fino al cortile."
        )
        writer = Mock()
        writer.ainvoke = AsyncMock(return_value=AIMessage(content="", tool_calls=[{
            "name": "write_board_solution", "id": "paraphrase",
            "args": {"solution": "Ah, se io"},
        }]))
        llm = Mock()
        llm.bind_tools.return_value = writer
        llm.ainvoke = AsyncMock(return_value=AIMessage(content=full_answer))
        with patch("src.core.agent.model", return_value=llm):
            answer = await answer_selection(
                "Fammi la parafrasi e scrivimela sulla lavagna",
                "data:image/png;base64,test", can_write=True, source=SelectionSource(text=poem),
            )
        self.assertIn("La luna rischiara la strada", writer.ainvoke.call_args.args[0][-1].content[2]["text"])
        llm.ainvoke.assert_awaited_once()
        self.assertEqual([write.content for write in answer.writes], [full_answer])


class PdfSelectionTests(IsolatedAsyncioTestCase):
    async def test_solve_uses_pdf_crop_and_selected_pdf_text(self):
        image = "data:image/png;base64,test"
        transcription = Mock()
        transcription.ainvoke = AsyncMock(return_value=AIMessage(content="", tool_calls=[{
            "name": "calculate_math", "id": "pdf-equation",
            "args": {"operation": "solve", "expressions": ["3*x-2=4*x+6"], "variables": ["x"]},
        }]))
        llm = Mock()
        llm.bind_tools.return_value = transcription
        llm.ainvoke = AsyncMock(return_value=AIMessage(content="L'equazione ha soluzione x = -8."))
        with patch("src.core.agent.model", return_value=llm):
            answer = await answer_selection(
                "Risolvi e spiegami i passaggi", image, source=SelectionSource(pdf_text="3x − 2 = 4x + 6"),
            )
        input_message = transcription.ainvoke.call_args.args[0][-1]
        self.assertEqual(input_message.content[1]["image_url"]["url"], image)
        self.assertIn("3x − 2 = 4x + 6", input_message.content[2]["text"])
        self.assertIn("-8", answer.response)

    async def test_multiple_equations_still_go_to_the_model(self):
        transcription = Mock()
        transcription.ainvoke = AsyncMock(return_value=AIMessage(content="", tool_calls=[{
            "name": "calculate_math", "id": "unclear",
            "args": {"operation": "clarify"},
        }]))
        llm = Mock()
        llm.bind_tools.return_value = transcription
        with patch("src.core.agent.model", return_value=llm):
            multiple = await answer_selection(
                "risolvi", "data:image/png;base64,test",
                source=SelectionSource(pdf_text="3x − 2 = 4x + 6\nx = 3"),
            )
        transcription.ainvoke.assert_awaited_once()
        self.assertIn("Seleziona l'esercizio completo", multiple.response)

    async def test_pdf_exercise_number_and_fraction_are_solved_locally(self):
        with patch("src.core.agent.model", side_effect=AssertionError("Expected the local solver")):
            answer = await answer_selection(
                "risolvimi l’equazione", "data:image/png;base64,test",
                source=SelectionSource(pdf_text="12\t(1/4)𝑥 + 3 = 𝑥 − 6"),
            )
        self.assertIn("-3*x/4 = -9", answer.response)
        self.assertIn("x = 12", answer.response)

    async def test_typed_equation_is_solved_and_written_in_the_solution_style(self):
        with patch("src.core.agent.model", side_effect=AssertionError("Expected the local solver")):
            answer = await answer_selection(
                "risolvi questa eq", "data:image/png;base64,test", can_write=True,
                source=SelectionSource(text="1/4 x + 3 = x - 6"),
            )
        self.assertEqual(answer.write_style, "solution")
        self.assertEqual(len(answer.writes), 1)
        self.assertIn("x = 12", answer.writes[0].content)

    async def test_pdf_solution_fits_in_two_annotation_lines(self):
        with patch("src.core.agent.model", side_effect=AssertionError("Expected the local solver")):
            answer = await answer_selection(
                "risolvimi l'equazione", "data:image/png;base64,test", can_write=True,
                source=SelectionSource(pdf_text="12\t(1/4) x + 3 = x - 6"),
            )
        self.assertEqual(answer.write_style, "solution")
        self.assertEqual(answer.writes[0].content, "-3*x/4 = -9\nx = 12")
