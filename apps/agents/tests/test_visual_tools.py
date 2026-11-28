from unittest import IsolatedAsyncioTestCase, TestCase
from unittest.mock import patch
from xml.etree import ElementTree

from src.core.agent import answer_selection, selection_context
from src.core.tools.cursor_tools import SelectionSource
from src.core.tools.visual_tools import draw_diagram, plot_call_ranges, plot_function, redraw_graph, requested_plot_ranges


SVG = {"s": "http://www.w3.org/2000/svg"}


class VisualToolsTests(TestCase):
    def test_explicit_plot_ranges_replace_the_models_guesses(self):
        ranges = requested_plot_ranges("Grafico con intervallo x [-5, 5] e y da −2,5 a 2,5")
        self.assertEqual(
            plot_call_ranges({"expressions": ["1/x"], "x_range": [0, 10]}, ranges),
            {"expressions": ["1/x"], "x_range": [-5, 5], "y_range": [-2.5, 2.5]},
        )
        self.assertEqual(plot_call_ranges({"x_range": [0, 0]}, {}), {})

    def test_function_plot_splits_the_curve_at_a_pole(self):
        result = plot_function.invoke({
            "type": "tool_call", "name": plot_function.name, "id": "plot",
            "args": {"expressions": ["1/(x-0.03)"], "y_range": [-4, 4]},
        }).artifact
        write = result["writes"][0]
        self.assertEqual(write["kind"], "visual")
        image = ElementTree.fromstring(write["visual"]["svg"])
        curve = image.find(".//s:path[@clip-path='url(#plot)']", SVG)
        self.assertGreaterEqual(curve.attrib["d"].count("M"), 2)

    def test_diagram_escapes_labels_and_draws_an_arrow(self):
        arguments = {
            "nodes": [{"id": "start", "label": "Inizio <qui>"}, {"id": "end", "label": "Fine"}],
            "edges": [{"source": "start", "target": "end", "label": "Poi"}],
        }
        result = draw_diagram.invoke({
            "type": "tool_call", "name": draw_diagram.name, "id": "diagram", "args": arguments,
        }).artifact
        image = ElementTree.fromstring(result["writes"][0]["visual"]["svg"])
        self.assertIsNotNone(image.find(".//s:path[@marker-end='url(#arrow)']", SVG))
        self.assertIn("Inizio <qui>", [label.text for label in image.findall("s:text", SVG)])

    def test_cursor_selects_the_visual_tool_only_for_creation_on_the_board(self):
        self.assertEqual(selection_context("Disegna y=x**2", None, True)["write_tool"], "plot_function")
        self.assertEqual(selection_context("Rifammi il grafico di y=x**2", None, True)["write_tool"], "plot_function")
        self.assertEqual(selection_context("Rifammi questo grafico", None, True)["write_tool"], "redraw_graph")
        self.assertEqual(selection_context("Crea un diagramma di flusso", None, True)["write_tool"], "draw_diagram")
        self.assertIsNone(selection_context("Spiegami il grafico", None, True)["write_tool"])
        self.assertIsNone(selection_context("Non disegnare il grafico", None, True)["write_tool"])
        self.assertIsNone(selection_context("Spiegami come disegnare il grafico", None, True)["write_tool"])
        self.assertIsNone(selection_context("Crea un diagramma", None, False)["write_tool"])


class SketchTests(IsolatedAsyncioTestCase):
    async def test_graph_redraw_draws_the_selected_ink_without_calling_the_model(self):
        source = SelectionSource(strokes=[
            {"color": "#303749", "points": [(40, 252), (270, 246), (500, 250), (820, 264)]},
            {"color": "#303749", "points": [(270, 430), (270, 244), (272, 70)]},
            {"color": "#303749", "points": [(236, 105), (244, 67), (272, 30), (279, 61), (299, 106)]},
            {"color": "#303749", "points": [(821, 223), (825, 256), (847, 278), (838, 286), (794, 295)]},
            {"color": "#303749", "points": [(151, 54), (176, 76), (189, 55), (173, 92), (157, 113)]},
            {"color": "#c36c75", "points": [
                (80, 397), (124, 375), (170, 334), (210, 313), (270, 260),
                (324, 229), (365, 202), (412, 177), (470, 131), (510, 116),
                (558, 82), (605, 43), (650, 20),
            ]},
            {"color": "#303749", "points": [(410, 244), (412, 270)]},
        ])
        with patch("src.core.agent.model", side_effect=AssertionError("Redraw called the model")):
            result = await answer_selection(
                "Rifammi questo grafico più bello", "data:image/png;base64,test", can_write=True, source=source,
            )
            missing = await answer_selection(
                "Rifammi questo grafico", "data:image/png;base64,test", can_write=True,
            )
        visual = result.writes[0].visual
        image = ElementTree.fromstring(visual.svg)
        curves = image.findall(".//s:path[@stroke-width='2.8']", SVG)
        self.assertEqual(len(curves), 1)
        self.assertEqual(curves[0].attrib["stroke"], "#d59ea3")
        path = curves[0].attrib["d"]
        self.assertRegex(path, r"^M[\d.,]+L[\d.,]+$")
        (x0, y0), (x1, y1) = [tuple(map(float, pair.split(","))) for pair in path[1:].split("L")]
        self.assertAlmostEqual((y1 - y0) / (x1 - x0), (20 - 397) / (650 - 80), delta=0.04)
        self.assertIsNotNone(image.find(".//s:path[@stroke-width='1.2']", SVG))
        self.assertEqual({label.text for label in image.findall("s:text", SVG)}, {"Grafico ridisegnato", "x", "y", "0"})
        self.assertEqual(missing.writes, [])
        self.assertIn("assi e la curva", missing.response)

    def test_redraw_preserves_curvature_and_separated_strokes(self):
        axes = [
            {"color": "#303749", "points": [(35, 260), (850, 260)]},
            {"color": "#303749", "points": [(440, 450), (440, 40)]},
        ]
        branches = [
            {"color": "#c36c75", "points": [(x, 104 + (x - 440) ** 2 // 440) for x in interval]}
            for interval in (range(80, 400, 12), range(476, 810, 12))
        ]
        answer = redraw_graph.invoke({
            "type": "tool_call", "name": redraw_graph.name, "id": "sketch",
            "args": {"strokes": [*axes, *branches]},
        }).artifact
        image = ElementTree.fromstring(answer["writes"][0]["visual"]["svg"])
        paths = [curve.attrib["d"] for curve in image.findall(".//s:path[@stroke-width='2.8']", SVG)]
        self.assertEqual(len(paths), 2)
        self.assertTrue(all(path.count("M") == 1 and "Q" in path for path in paths))
