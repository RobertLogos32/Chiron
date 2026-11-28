"""Regression tests for the issues found during the acceptance testing (COLLAUDO.md)."""

from unittest import IsolatedAsyncioTestCase, TestCase
from unittest.mock import AsyncMock, Mock, patch
from xml.etree import ElementTree

import httpx
from langchain_core.messages import AIMessage
from openai import RateLimitError

from src.core.agent import answer_selection, selection_context, typed_formula, verified_writes
from src.core.tools.cursor_tools import BoardWrite, SelectionSource
from src.core.tools.math_tools import MathRequest, _answer, _calculate
from src.core.tools.visual_tools import draw_chart, plot_call_ranges, plot_function, school_formula
from src.server.app import rate_limit_message


def calculate(operation, *expressions, **options):
    return _answer(MathRequest(operation=operation, expressions=list(expressions), **options).model_dump_json())


class CalculatorTests(TestCase):
    def test_logarithm_base_must_be_positive_and_not_one(self):
        for base in ("1", "0", "-2"):
            with self.subTest(base=base):
                result = calculate("domain", f"log(x,{base})", variables=["x"])
                self.assertEqual(result["status"], "unavailable")
                self.assertIn("base del logaritmo", result["message"])
        self.assertEqual(calculate("domain", "log(x,2)", variables=["x"])["result"], "Interval.open(0, oo)")

    def test_inequalities_with_absolute_values(self):
        for expression in ("sqrt(x**2)>=x", "abs(x)>=x"):
            with self.subTest(expression=expression):
                self.assertEqual(calculate("solve", expression, variables=["x"])["result"], "Reals")
        self.assertEqual(calculate("solve", "abs(x-1)<2*x", variables=["x"])["result"], "Interval.open(1/3, oo)")

    def test_derivatives_of_absolute_values_use_real_variables(self):
        expected = {"abs(x)": "sign(x)", "abs(x-2)": "sign(x - 2)", "x*abs(x)": "2*Abs(x)", "log(abs(x))": "1/x"}
        for expression, derivative in expected.items():
            with self.subTest(expression=expression):
                result = calculate("derivative", expression, variables=["x"])
                self.assertEqual(result["result"], derivative)
                self.assertNotIn("re(", result["result"])
                self.assertIn("derivabile", result["note"])

    def test_series_only_where_a_taylor_expansion_exists(self):
        for expression in ("sqrt(x)", "log(x)"):
            with self.subTest(expression=expression):
                result = calculate("series", expression, variables=["x"], order=3)
                self.assertEqual(result["status"], "unavailable")
                self.assertIn("non è sviluppabile in serie di Taylor", result["message"])
        self.assertEqual(calculate("series", "1/x", variables=["x"], order=3)["status"], "ok")

    def test_school_messages(self):
        tangent = calculate("integral", "tan(x)", variables=["x"], lower="0", upper="pi")
        self.assertIn("x = π/2", tangent["result"])
        self.assertIn("diverge", tangent["result"])
        inverse = calculate("integral", "1/x", variables=["x"], lower="-1", upper="1")
        self.assertIn("diverge", inverse["result"])
        self.assertEqual(inverse["principal_value"], "0")
        self.assertEqual(calculate("sum", "1/n", variables=["n"], lower="0", upper="5")["message"],
                         "Il termine con n = 0 non è definito.")
        self.assertNotIn("ImageSet", calculate("domain", "tan(x)", variables=["x"])["display"])
        self.assertEqual(calculate("statistics", "[]")["message"], "Non ci sono dati da analizzare.")
        self.assertEqual(calculate("domain", "log(x)", variables=["x"])["display"], "(0, +∞)")

    def test_school_notation_is_read(self):
        self.assertEqual(calculate("evaluate", "1,5+2")["result"], "7/2")
        self.assertEqual(calculate("evaluate", "5!")["result"], "120")
        self.assertEqual(calculate("evaluate", "20%*50")["result"], "10")
        self.assertEqual(calculate("evaluate", "2(3+1)")["result"], "8")
        self.assertEqual(calculate("derivative", "|x|*x", variables=["x"])["result"], "2*Abs(x)")
        self.assertIn("Piecewise", calculate("evaluate", "Piecewise((x, x>0))", variables=["x"])["message"])

    def test_classic_series_are_fast_enough_for_the_worker(self):
        self.assertEqual(_calculate(MathRequest(
            operation="sum", expressions=["2**n/factorial(n)"], variables=["n"], lower="0", upper="oo",
        ))["result"], "exp(2)")
        self.assertTrue(_calculate(MathRequest(
            operation="sum", expressions=["factorial(n)/n**n"], variables=["n"], lower="1", upper="oo",
        ))["convergent"])


class RoutingTests(TestCase):
    def test_without_writing_on_the_board(self):
        for prompt in (
            "Scrivi solo nel riquadro AI, senza scrivere sulla lavagna",
            "Rispondi qui, non scrivere sulla lavagna",
        ):
            with self.subTest(prompt=prompt):
                context = selection_context(prompt, None, True)
                self.assertFalse(context["can_write"])
                self.assertIsNone(context["write_tool"])

    def test_graphs_in_the_reply_stay_off_the_board(self):
        for prompt in (
            "disegna il grafico di y=x^2 senza scrivere sulla lavagna",
            "mostrami il grafico di y=x^2 qui nella risposta",
        ):
            with self.subTest(prompt=prompt):
                context = selection_context(prompt, None, True)
                self.assertIsNone(context["write_tool"])
                self.assertEqual(context["reply_tool"], "plot_function")

    def test_bar_charts_use_the_chart_tool(self):
        self.assertEqual(selection_context("Disegna un grafico a barre dei dati", None, True)["write_tool"], "draw_chart")
        self.assertEqual(selection_context("Fammi un istogramma delle vendite", None, True)["write_tool"], "draw_chart")


class VisualTests(TestCase):
    def test_unrequested_ranges_are_ignored(self):
        self.assertEqual(plot_call_ranges({"expressions": ["x**2"], "x_range": [0, 4], "y_range": [0, 10]}, {}),
                         {"expressions": ["x**2"]})

    def test_legend_uses_school_notation(self):
        self.assertEqual(school_formula("x**2 - 4"), "x² − 4")
        self.assertEqual(school_formula("2*x + 1"), "2x + 1")
        svg = plot_function.invoke({
            "type": "tool_call", "name": "plot_function", "id": "p", "args": {"expressions": ["x**2 - 4", "sin(x)"]},
        }).artifact["writes"][0]["visual"]["svg"]
        self.assertIn("y = x² − 4", svg)
        self.assertIn("Scale molto diverse", svg)

    def test_implicit_products_and_unsupported_functions(self):
        def plot(expression):
            return plot_function.invoke({
                "type": "tool_call", "name": "plot_function", "id": "p", "args": {"expressions": [expression]},
            }).artifact

        self.assertTrue(plot("2x+1")["writes"])
        self.assertTrue(plot("floor(x)")["writes"])
        self.assertEqual(plot("Piecewise((x, x>0), (-x, True))")["response"],
                         "La funzione Piecewise non è supportata dal calcolatore.")

    def test_bar_and_pie_charts(self):
        for kind in ("bar", "pie"):
            artifact = draw_chart.invoke({"type": "tool_call", "name": "draw_chart", "id": kind, "args": {
                "kind": kind, "labels": ["gennaio", "febbraio", "marzo"], "values": [10, 25, 15],
            }}).artifact
            image = ElementTree.fromstring(artifact["writes"][0]["visual"]["svg"])
            self.assertIn("febbraio", ElementTree.tostring(image, encoding="unicode"))


class VerifiedWriteTests(TestCase):
    def test_contradicting_result_is_replaced(self):
        calculation = {"status": "ok", "operation": "evaluate", "expressions": ["6*7"], "result": "42"}
        writes, warning = verified_writes(calculation, [BoardWrite(kind="text", content="Risultato finale: 6 × 7 = 41")])
        self.assertIn("6 × 7 = 42", writes[0].content)
        self.assertIn("42", warning)
        kept, warning = verified_writes(calculation, [BoardWrite(kind="text", content="6 × 7 = 42")])
        self.assertEqual(kept[0].content, "6 × 7 = 42")
        self.assertEqual(warning, "")

    def test_typed_formula_is_read_from_the_prompt_or_the_selection(self):
        self.assertEqual(
            typed_formula("Calcola la derivata di x^3*sin(x) e scrivila sotto", ""),
            {"operation": "derivative", "expressions": ["x^3*sin(x)"], "variables": ["x"]},
        )
        self.assertEqual(
            typed_formula("Calcola la derivata e scrivila sotto", "f(x) = x*|x|"),
            {"operation": "derivative", "expressions": ["x*|x|"], "variables": ["x"]},
        )


class FlowTests(IsolatedAsyncioTestCase):
    async def test_board_keeps_the_verified_result(self):
        transcription = AsyncMock()
        transcription.ainvoke.return_value = AIMessage(content="", tool_calls=[{
            "id": "math", "name": "calculate_math", "args": {"operation": "evaluate", "expressions": ["6*7"]},
        }])
        writing = AsyncMock()
        writing.ainvoke.return_value = AIMessage(content="", tool_calls=[{
            "id": "write", "name": "write_board_solution", "args": {"solution": "Risultato finale: 6 × 7 = 41"},
        }])
        client = Mock()
        client.bind_tools.side_effect = [transcription, writing]
        with patch("src.core.agent.model", return_value=client):
            answer = await answer_selection("Calcola e scrivi sulla lavagna 6 × 7", "image", can_write=True)
        self.assertEqual(len(answer.writes), 1)
        self.assertIn("= 42", answer.writes[0].content)
        self.assertNotIn("41", answer.writes[0].content)

    async def test_clarification_is_replaced_by_the_typed_formula(self):
        clarify = AsyncMock()
        clarify.ainvoke.return_value = AIMessage(content="", tool_calls=[{
            "id": "c", "name": "calculate_math", "args": {"operation": "clarify", "clarification": "Quale formula?"},
        }])
        writing = AsyncMock()
        writing.ainvoke.return_value = AIMessage(content="", tool_calls=[{
            "id": "w", "name": "write_board_solution", "args": {"solution": "f'(x) = 2|x|"},
        }])
        client = Mock()
        client.bind_tools.side_effect = [clarify, writing]
        with patch("src.core.agent.model", return_value=client):
            answer = await answer_selection(
                "Calcola la derivata e scrivila sotto", "image", can_write=True,
                source=SelectionSource(text="f(x) = x*|x|"),
            )
        self.assertEqual(answer.writes[0].content, "f'(x) = 2|x|")

    async def test_graph_in_the_reply_is_shown_in_the_card(self):
        client = Mock()
        client.bind_tools.return_value.ainvoke = AsyncMock(return_value=AIMessage(content="", tool_calls=[{
            "id": "p", "name": "plot_function", "args": {"expressions": ["x**2"], "x_range": [0, 4]},
        }]))
        with patch("src.core.agent.model", return_value=client):
            answer = await answer_selection(
                "Disegna il grafico di y = x^2 senza scrivere sulla lavagna", "image", can_write=True,
            )
        self.assertTrue(answer.show_in_reply)
        self.assertEqual(answer.writes[0].kind, "visual")
        self.assertIn(">-6<", answer.writes[0].visual.svg)


class RateLimitTests(TestCase):
    def error(self, message, headers=None):
        request = httpx.Request("POST", "https://provider.test/chat")
        return RateLimitError(message, response=httpx.Response(429, headers=headers or {}, request=request), body=None)

    def test_daily_limit_reports_the_wait(self):
        message, wait = rate_limit_message(self.error(
            "Rate limit reached on tokens per day (TPD): Limit 200000. Please try again in 7m23.5s.",
        ))
        self.assertIn("giornaliero", message)
        self.assertIn("8 minuti", message)
        self.assertAlmostEqual(wait, 443.5)

    def test_minute_limit_uses_retry_after(self):
        message, wait = rate_limit_message(self.error("Too many requests", {"retry-after": "12"}))
        self.assertIn("al minuto", message)
        self.assertIn("12 secondi", message)
        self.assertEqual(wait, 12)


class EndpointTests(TestCase):
    PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="

    def test_answer_is_returned_while_the_client_waits(self):
        from fastapi.testclient import TestClient

        from src.core.tools.cursor_tools import SelectionAnswer
        from src.server import app as server

        async def slow_answer(*arguments):
            import asyncio
            await asyncio.sleep(0.6)
            return SelectionAnswer(response="Fatto")

        with patch.object(server, "answer_selection", slow_answer), patch.object(server, "warm_calculator"):
            with TestClient(server.app) as client:
                response = client.post("/api/ai/selection", json={"prompt": "Ciao", "image": self.PNG})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["response"], "Fatto")

    def test_rate_limit_keeps_the_retry_after_header(self):
        from fastapi.testclient import TestClient

        from src.server import app as server

        async def limited(*arguments):
            raise RateLimitTests().error("Rate limit on requests per day (RPD)", {"retry-after": "3600"})

        with patch.object(server, "answer_selection", limited), patch.object(server, "warm_calculator"):
            with TestClient(server.app) as client:
                response = client.post("/api/ai/selection", json={"prompt": "Ciao", "image": self.PNG})
        self.assertEqual(response.status_code, 429)
        self.assertEqual(response.headers["retry-after"], "3600")
        self.assertIn("giornaliero", response.json()["detail"])
