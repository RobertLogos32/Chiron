import math
import re
from html import escape
from statistics import fmean
from textwrap import shorten, wrap
from typing import Annotated, Literal

import sympy as sp
from langchain_core.tools import tool
from pydantic import BaseModel, Field, StringConstraints

from .cursor_tools import BoardVisual, BoardWrite, InkStroke, SelectionAnswer
from .math_tools import _conditions, _expression, _lower


WIDTH = 520
CURVES = ("#72dcf0", "#c5a7ff", "#ffad77")
Label = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=64)]
Coordinate = Annotated[float, Field(ge=-10_000, le=10_000, allow_inf_nan=False)]
PlotRange = Annotated[list[Coordinate], Field(min_length=2, max_length=2)]
_NUMBER = r"[+-]?(?:\d+(?:\.\d+)?|\.\d+)"
_DECIMAL = r"[+-]?(?:\d+(?:[.,]\d+)?|[.,]\d+)"
_BRACKET_RANGE = re.compile(rf"\b([xy])\s*(?:in|=|:|∈)?\s*\[\s*({_NUMBER})\s*[,;]\s*({_NUMBER})\s*\]", re.I)
_WORD_RANGE = re.compile(rf"\b([xy])\s+(?:da|tra|fra)\s+({_DECIMAL})\s+(?:a|e)\s+({_DECIMAL})\b", re.I)
# «nell'intervallo [-2, 2]» without an axis refers to x.
_INTERVAL_RANGE = re.compile(rf"\bintervall\w*\s*(?:di\s+)?\[\s*({_NUMBER})\s*[,;]\s*({_NUMBER})\s*\]", re.I)


def requested_plot_ranges(prompt: str) -> dict[str, list[float]]:
    text = prompt.replace("−", "-")
    ranges = {
        "x_range": [float(low), float(high)] for low, high in _INTERVAL_RANGE.findall(text)
    }
    ranges.update({
        f"{axis.lower()}_range": [float(low.replace(",", ".")), float(high.replace(",", "."))]
        for pattern in (_BRACKET_RANGE, _WORD_RANGE)
        for axis, low, high in pattern.findall(text)
    })
    return ranges


def plot_call_ranges(arguments: dict, explicit: dict[str, list[float]]) -> dict:
    """Use only the ranges the student asked for: the model's guesses can hide half a parabola."""
    adjusted = {name: value for name, value in arguments.items() if name not in ("x_range", "y_range")}
    return {**adjusted, **explicit}


_SUPERSCRIPTS = str.maketrans("0123456789-", "⁰¹²³⁴⁵⁶⁷⁸⁹⁻")


def school_formula(formula: str) -> str:
    """Write a calculator formula as in a notebook: x**2 - 4 becomes x² − 4 and 2*x becomes 2x."""
    text = re.sub(r"\*\*\s*\(?(-?\d)\)?(?![\d.])", lambda match: match[1].translate(_SUPERSCRIPTS), formula)
    text = text.replace("**", "^")
    text = re.sub(r"(?<=\d)\s*\*\s*(?=[a-zA-Z(])", "", text)
    text = re.sub(r"\s*\*\s*", "·", text)
    text = re.sub(r"\bsqrt\(", "√(", text)
    return re.sub(r"(?<=\S) - (?=\S)", " − ", text)


class DiagramNode(BaseModel):
    id: Annotated[str, Field(pattern=r"^[a-zA-Z0-9_-]{1,20}$")]
    label: Label


class DiagramEdge(BaseModel):
    source: str
    target: str
    label: Annotated[str, Field(max_length=28)] = ""


def _answer(message: str, svg: str | None = None, height: int = 0) -> tuple[str, dict]:
    if svg is None:
        return message, SelectionAnswer(response=message).model_dump()
    visual = BoardVisual(width=WIDTH, height=height, svg=svg)
    write = BoardWrite(kind="visual", content=message, visual=visual)
    return "Contenuto visivo pronto per la lavagna.", SelectionAnswer(response="", writes=[write]).model_dump()


def _svg(title: str, height: int, parts: list[str]) -> str:
    heading = escape(shorten(title, width=57, placeholder="…"))
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{WIDTH}" height="{height}" '
        f'viewBox="0 0 {WIDTH} {height}" font-family="Segoe UI, sans-serif">'
        f'<rect x="0.5" y="0.5" width="{WIDTH - 1}" height="{height - 1}" rx="18" '
        'fill="#222936" stroke="#536076"/>'
        f'<text x="20" y="30" fill="#f1f4fa" font-size="17" font-weight="600">{heading}</text>'
        + "".join(parts) + "</svg>"
    )


def _stroke_bounds(stroke: InkStroke) -> tuple[int, int, int, int]:
    xs, ys = zip(*stroke.points)
    return min(xs), min(ys), max(xs), max(ys)


def _axis_at(stroke: InkStroke, position: float, axis: int) -> float:
    for start, end in zip(stroke.points, stroke.points[1:]):
        if min(start[axis], end[axis]) <= position <= max(start[axis], end[axis]):
            difference = end[axis] - start[axis]
            portion = (position - start[axis]) / difference if difference else 0
            return start[1 - axis] + portion * (end[1 - axis] - start[1 - axis])
    return min(stroke.points, key=lambda point: abs(point[axis] - position))[1 - axis]


def _fitted_line(points: list[tuple[float, float]]) -> tuple[tuple[float, float], tuple[float, float]] | None:
    center_x, center_y = map(fmean, zip(*points))
    centered = [(x - center_x, y - center_y) for x, y in points]
    angle = math.atan2(
        2 * sum(x * y for x, y in centered),
        sum(x * x - y * y for x, y in centered),
    ) / 2
    dx, dy = math.cos(angle), math.sin(angle)
    along = [x * dx + y * dy for x, y in centered]
    start, end = min(along), max(along)
    length = end - start
    if length < 15 or abs(along[-1] - along[0]) < length * 0.88:
        return None
    errors = [abs(y * dx - x * dy) for x, y in centered]
    if (
        max(errors) > max(2.5, length * 0.035)
        or math.sqrt(fmean(error ** 2 for error in errors)) > max(1.2, length * 0.014)
    ):
        return None
    return (
        (center_x + start * dx, center_y + start * dy),
        (center_x + end * dx, center_y + end * dy),
    )


def _simplify_trace(points: list[tuple[float, float]]) -> list[tuple[float, float]]:
    if len(points) <= 2:
        return points
    x0, y0 = points[0]
    x1, y1 = points[-1]
    dx, dy = x1 - x0, y1 - y0
    squared_length = dx * dx + dy * dy

    def distance(point: tuple[float, float]) -> float:
        x, y = point[0] - x0, point[1] - y0
        projection = (x * dx + y * dy) / squared_length if squared_length else 0
        t = max(0, min(1, projection))
        return math.hypot(x - t * dx, y - t * dy)

    index = max(range(1, len(points) - 1), key=lambda i: distance(points[i]))
    if distance(points[index]) <= 2:
        return [points[0], points[-1]]
    return _simplify_trace(points[:index + 1])[:-1] + _simplify_trace(points[index:])


def _trace_path(points: list[tuple[float, float]]) -> str:
    def svg_point(point: tuple[float, float]) -> str:
        return f"{point[0]:.1f},{point[1]:.1f}"

    line = _fitted_line(points)
    if line:
        return f"M{svg_point(line[0])}L{svg_point(line[-1])}"
    points = _simplify_trace(points)
    path = [f"M{svg_point(points[0])}"]
    for before, point, after in zip(points, points[1:], points[2:]):
        ux, uy = point[0] - before[0], point[1] - before[1]
        vx, vy = after[0] - point[0], after[1] - point[1]
        incoming, outgoing = math.hypot(ux, uy), math.hypot(vx, vy)
        if ux * vx + uy * vy <= 0.6 * incoming * outgoing:
            path.append(f"L{svg_point(point)}")
            continue
        # Round small turns while retaining the location of visible corners.
        a = min(8 / incoming, 0.4)
        b = min(8 / outgoing, 0.4)
        entry = (point[0] - a * ux, point[1] - a * uy)
        exit = (point[0] + b * vx, point[1] + b * vy)
        path.append(f"L{svg_point(entry)}Q{svg_point(point)} {svg_point(exit)}")
    path.append(f"L{svg_point(points[-1])}")
    # Bound the SVG even when the selection contains many detailed curves.
    if sum(map(len, path)) > 2750:
        return "M" + "L".join(map(svg_point, points))
    return "".join(path)


def _sketch_color(color: str, axis_colors: set[str]) -> str:
    if color.casefold() in axis_colors:
        return "#e2e6f0"
    components = [int(color[index:index + 2], 16) for index in (1, 3, 5)]
    return "#" + "".join(f"{round(value * 0.64 + 246 * 0.36):02x}" for value in components)


def _clean_sketch(strokes: list[InkStroke]) -> tuple[str, int] | None:
    boxes = [_stroke_bounds(stroke) for stroke in strokes]
    candidates = []
    for h, (left, h_top, right, h_bottom) in enumerate(boxes):
        width = right - left
        if width < max(12, 3 * (h_bottom - h_top)):
            continue
        for v, (v_left, top, v_right, bottom) in enumerate(boxes):
            height = bottom - top
            if height < max(12, 3 * (v_right - v_left)):
                continue
            origin_x = _axis_at(strokes[v], (h_top + h_bottom) / 2, 1)
            origin_y = _axis_at(strokes[h], origin_x, 0)
            if left - 5 <= origin_x <= right + 5 and top - 5 <= origin_y <= bottom + 5:
                aligned = strokes[h].color.casefold() == strokes[v].color.casefold()
                candidates.append((width * height * (1.5 if aligned else 1), h, v, origin_x, origin_y))
    if not candidates:
        return None
    _, h, v, origin_x, origin_y = max(candidates)
    left, _, right, _ = boxes[h]
    _, top, _, bottom = boxes[v]
    span = max(right - left, bottom - top)
    axis_colors = {strokes[index].color.casefold() for index in (h, v)}
    ticks = {}
    tick_tolerance = span * 0.01
    for index, (x0, y0, x1, y1) in enumerate(boxes):
        if index in (h, v) or strokes[index].color.casefold() not in axis_colors:
            continue
        width, height = x1 - x0, y1 - y0
        cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
        if (max(2, width * 2) <= height <= span * 0.08 and left < cx < right
            and abs(cx - origin_x) >= span * 0.03
            and y0 - tick_tolerance <= _axis_at(strokes[h], cx, 0) <= y1 + tick_tolerance):
            ticks[index] = (0, cx)
        elif (max(2, height * 2) <= width <= span * 0.08 and top < cy < bottom
              and abs(cy - origin_y) >= span * 0.03
              and x0 - tick_tolerance <= _axis_at(strokes[v], cy, 1) <= x1 + tick_tolerance):
            ticks[index] = (1, cy)
    # A short mark in the color of the axes is usually a label or an arrowhead.
    curves = [
        stroke for index, (stroke, (x0, y0, x1, y1)) in enumerate(zip(strokes, boxes))
        if index not in (h, v) and index not in ticks
        and math.hypot(x1 - x0, y1 - y0) >= span * (
            0.18 if stroke.color.casefold() in axis_colors else 0.045
        )
        and any(left <= x <= right and top <= y <= bottom for x, y in stroke.points)
    ]
    if not curves:
        return None

    left = min(left, *(point[0] for stroke in curves for point in stroke.points))
    right = max(right, *(point[0] for stroke in curves for point in stroke.points))
    top = min(top, *(point[1] for stroke in curves for point in stroke.points))
    bottom = max(bottom, *(point[1] for stroke in curves for point in stroke.points))
    scale = min((WIDTH - 96) / (right - left), 350 / (bottom - top))
    height = max(200, math.ceil((bottom - top) * scale + 105))
    edge = (WIDTH - (right - left) * scale) / 2
    y_inset = (height - (bottom - top) * scale) / 2 + 12
    x_at = lambda x: edge + (x - left) * scale
    y_at = lambda y: y_inset + (y - top) * scale
    x0, x1, y0, y1 = x_at(left), x_at(right), y_at(top), y_at(bottom)
    x, y = x_at(origin_x), y_at(origin_y)
    parts = [
        f'<rect x="20" y="46" width="{WIDTH - 40}" height="{height - 64}" rx="10" '
        'fill="#1b2230" stroke="#343f55"/>',
    ]
    if ticks:
        grid = [
            f"M{x_at(position):.1f},{y0:.1f}V{y1:.1f}" if axis == 0
            else f"M{x0:.1f},{y_at(position):.1f}H{x1:.1f}"
            for axis, position in ticks.values()
        ]
        parts.append(f'<path d="{" ".join(grid)}" fill="none" stroke="#343f55"/>')
    parts.extend([
        f'<path d="M{x0:.1f},{y:.1f}H{x1:.1f}m-7,-4l7,4l-7,4 '
        f'M{x:.1f},{y1:.1f}V{y0:.1f}m-4,7l4,-7l4,7" fill="none" stroke="#a4b5ce" '
        'stroke-width="1.5" stroke-linejoin="round"/>',
        f'<text x="{x1 + 10:.1f}" y="{y + 4:.1f}" fill="#becade" font-size="13">x</text>',
        f'<text x="{x + 9:.1f}" y="{y0 - 4:.1f}" fill="#becade" font-size="13">y</text>',
        f'<text x="{x - 13:.1f}" y="{y + 16:.1f}" fill="#becade" font-size="12">0</text>',
    ])
    if ticks:
        marks = [
            f"M{x_at(position):.1f},{y - 4:.1f}v8" if axis == 0
            else f"M{x - 4:.1f},{y_at(position):.1f}h8"
            for axis, position in ticks.values()
        ]
        parts.append(f'<path d="{" ".join(marks)}" fill="none" stroke="#a4b5ce" stroke-width="1.2"/>')
    for stroke in curves[:16]:
        points = [(x_at(x), y_at(y)) for x, y in stroke.points]
        parts.append(
            f'<path d="{_trace_path(points)}" fill="none" stroke="{_sketch_color(stroke.color, axis_colors)}" '
            'stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/>'
        )
    return _svg("Grafico ridisegnato", height, parts), height


@tool(response_format="content_and_artifact")
def redraw_graph(
    strokes: Annotated[list[InkStroke], Field(max_length=48)],
) -> tuple[str, dict]:
    """Ricostruisce assi, tacche e curve di un grafico cartesiano dai tratti della selezione."""
    image = _clean_sketch(strokes)
    if image is None:
        return _answer("Seleziona tutto il grafico disegnato a mano, includendo i due assi e la curva.")
    svg, height = image
    return _answer("Grafico ridisegnato", svg, height)


def _ticks(low: float, high: float) -> list[float]:
    rough = (high - low) / 6
    magnitude = 10 ** math.floor(math.log10(rough))
    step = next(scale * magnitude for scale in (1, 2, 5, 10) if scale * magnitude >= rough)
    return [index * step for index in range(math.ceil(low / step), math.floor(high / step) + 1)]


def _sample(formula: str, low: float, high: float):
    variable = sp.Symbol("x", real=True)
    parsed = _expression(formula, {"x": variable}, keep_roots=True)
    conditions = _conditions(parsed, True)
    restrictions = [sp.Rel(_lower(left), _lower(right), operator) for left, operator, right in conditions]
    denominators = [_lower(left - right) for left, operator, right in conditions if operator == "!="]
    evaluate = sp.lambdify(variable, [_lower(parsed).doit(), *restrictions, *denominators], modules="math")
    samples = []
    for index in range(321):
        x = low + (high - low) * index / 320
        try:
            value, *checks = evaluate(x)
            y = float(value)
            if abs(y) <= 1e12 and all(checks[:len(restrictions)]):
                samples.append((x, y, tuple(map(float, checks[len(restrictions):]))))
                continue
        except (ArithmeticError, NameError, TypeError, ValueError):
            pass
        samples.append(None)
    return samples


def _plot(formulas: list[str], title: str, x_low: float, x_high: float, y_low: float | None, y_high: float | None):
    if x_high - x_low < 1e-6:
        raise ValueError("Indica un intervallo orizzontale crescente.")
    if (y_low is None) != (y_high is None) or y_low is not None and y_high - y_low < 1e-6:
        raise ValueError("Indica entrambi gli estremi verticali in ordine crescente.")
    curves = [_sample(formula, x_low, x_high) for formula in formulas]
    values = sorted(sample[1] for curve in curves for sample in curve if sample is not None)
    if not values:
        raise ValueError("Non ci sono valori reali da disegnare nell'intervallo richiesto.")
    if y_low is None:
        trim = len(values) // 25
        low, high = values[trim], values[-1 - trim]
        padding = max((high - low) * 0.12, abs(high) * 0.015, 0.1)
        y_low, y_high = low - padding, high + padding

    # A curve that spans a tiny part of the common scale looks flat: say so under the legend.
    flat = []
    if len(curves) > 1:
        for formula, samples in zip(formulas, curves):
            own = sorted(sample[1] for sample in samples if sample is not None and y_low <= sample[1] <= y_high)
            if own and own[-1] - own[0] < 0.08 * (y_high - y_low):
                flat.append(school_formula(formula))
    notes = (
        [f"Scale molto diverse: y = {', y = '.join(flat)} appare quasi piatta. Disegnala da sola per vederla meglio."]
        if flat else []
    )
    height = 340 + (len(curves) - 1) * 18 + 18 * len(notes)
    left, top, right, bottom = 70, 52, WIDTH - 22, 258
    x_at = lambda value: left + (value - x_low) / (x_high - x_low) * (right - left)
    y_at = lambda value: bottom - (value - y_low) / (y_high - y_low) * (bottom - top)
    parts = [
        f'<defs><clipPath id="plot"><rect x="{left}" y="{top}" width="{right-left}" '
        f'height="{bottom-top}"/></clipPath></defs>',
        f'<rect x="{left}" y="{top}" width="{right-left}" height="{bottom-top}" '
        'fill="#1b2230" stroke="#47536a"/>',
    ]
    for tick in _ticks(x_low, x_high):
        x = x_at(tick)
        color = "#93a3bc" if tick == 0 else "#353f53"
        parts.append(f'<path d="M{x:g} {top}V{bottom}" stroke="{color}"/>')
        parts.append(f'<text x="{x:g}" y="{bottom + 19}" text-anchor="middle" fill="#becade" font-size="12">{tick:.4g}</text>')
    for tick in _ticks(y_low, y_high):
        y = y_at(tick)
        color = "#93a3bc" if tick == 0 else "#353f53"
        parts.append(f'<path d="M{left} {y:g}H{right}" stroke="{color}"/>')
        parts.append(f'<text x="{left - 8}" y="{y + 4:g}" text-anchor="end" fill="#becade" font-size="12">{tick:.4g}</text>')
    parts.append(f'<text x="{right}" y="{bottom + 35}" text-anchor="end" fill="#becade" font-size="12">x</text>')
    parts.append(f'<text x="{left - 8}" y="{top - 7}" text-anchor="end" fill="#becade" font-size="12">y</text>')

    for index, (formula, samples) in enumerate(zip(formulas, curves)):
        color = CURVES[index]
        previous = None
        commands = []
        for sample in samples:
            if sample is None:
                previous = None
                continue
            x, y, denominators = sample
            continuous = previous is not None and abs(y - previous[1]) < y_high - y_low and not any(
                (a < 0) != (b < 0) for a, b in zip(denominators, previous[2])
            )
            commands.append(f'{"L" if continuous else "M"}{x_at(x):.1f},{max(-800, min(1100, y_at(y))):.1f}')
            previous = sample
        if commands:
            parts.append(f'<path d="{"".join(commands)}" clip-path="url(#plot)" fill="none" stroke="{color}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>')
        label = escape(shorten(f"y = {school_formula(formula)}", width=63, placeholder="…"))
        label_y = 313 + 18 * index
        parts.append(f'<path d="M20 {label_y - 4}h15" stroke="{color}" stroke-width="3" stroke-linecap="round"/>')
        parts.append(f'<text x="43" y="{label_y}" fill="#e1e9f7" font-size="13">{label}</text>')
    for index, note in enumerate(notes):
        note_y = 313 + 18 * (len(curves) + index)
        parts.append(
            f'<text x="20" y="{note_y}" fill="#ffd37a" font-size="12">{escape(shorten(note, width=80, placeholder="…"))}</text>'
        )
    return _svg(title, height, parts), height


@tool(response_format="content_and_artifact")
def plot_function(
    expressions: Annotated[list[Annotated[str, Field(min_length=1, max_length=160)]], Field(max_length=3)],
    title: Annotated[str, Field(max_length=70)] = "Grafico",
    x_range: Annotated[PlotRange | None, Field(
        description="Estremi sinistro e destro in ordine crescente, ad esempio [-5, 5]. Se omesso usa [-6, 6].",
    )] = None,
    y_range: Annotated[PlotRange | None, Field(
        description="Estremi inferiore e superiore in ordine crescente. Omettili per una scala verticale automatica.",
    )] = None,
    clarification: Annotated[str, Field(max_length=500)] = "",
) -> tuple[str, dict]:
    """Disegna sulla lavagna da una a tre funzioni reali y=f(x), con assi e scala.

    Trascrivi solo il membro destro di ogni funzione in x, con prodotti espliciti.
    Per esempio passa ["x**2 - 4", "sin(x)"]. Gli intervalli non chiesti dall'utente vengono ignorati.
    Disegna solo funzioni y=f(x): per dati da confrontare usa draw_chart.
    Se la funzione manca o non è leggibile, passa expressions vuoto e chiedila in clarification.
    """
    if not expressions:
        return _answer(clarification.strip() or "Quale funzione vuoi disegnare?")
    formulas = [re.sub(r"^\s*(?:y|[a-z]\(\s*x\s*\))\s*=\s*", "", expression).strip() for expression in expressions]
    heading = title.strip() or "Grafico"
    x_min, x_max = x_range if x_range is not None else (-6, 6)
    y_min, y_max = y_range if y_range is not None else (None, None)
    try:
        svg, height = _plot(formulas, heading, x_min, x_max, y_min, y_max)
    except ValueError as error:
        # The parser addresses the model; the student only needs to know which part is unsupported.
        return _answer(str(error).replace(" Usa solo numeri, variabili dichiarate e funzioni matematiche supportate.", ""))
    except SyntaxError:
        return _answer("Non riesco a leggere la funzione. Controlla parentesi e operatori.")
    except (ArithmeticError, TypeError, NotImplementedError):
        return _answer("Non riesco a tracciare questa funzione. Controlla l'espressione e l'intervallo.")
    return _answer(heading, svg, height)


NODE_HEIGHT = 58
ROW_LIMIT = 4
# Lanes for arrows that skip rows or go back run between the cards and the frame.
SIDE_MARGIN = 54
LANE_OFFSETS = (24, 33, 42)
EDGE_COLOR = "#aebed7"


def _layers(ids: list[str], edges: list[DiagramEdge]) -> tuple[list[list[str]], set[tuple[str, str]]]:
    """Rows of the diagram and the arrows that close a cycle, which are drawn as returns."""
    children: dict[str, list[str]] = {identifier: [] for identifier in ids}
    for edge in edges:
        if edge.source != edge.target:
            children[edge.source].append(edge.target)
    state: dict[str, int] = {}
    back: set[tuple[str, str]] = set()

    def visit(node: str):
        state[node] = 1
        for child in children[node]:
            if state.get(child) == 1:
                back.add((node, child))
            elif child not in state:
                visit(child)
        state[node] = 2

    for identifier in ids:
        if identifier not in state:
            visit(identifier)
    level = dict.fromkeys(ids, 0)
    forward = [(edge.source, edge.target) for edge in edges if edge.source != edge.target and (edge.source, edge.target) not in back]
    for _ in ids:
        for source, target in forward:
            level[target] = max(level[target], level[source] + 1)
    rows = []
    for depth in sorted(set(level.values())):
        members = [identifier for identifier in ids if level[identifier] == depth]
        rows += [members[start:start + ROW_LIMIT] for start in range(0, len(members), ROW_LIMIT)]
    return rows, back


def _label_width(text: str) -> float:
    return 6.2 * len(text) + 6


def _diagram(nodes: list[DiagramNode], edges: list[DiagramEdge], title: str):
    ids = [node.id for node in nodes]
    if len(set(ids)) != len(ids):
        raise ValueError("Usa un identificatore diverso per ogni nodo.")
    for edge in edges:
        if edge.source not in ids or edge.target not in ids:
            raise ValueError("Ogni freccia deve collegare due nodi presenti nel diagramma.")
    rows, back = _layers(ids, edges)
    row_of = {identifier: index for index, row in enumerate(rows) for identifier in row}

    # Horizontal position and width of every card.
    boxes: dict[str, list[float]] = {}
    available = WIDTH - 2 * SIDE_MARGIN
    for row in rows:
        gap = 12
        width = min(136, (available - gap * (len(row) - 1)) / len(row))
        start = (WIDTH - width * len(row) - gap * (len(row) - 1)) / 2
        for column, identifier in enumerate(row):
            boxes[identifier] = [start + column * (width + gap), 0, width]

    # Each arrow leaves and enters its cards at its own port, and owns its horizontal tracks.
    routes = []
    lanes = {"left": 0, "right": 0}
    for index, edge in enumerate(edges):
        source_row, target_row = row_of[edge.source], row_of[edge.target]
        if edge.source == edge.target:
            routes.append({"edge": edge, "kind": "loop"})
            continue
        returning = (edge.source, edge.target) in back or target_row <= source_row
        if target_row == source_row + 1 and not returning:
            routes.append({"edge": edge, "kind": "next", "gaps": [source_row]})
            continue
        target_x = boxes[edge.target][0] + boxes[edge.target][2] / 2
        side = "right" if returning or target_x > WIDTH / 2 else "left"
        offset = LANE_OFFSETS[lanes[side] % len(LANE_OFFSETS)]
        lanes[side] += 1
        routes.append({
            "edge": edge, "kind": "back" if returning else "skip", "gaps": [source_row, target_row - 1],
            "lane": offset if side == "left" else WIDTH - offset,
        })

    def center(identifier: str) -> float:
        return boxes[identifier][0] + boxes[identifier][2] / 2

    outgoing: dict[str, list[dict]] = {identifier: [] for identifier in ids}
    incoming: dict[str, list[dict]] = {identifier: [] for identifier in ids}
    for route in routes:
        if route["kind"] != "loop":
            outgoing[route["edge"].source].append(route)
            incoming[route["edge"].target].append(route)
    for identifier in ids:
        def toward(route: dict, end: str) -> float:
            return route.get("lane", center(getattr(route["edge"], end)))
        for position, route in enumerate(sorted(outgoing[identifier], key=lambda route: toward(route, "target"))):
            x, _, width = boxes[identifier]
            route["start"] = x + width * (position + 1) / (len(outgoing[identifier]) + 1)
        for position, route in enumerate(sorted(incoming[identifier], key=lambda route: toward(route, "source"))):
            x, _, width = boxes[identifier]
            route["end"] = x + width * (position + 1) / (len(incoming[identifier]) + 1)

    # Gap g lies below row g; gap -1 lies between the title and the first row.
    tracks: dict[int, list[tuple[dict, int]]] = {}
    for route in routes:
        for step, gap in enumerate(dict.fromkeys(route.get("gaps", []))):
            tracks.setdefault(gap, []).append((route, step))

    def reach(item: tuple[dict, int]) -> float:
        route, step = item
        if route["kind"] == "next":
            return abs(route["end"] - route["start"])
        return abs(route["lane"] - (route["start"] if step == 0 else route["end"]))

    # Arrows that travel farther sideways take the upper tracks, so that they do not cross the
    # vertical segments of their neighbours.
    for items in tracks.values():
        items.sort(key=reach, reverse=True)
    spacing = {
        gap: 16 if any(route["edge"].label.strip() for route, _ in items) else 10 for gap, items in tracks.items()
    }

    def gap_height(gap: int) -> float:
        count = len(tracks.get(gap, []))
        if gap == -1 or gap >= len(rows) - 1:
            # Above the first row and below the last one only returning arrows need room.
            return spacing[gap] * (count + 1) if count else (6 if gap == -1 else 0)
        return max(36, spacing.get(gap, 10) * (count + 1))

    cursor = 46 + gap_height(-1)
    track_y: dict[tuple[int, int], float] = {}
    for row_index, row in enumerate([[], *rows]):
        gap = row_index - 1
        if row_index:
            for identifier in row:
                boxes[identifier][1] = cursor
            cursor += NODE_HEIGHT
            top = cursor
            cursor += gap_height(gap)
        else:
            top = 46
        for position, (route, step) in enumerate(tracks.get(gap, [])):
            route.setdefault("tracks", {})[gap] = top + spacing[gap] * (position + 1)
    height = math.ceil(cursor + 22)

    parts = [
        f'<defs><marker id="arrow" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto" '
        f'markerUnits="strokeWidth"><path d="M0 0L7 3.5L0 7Z" fill="{EDGE_COLOR}"/></marker></defs>'
    ]
    labels = []
    for route in routes:
        edge = route["edge"]
        text = escape(shorten(edge.label, width=24, placeholder="…")) if edge.label.strip() else ""
        x, y, width = boxes[edge.source]
        if route["kind"] == "loop":
            right, top = x + width, y + 16
            path = f"M{right:g} {top:g}h14v24h-12"
            if text:
                labels.append((right + 18, top + 16, "start", text))
            parts.append(f'<path d="{path}" fill="none" stroke="{EDGE_COLOR}" stroke-width="1.6" stroke-linejoin="round" marker-end="url(#arrow)"/>')
            continue
        bottom = y + NODE_HEIGHT
        target_top = boxes[edge.target][1]
        start, end = route["start"], route["end"]
        gaps = list(dict.fromkeys(route["gaps"]))
        first = route["tracks"][gaps[0]]
        if route["kind"] == "next":
            path = f"M{start:g} {bottom:g}V{first:g}H{end:g}V{target_top - 1:g}"
            segments = [(start, end, first)]
        else:
            last = route["tracks"][gaps[-1]]
            lane = route["lane"]
            path = f"M{start:g} {bottom:g}V{first:g}H{lane:g}V{last:g}H{end:g}V{target_top - 1:g}"
            segments = [(start, lane, first), (lane, end, last)]
        dash = ' stroke-dasharray="5 4"' if route["kind"] == "back" else ""
        parts.append(
            f'<path d="{path}" fill="none" stroke="{EDGE_COLOR}" stroke-width="1.6" stroke-linejoin="round"'
            f'{dash} marker-end="url(#arrow)"/>'
        )
        if text:
            # Above its own horizontal segment, or beside the last vertical one when that is too short.
            low, high, track = max(segments, key=lambda segment: abs(segment[1] - segment[0]))
            if abs(high - low) >= _label_width(edge.label) + 8:
                labels.append(((low + high) / 2, track - 4, "middle", text))
            else:
                labels.append((end + 5, (segments[-1][2] + target_top) / 2 + 4, "start", text))

    for node in nodes:
        x, y, width = boxes[node.id]
        fill, stroke = ("#34436a", "#9baafb") if row_of[node.id] == 0 else ("#2b3d50", "#6e97b9")
        parts.append(f'<rect x="{x:g}" y="{y:g}" width="{width:g}" height="{NODE_HEIGHT}" rx="11" fill="{fill}" stroke="{stroke}"/>')
        lines = wrap(node.label, max(9, int(width / 7.4)), max_lines=3, placeholder="…")
        first_line = y + NODE_HEIGHT / 2 + 5 - (len(lines) - 1) * 8
        for index, line in enumerate(lines):
            parts.append(f'<text x="{x + width / 2:g}" y="{first_line + 16 * index:g}" fill="#f1f4fa" text-anchor="middle" font-size="13">{escape(line)}</text>')
    for x, y, anchor, text in labels:
        parts.append(
            f'<text x="{x:g}" y="{y:g}" fill="#e1e9f7" stroke="#222936" stroke-width="3" paint-order="stroke" '
            f'font-size="11" text-anchor="{anchor}">{text}</text>'
        )
    return _svg(title, height, parts), height


@tool(response_format="content_and_artifact")
def draw_diagram(
    nodes: Annotated[list[DiagramNode], Field(max_length=8)],
    edges: Annotated[list[DiagramEdge], Field(max_length=12)],
    title: Annotated[str, Field(max_length=70)] = "Diagramma",
    clarification: Annotated[str, Field(max_length=500)] = "",
) -> tuple[str, dict]:
    """Crea sulla lavagna un diagramma di flusso o uno schema di concetti con frecce.

    Usa nodi con id distinti e testo breve. Per ogni freccia indica source, target e una label
    facoltativa. Se la richiesta o il ritaglio non bastano, passa nodes ed edges vuoti e chiedi un chiarimento.
    """
    if not nodes:
        return _answer(clarification.strip() or "Che cosa vuoi rappresentare nel diagramma?")
    heading = title.strip() or "Diagramma"
    try:
        svg, height = _diagram(nodes, edges, heading)
    except ValueError as error:
        return _answer(str(error))
    return _answer(heading, svg, height)


CHART_COLORS = ("#72dcf0", "#c5a7ff", "#ffad77", "#8fe3a8", "#f2d36b", "#f58fb0", "#7fb2ff", "#d7e36b")
ChartValue = Annotated[float, Field(ge=-1e9, le=1e9, allow_inf_nan=False)]


def _number(value: float) -> str:
    return f"{value:.4g}".replace(".", ",")


def _bar_chart(labels: list[str], values: list[float], title: str, unit: str) -> tuple[str, int]:
    height = 330
    left, top, right, bottom = 64, 58, WIDTH - 24, 250
    low, high = min(0.0, *values), max(0.0, *values)
    if high - low < 1e-12:
        high = low + 1
    ticks = _ticks(low, high)
    low, high = min(low, ticks[0]), max(high, ticks[-1])
    y_at = lambda value: bottom - (value - low) / (high - low) * (bottom - top)
    parts = [
        f'<rect x="{left}" y="{top}" width="{right - left}" height="{bottom - top}" fill="#1b2230" stroke="#47536a"/>',
    ]
    for tick in ticks:
        y = y_at(tick)
        parts.append(f'<path d="M{left} {y:.1f}H{right}" stroke="{"#93a3bc" if tick == 0 else "#353f53"}"/>')
        parts.append(f'<text x="{left - 8}" y="{y + 4:.1f}" text-anchor="end" fill="#becade" font-size="12">{_number(tick)}</text>')
    slot = (right - left) / len(values)
    bar = min(56, slot * 0.64)
    tilted = len(values) > 6 or any(len(label) > slot / 7 for label in labels)
    for index, (label, value) in enumerate(zip(labels, values)):
        x = left + slot * index + (slot - bar) / 2
        y0, y1 = sorted((y_at(0), y_at(value)))
        color = CHART_COLORS[index % len(CHART_COLORS)]
        parts.append(f'<rect x="{x:.1f}" y="{y0:.1f}" width="{bar:.1f}" height="{max(1, y1 - y0):.1f}" rx="3" fill="{color}"/>')
        value_y = y0 - 5 if value >= 0 else y1 + 14
        parts.append(f'<text x="{x + bar / 2:.1f}" y="{value_y:.1f}" text-anchor="middle" fill="#e1e9f7" font-size="12">{_number(value)}</text>')
        name = escape(shorten(label, width=14 if tilted else 18, placeholder="…"))
        center = x + bar / 2
        if tilted:
            parts.append(
                f'<text x="{center:.1f}" y="{bottom + 16}" text-anchor="end" fill="#becade" font-size="12" '
                f'transform="rotate(-35 {center:.1f} {bottom + 16})">{name}</text>'
            )
        else:
            parts.append(f'<text x="{center:.1f}" y="{bottom + 18}" text-anchor="middle" fill="#becade" font-size="12">{name}</text>')
    if unit:
        parts.append(f'<text x="{left - 8}" y="{top - 8}" text-anchor="end" fill="#becade" font-size="12">{escape(unit)}</text>')
    return _svg(title, height, parts), height


def _pie_chart(labels: list[str], values: list[float], title: str, unit: str) -> tuple[str, int]:
    if any(value < 0 for value in values) or sum(values) <= 0:
        raise ValueError("Un grafico a torta richiede valori positivi.")
    total = sum(values)
    height = max(300, 72 + 22 * len(values))
    cx, cy, radius = 150, 52 + (height - 52) / 2, 104
    parts = []
    angle = -math.pi / 2
    for index, (label, value) in enumerate(zip(labels, values)):
        share = value / total
        color = CHART_COLORS[index % len(CHART_COLORS)]
        if share >= 0.9999:
            parts.append(f'<circle cx="{cx}" cy="{cy:.1f}" r="{radius}" fill="{color}" stroke="#222936" stroke-width="2"/>')
        elif share > 0:
            end = angle + share * 2 * math.pi
            x0, y0 = cx + radius * math.cos(angle), cy + radius * math.sin(angle)
            x1, y1 = cx + radius * math.cos(end), cy + radius * math.sin(end)
            large = 1 if share > 0.5 else 0
            parts.append(
                f'<path d="M{cx} {cy:.1f}L{x0:.1f} {y0:.1f}A{radius} {radius} 0 {large} 1 {x1:.1f} {y1:.1f}Z" '
                f'fill="{color}" stroke="#222936" stroke-width="2"/>'
            )
            angle = end
        legend_y = 82 + 22 * index
        parts.append(f'<rect x="282" y="{legend_y - 10}" width="12" height="12" rx="2" fill="{color}"/>')
        amount = f"{_number(value)}{(' ' + unit) if unit else ''}"
        text = escape(shorten(f"{label}: {amount} ({_number(share * 100)}%)", width=30, placeholder="…"))
        parts.append(f'<text x="302" y="{legend_y}" fill="#e1e9f7" font-size="12">{text}</text>')
    return _svg(title, height, parts), height


@tool(response_format="content_and_artifact")
def draw_chart(
    kind: Literal["bar", "pie"],
    labels: Annotated[list[Label], Field(max_length=12)],
    values: Annotated[list[ChartValue], Field(max_length=12)],
    title: Annotated[str, Field(max_length=70)] = "Grafico",
    unit: Annotated[str, Field(max_length=12)] = "",
    clarification: Annotated[str, Field(max_length=500)] = "",
) -> tuple[str, dict]:
    """Disegna sulla lavagna un grafico a barre (kind=bar, anche per istogrammi e grafici a colonne)
    o a torta (kind=pie) con i dati forniti dall'utente o visibili nella selezione.

    Passa una categoria per elemento di labels e il valore corrispondente nella stessa posizione
    di values, per esempio labels ["gennaio", "febbraio"] e values [10, 25]. Se i dati mancano,
    passa liste vuote e chiedili in clarification.
    """
    if not labels or not values:
        return _answer(clarification.strip() or "Quali dati vuoi rappresentare? Indica le categorie e i valori.")
    if len(labels) != len(values):
        return _answer("Indica un valore per ogni categoria del grafico.")
    heading = title.strip() or "Grafico"
    try:
        svg, height = (_bar_chart if kind == "bar" else _pie_chart)(labels, values, heading, unit.strip())
    except ValueError as error:
        return _answer(str(error))
    return _answer(heading, svg, height)
