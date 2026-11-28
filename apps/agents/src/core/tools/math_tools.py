import ast
import json
import math
import queue
import re
import subprocess
import sys
import threading
from decimal import Decimal
from functools import reduce
from pathlib import Path
from typing import Annotated, Literal
from unicodedata import normalize

import sympy as sp
from pydantic import BaseModel, Field
from sympy.calculus.util import periodicity
from sympy.matrices.exceptions import MatrixError
from sympy.printing.str import StrPrinter


Expression = Annotated[str, Field(min_length=1, max_length=300)]
Variable = Annotated[str, Field(pattern=r"^[a-zA-Z][a-zA-Z0-9_]{0,15}$")]
CONSTANTS = {"pi": sp.pi, "E": sp.E, "e": sp.E, "I": sp.I, "oo": sp.oo}
FUNCTIONS = {
    "sqrt": sp.sqrt, "cbrt": sp.cbrt, "root": sp.root, "exp": sp.exp,
    "log": sp.log, "ln": sp.log, "log10": lambda value, evaluate=True: sp.log(value, 10, evaluate=evaluate),
    "sin": sp.sin, "sen": sp.sin, "cos": sp.cos, "tan": sp.tan, "tg": sp.tan,
    "cot": sp.cot, "cotg": sp.cot, "sec": sp.sec, "csc": sp.csc,
    "asin": sp.asin, "arcsin": sp.asin, "arcsen": sp.asin,
    "acos": sp.acos, "arccos": sp.acos,
    "atan": sp.atan, "arctan": sp.atan, "arctg": sp.atan,
    "sinh": sp.sinh, "cosh": sp.cosh, "tanh": sp.tanh,
    "abs": sp.Abs, "factorial": sp.factorial, "binomial": sp.binomial, "comb": sp.binomial,
    "perm": sp.ff, "gcd": sp.gcd, "lcm": sp.lcm,
    "floor": sp.floor, "ceil": sp.ceiling, "ceiling": sp.ceiling, "sign": sp.sign, "sgn": sp.sign,
}
ARITY = {
    "root": {2}, "log": {1, 2}, "ln": {1, 2}, "binomial": {2}, "comb": {2}, "perm": {2},
    "gcd": {2}, "lcm": {2},
}
# These need evaluated integer arguments and grow too fast to compute without a bound.
INTEGER_FUNCTIONS = {"factorial", "binomial", "comb", "perm", "gcd", "lcm"}
TRIGONOMETRIC = (sp.sin, sp.cos, sp.tan, sp.cot, sp.sec, sp.csc)
NUMBER = re.compile(r"(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?")
UNICODE = str.maketrans({
    "−": "-", "–": "-", "×": "*", "·": "*", "⋅": "*", "÷": "/", "π": "pi", "∞": "oo",
    "′": "'", "″": "''", "’": "'",
})
RELATION = re.compile(r"(<=|>=|=<|=>|==|!=|≤|≥|≠|<|>|=)")
RELATIONS = {
    "=": "==", "==": "==", "!=": "!=", "≠": "!=", "<": "<", ">": ">",
    "<=": "<=", "=<": "<=", "≤": "<=", ">=": ">=", "=>": ">=", "≥": ">=",
}
Relation = tuple[sp.Expr, str, sp.Expr]

MatrixOperation = Literal[
    "determinant", "inverse", "rank", "transpose", "rref", "charpoly", "eigenvalues", "eigenvectors",
    "nullspace", "multiply", "add", "power", "linear_system", "dot", "cross", "norm",
]
PAIR_MATRIX = {"linear_system", "dot", "cross"}
MANY_MATRIX = {"multiply", "add"}
SQUARE_MATRIX = {"determinant", "inverse", "charpoly", "eigenvalues", "eigenvectors", "power"}
STATISTICS = [
    ("count", "numero di dati"), ("sum", "somma"), ("mean", "media"), ("median", "mediana"),
    ("mode", "moda"), ("minimum", "minimo"), ("maximum", "massimo"), ("range", "campo di variazione"),
    ("variance", "varianza"), ("standard_deviation", "deviazione standard"),
    ("sample_variance", "varianza campionaria"),
    ("sample_standard_deviation", "deviazione standard campionaria"),
]


class MathRequest(BaseModel):
    operation: Literal[
        "evaluate", "solve", "factor", "expand", "domain", "limit", "derivative", "integral",
        "series", "sum", "gradient", "hessian", "extrema", "ode", "matrix", "statistics", "clarify",
    ] = Field(description=(
        "evaluate calcola o semplifica un'espressione. solve risolve equazioni, disequazioni e sistemi. "
        "factor scompone un polinomio o un intero in fattori primi. expand sviluppa i prodotti e le potenze. "
        "domain trova il dominio reale di una funzione. limit calcola limiti, anche in due variabili. "
        "derivative calcola derivate, anche parziali e miste. integral calcola integrali, anche multipli. "
        "series calcola lo sviluppo di Taylor. sum calcola sommatorie e studia la convergenza delle serie. "
        "gradient e hessian calcolano gradiente e matrice hessiana. extrema trova i punti critici e ne "
        "stabilisce la natura. ode risolve un'equazione differenziale ordinaria. matrix esegue su matrici "
        "e vettori il calcolo indicato in matrix_operation. statistics calcola gli indici statistici di "
        "una lista di dati. clarify chiede un dato mancante."
    ))
    expressions: list[Expression] = Field(default_factory=list, max_length=6, description=(
        "Trascrivi le formule in sintassi matematica con prodotti espliciti e il punto come "
        "separatore decimale, per esempio 2*x, x**2, sqrt(x), root(x, 3), exp(x), log(x), "
        "log(x, 2), sin(x), abs(x), factorial(n), comb(n, k), perm(n, k), pi oppure oo. Per solve "
        "passa un'equazione o una disequazione per elemento, per esempio x**2=2, (x-1)/(x+2)>0 "
        "oppure -1<2*x+1<=3. Le relazioni ammesse sono =, <, >, <=, >= e !=. Per matrix scrivi ogni "
        "matrice come lista di righe, per esempio [[1, 2], [3, 4]], e ogni vettore come lista, per "
        "esempio [1, 2, 3]. Per statistics passa i dati come lista e, se servono, le frequenze come "
        "seconda lista. Per ode scrivi le derivate con gli apici, per esempio y'' + y = 0. "
        "Per le altre operazioni passa una sola espressione."
    ))
    variables: list[Variable] = Field(default_factory=list, max_length=6, description=(
        "Indica tutte le variabili usate. Per solve sono le incognite in ordine. "
        "Per dominio, limite, derivata, integrale, serie e sommatoria passa prima la variabile "
        "dell'operazione. Per gradient, hessian, extrema e i limiti in due variabili passa le variabili "
        "in ordine. Per ode passa prima la variabile indipendente e poi la funzione incognita, per "
        "esempio ['x', 'y']. Per linear_system aggiungi le incognite ai parametri delle matrici; "
        "senza incognite si usano x1, x2, ..."
    ))
    point: Expression | None = Field(default=None, description=(
        "Punto di arrivo del limite, anche oo o -oo. Per un limite in due variabili scrivi le "
        "coordinate, per esempio (0, 0). Per series è il centro dello sviluppo, predefinito 0."
    ))
    direction: Literal["both", "left", "right"] = "both"
    order: int = Field(default=1, ge=1, le=10, description=(
        "Ordine della derivata. Per series è il grado massimo dello sviluppo, per esempio 3 per "
        "arrivare a x**3. Per matrix_operation=power è l'esponente."
    ))
    partials: list[Variable] = Field(default_factory=list, max_length=6, description=(
        "Per una derivata parziale, anche mista, le variabili di derivazione in ordine, per esempio "
        "['x', 'y'] per derivare prima rispetto a x e poi rispetto a y. Sostituisce order."
    ))
    lower: Expression | None = Field(default=None, description="Estremo inferiore dell'integrale definito o della sommatoria.")
    upper: Expression | None = Field(default=None, description="Estremo superiore dell'integrale definito o della sommatoria, anche oo.")
    bounds: list[Annotated[list[Expression], Field(min_length=2, max_length=2)]] = Field(
        default_factory=list, max_length=3, description=(
            "Per un integrale multiplo, gli estremi [inferiore, superiore] di ogni variabile, nello "
            "stesso ordine di variables e a partire dall'integrale più interno. Gli estremi interni "
            "possono dipendere dalle variabili esterne."
        ),
    )
    matrix_operation: MatrixOperation | None = Field(default=None, description=(
        "Calcolo da eseguire con operation=matrix: determinant, inverse, rank, transpose, rref "
        "(riduzione a scala), charpoly (polinomio caratteristico), eigenvalues, eigenvectors, "
        "nullspace (nucleo), multiply e add (due o più matrici in ordine), power, linear_system "
        "(matrice dei coefficienti e vettore dei termini noti), dot, cross e norm per i vettori."
    ))
    conditions: list[Expression] = Field(default_factory=list, max_length=6, description=(
        "Condizioni iniziali di un'equazione differenziale, per esempio y(0)=1 oppure y'(0)=0."
    ))
    domain: Literal["real", "complex"] = "real"
    initial_values: list[Expression] = Field(default_factory=list, max_length=6, description=(
        "Valori iniziali per cercare una soluzione numerica, nello stesso ordine delle incognite. "
        "Usali se forniti o se l'utente chiede una stima."
    ))
    clarification: Annotated[str, Field(max_length=500)] = ""


# Parsing ---------------------------------------------------------------------------------------


class RealRoot(sp.Function):
    """Real odd root of an expression with variables, such as the cube root of x.

    Sympy reads cbrt(x) as the principal root, which is complex for x < 0, so it misses
    x = -8 in cbrt(x) = -2. No single real form works everywhere: the solvers need
    sign(u)*|u|**(1/n) and calculus is cleanest with a Piecewise. The parser keeps this
    marker, _conditions reads the existence conditions from it, and each computation
    rewrites it with _lower.
    """

    nargs = 2


def _lower(expression: sp.Basic, form: str = "piecewise", at: dict | None = None) -> sp.Basic:
    if not expression.has(RealRoot):
        return expression

    def build(radicand: sp.Expr, index: sp.Expr) -> sp.Expr:
        exponent = sp.Rational(1, index)
        if form == "sign":
            return sp.sign(radicand) * sp.Abs(radicand) ** exponent
        if at is not None:
            # Near a point where the radicand has a sign, one branch is enough (e.g. for series).
            sign = radicand.subs(at, simultaneous=True)
            if sign.is_positive:
                return radicand ** exponent
            if sign.is_negative:
                return -((-radicand) ** exponent)
        return sp.Piecewise((-((-radicand) ** exponent), radicand < 0), (radicand ** exponent, True))

    return expression.replace(RealRoot, build)


def _decimal_commas(source: str) -> str:
    """Read 1,5 as 1.5 outside brackets, where a comma cannot separate arguments."""
    depth, characters = 0, list(source)
    for index, character in enumerate(characters):
        if character in "([{":
            depth += 1
        elif character in ")]}":
            depth -= 1
        elif (
            character == "," and depth == 0 and 0 < index < len(characters) - 1
            and characters[index - 1].isdigit() and characters[index + 1].isdigit()
        ):
            characters[index] = "."
    return "".join(characters)


def _factorials(source: str) -> str:
    """Rewrite n! and (n+1)! as factorial(...), leaving the != relation alone."""
    while match := re.search(r"!(?!=)", source):
        end = match.start()
        start = end
        if end and source[end - 1] == ")":
            depth, start = 0, end - 1
            while start >= 0:
                depth += {")": 1, "(": -1}.get(source[start], 0)
                if depth == 0:
                    break
                start -= 1
            if start < 0:
                return source
            while start and (source[start - 1].isalnum() or source[start - 1] == "_"):
                start -= 1
        else:
            while start and (source[start - 1].isalnum() or source[start - 1] in "_."):
                start -= 1
            if start == end:
                return source
        source = f"{source[:start]}factorial({source[start:end]}){source[end + 1:]}"
    return source


def _school_notation(source: str) -> str:
    """Accept the notation of a school notebook: |x|, 1,5, 20%, 5!, 2x and 3(x+1)."""
    source = re.sub(r"\|([^|]+)\|", r"abs(\1)", source)
    source = _decimal_commas(source)
    source = re.sub(r"(\d+(?:\.\d+)?)\s*%(?!\s*[\w(])", r"(\1/100)", source)
    source = _factorials(source)
    source = re.sub(r"(?<![\w.])(\d+(?:\.\d+)?)(?=[a-df-zA-DF-Z_(]|[eE](?![+-]?\d))", r"\1*", source)
    return re.sub(r"\)(?=[a-zA-Z_(\d])", ")*", source)


def _parse(source: str, max_nodes: int) -> tuple[str, ast.expr]:
    source = _school_notation(source.translate(UNICODE).strip().replace("^", "**"))
    tree = ast.parse(source, mode="eval")
    if sum(1 for _ in ast.walk(tree)) > max_nodes:
        raise ValueError("L'espressione è troppo lunga per il calcolatore.")
    return source, tree.body


def _converter(source: str, symbols: dict[str, sp.Basic], real: bool):
    """Build the formula exactly as written, without letting sympy simplify it.

    Every node is created unevaluated: sin(asin(x)) or exp(log(x)) would otherwise collapse
    to x, and -(x/x) to -1, before _conditions can read -1 <= x <= 1, x > 0 or x != 0.
    Computations use the evaluated form, obtained with doit().
    """

    def negative(value: sp.Expr) -> sp.Expr:
        return sp.Mul(sp.S.NegativeOne, value, evaluate=False)

    def convert(node: ast.AST) -> sp.Expr:
        if isinstance(node, ast.Constant):
            token = ast.get_source_segment(source, node) or ""
            if len(token) <= 32 and NUMBER.fullmatch(token) and abs(Decimal(token).adjusted()) <= 100:
                return sp.Rational(token)
        if isinstance(node, ast.Name):
            if node.id in symbols:
                return symbols[node.id]
            if node.id in CONSTANTS:
                return CONSTANTS[node.id]
        if isinstance(node, ast.UnaryOp) and isinstance(node.op, (ast.UAdd, ast.USub)):
            value = convert(node.operand)
            if isinstance(node.op, ast.UAdd):
                return value
            return -value if value.is_Number else negative(value)
        if isinstance(node, ast.BinOp):
            left, right = convert(node.left), convert(node.right)
            if isinstance(node.op, ast.Add):
                return sp.Add(left, right, evaluate=False)
            if isinstance(node.op, ast.Sub):
                return sp.Add(left, negative(right), evaluate=False)
            if isinstance(node.op, ast.Mult):
                return sp.Mul(left, right, evaluate=False)
            if isinstance(node.op, ast.Div):
                return sp.Mul(left, sp.Pow(right, -1, evaluate=False), evaluate=False)
            if isinstance(node.op, ast.Pow):
                exponent = right.doit()
                if exponent.is_Rational and abs(exponent) > 128:
                    raise ValueError("L'esponente è troppo grande per il calcolatore.")
                if left.is_number and exponent.is_Integer:
                    base = left.doit()
                    if base.is_Rational:
                        bits = max(int(part).bit_length() for part in base.as_numer_denom())
                        if bits * abs(int(exponent)) > 16_384:
                            raise ValueError("Il risultato della potenza è troppo grande per il calcolatore.")
                return sp.Pow(left, right, evaluate=False)
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and not node.keywords:
            name = node.func.id
            if name in FUNCTIONS and len(node.args) in ARITY.get(name, {1}):
                arguments = [convert(argument) for argument in node.args]
                if name in ("log", "ln") and len(arguments) == 2:
                    base = arguments[1].doit()
                    if base.is_number and (base == 1 or base.is_zero or (real and base.is_positive is False)):
                        raise ValueError("La base del logaritmo deve essere positiva e diversa da 1.")
                if name in INTEGER_FUNCTIONS:
                    arguments = [argument.doit() if argument.is_number else argument for argument in arguments]
                    if any(argument.is_Integer and abs(argument) > 1000 for argument in arguments):
                        raise ValueError("Il numero è troppo grande per il calcolatore.")
                if real and name in ("cbrt", "root"):
                    # In the reals an odd root of a negative number is negative, not the complex principal root.
                    radicand = arguments[0].doit()
                    index = sp.Integer(3) if name == "cbrt" else arguments[1].doit()
                    if index.is_Integer and index.is_odd:
                        # Check the radicand as written: -8*x/x evaluates to -8 but still needs x != 0.
                        if arguments[0].free_symbols:
                            return RealRoot(arguments[0], index)
                        if radicand.is_negative:
                            return sp.real_root(radicand, index)
                if name in ("gcd", "lcm"):
                    return FUNCTIONS[name](*arguments)
                return FUNCTIONS[name](*arguments, evaluate=False)
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id not in FUNCTIONS:
            raise ValueError(
                f"La funzione {node.func.id} non è supportata dal calcolatore. "
                "Usa solo numeri, variabili dichiarate e funzioni matematiche supportate."
            )
        if isinstance(node, ast.Name):
            raise ValueError(
                f"Il simbolo {node.id} non è una variabile dichiarata. "
                "Usa solo numeri, variabili dichiarate e funzioni matematiche supportate."
            )
        raise ValueError("Usa solo numeri, variabili dichiarate e funzioni matematiche supportate.")

    return convert


def _expression(source: str, symbols: dict[str, sp.Basic], real: bool = True, keep_roots: bool = False) -> sp.Expr:
    """Parse a formula; keep_roots returns it as written, for reading existence conditions."""
    source, body = _parse(source, 100)
    expression = _converter(source, symbols, real)(body)
    return expression if keep_roots else _lower(expression).doit()


def _matrix(source: str, symbols: dict[str, sp.Basic], real: bool, max_size: int = 8) -> sp.ImmutableMatrix:
    """Read [[1, 2], [3, 4]] as a matrix and [1, 2] as a column vector."""
    source, body = _parse(source, 1000)
    convert = _converter(source, symbols, real)
    if not isinstance(body, ast.List) or not body.elts:
        raise ValueError(
            "Scrivi la matrice come lista di righe, per esempio [[1, 2], [3, 4]], "
            "e il vettore come lista, per esempio [1, 2]."
        )
    nested = [isinstance(item, ast.List) for item in body.elts]
    if all(nested):
        rows = [[_lower(convert(item)).doit() for item in row.elts] for row in body.elts]
    elif not any(nested):
        rows = [[_lower(convert(item)).doit()] for item in body.elts]
    else:
        raise ValueError("Scrivi ogni riga della matrice come lista.")
    if not rows[0] or any(len(row) != len(rows[0]) for row in rows):
        raise ValueError("Tutte le righe della matrice devono avere la stessa lunghezza.")
    if len(rows) > max_size or len(rows[0]) > max_size:
        raise ValueError("La matrice è troppo grande per il calcolatore.")
    return sp.ImmutableMatrix(rows)


def _point(source: str) -> list[sp.Expr]:
    normalized, body = _parse(source, 100)
    parts = body.elts if isinstance(body, ast.Tuple) else [body]
    return [_expression(ast.get_source_segment(normalized, part) or "", {}).doit() for part in parts]


def _relations(source: str, symbols: dict[str, sp.Basic], real: bool) -> list[Relation]:
    """Split a (possibly chained) relation such as -1<2*x+1<=3 into simple relations.

    The sides keep their RealRoot markers: the caller lowers them for each use.
    """
    parts = RELATION.split(source)
    if len(parts) == 1:
        parts += ["=", "0"]
    if any(not part.strip() for part in parts[::2]):
        raise ValueError("Scrivi entrambi i membri di ogni equazione o disequazione.")
    terms = [_expression(part, symbols, real, keep_roots=True) for part in parts[::2]]
    return [(terms[index], RELATIONS[parts[2 * index + 1]], terms[index + 1]) for index in range(len(terms) - 1)]


# Results ---------------------------------------------------------------------------------------


class _ReadablePrinter(StrPrinter):
    """School notation for the results shown to the student: (0, +∞), ∅, ℝ \\ {0}, x^2."""

    def _print_Interval(self, interval):
        left = "(" if interval.left_open else "["
        right = ")" if interval.right_open else "]"
        return f"{left}{self._print(interval.start)}, {self._print(interval.end)}{right}"

    def _print_FiniteSet(self, value):
        return "{" + ", ".join(self._print(item) for item in value.args) + "}"

    def _print_EmptySet(self, value):
        return "∅"

    def _print_Reals(self, value):
        return "ℝ"

    def _print_Integers(self, value):
        return "ℤ"

    def _print_Naturals0(self, value):
        return "ℕ"

    def _print_Complexes(self, value):
        return "ℂ"

    def _print_Union(self, value):
        return " ∪ ".join(self._print(item) for item in value.args)

    def _print_Intersection(self, value):
        return " ∩ ".join(self._grouped(item) for item in value.args)

    def _print_Complement(self, value):
        return f"{self._grouped(value.args[0])} \\ {self._grouped(value.args[1])}"

    def _print_ImageSet(self, value):
        names = dict(zip(value.lamda.variables, ("k", "h", "j")))
        body = self._print(value.lamda.expr.xreplace({old: sp.Symbol(new) for old, new in names.items()}))
        sets = ", ".join(
            f"{names[variable]} ∈ {self._print(base)}" for variable, base in zip(value.lamda.variables, value.base_sets)
        )
        return f"{{{body} : {sets}}}"

    def _print_Abs(self, value):
        return f"|{self._print(value.args[0])}|"

    def _print_Pi(self, value):
        return "π"

    def _print_Infinity(self, value):
        return "+∞"

    def _print_NegativeInfinity(self, value):
        return "-∞"

    def _print_ComplexInfinity(self, value):
        return "∞"

    def _print_Exp1(self, value):
        return "e"

    def _print_ImaginaryUnit(self, value):
        return "i"

    def _grouped(self, value):
        text = self._print(value)
        return f"({text})" if isinstance(value, (sp.Union, sp.Intersection, sp.Complement)) else text


def _readable(value: sp.Basic) -> str:
    """The value in school notation, for messages and for the card when the model does not answer."""
    try:
        text = _ReadablePrinter().doprint(value)
    except (AttributeError, TypeError, ValueError):
        return str(value)
    return text.replace("**", "^").replace("*", "·")


def _numeric(value: sp.Basic) -> sp.Basic:
    if isinstance(value, sp.MatrixBase):
        return value.applyfunc(_numeric)
    if isinstance(value, sp.Expr):
        if not value.is_number or value.is_finite is False:
            return value
        real, imaginary = value.as_real_imag()
        return value if real.is_Rational and imaginary.is_Rational else value.evalf(15)
    return value.func(*(_numeric(argument) for argument in value.args)) if value.args else value


def _approximation(value: sp.Basic) -> str | None:
    if value.free_symbols or value.has(
        sp.ImageSet, sp.ConditionSet, sp.Lambda, sp.Order, sp.AccumBounds, sp.Sum, sp.Integral, sp.Limit,
    ):
        return None
    try:
        approximate = _numeric(value)
    except (ArithmeticError, NotImplementedError, TypeError, ValueError):
        return None
    return str(approximate) if approximate != value else None


def _result(request: MathRequest, value: sp.Basic, *, exact: bool = True, **details) -> dict:
    result = {
        "status": "ok",
        "operation": request.operation,
        "expressions": request.expressions,
        "variables": request.variables,
        "result": str(value),
        "latex": sp.latex(value),
        "exact": exact,
        **details,
    }
    if (display := _readable(value)) != result["result"]:
        result["display"] = display
    if exact and (approximation := _approximation(value)):
        result["approximation"] = approximation
    return result


def _entry(value: sp.Basic) -> dict:
    entry = {"value": str(value), "latex": sp.latex(value)}
    if approximation := _approximation(value):
        entry["approximation"] = approximation
    return entry


def _defined(value: sp.Basic) -> sp.Basic:
    if value.has(sp.zoo, sp.nan):
        raise ValueError("L'espressione non è definita.")
    return value


def _domain(request: MathRequest, parsed: sp.Basic, variable: sp.Symbol) -> dict:
    """Solve the existence conditions of a parsed expression, periodic ones included."""
    return _solve_system(request, [], _conditions(parsed, True), (variable,))


def _existence(request: MathRequest, parsed: sp.Basic) -> dict:
    """Report where a one-variable expression exists before simplification hides it."""
    if request.domain != "real" or len(parsed.free_symbols) != 1:
        return {}
    try:
        domain = _domain(request, parsed, next(iter(parsed.free_symbols)))
    except (ArithmeticError, NotImplementedError, TypeError, ValueError):
        return {}
    if domain["result"] == "Reals":
        return {}
    return {"existence_domain": domain["result"], "existence_domain_latex": domain["latex"]}


def _at(expression: sp.Expr, substitutions: dict[sp.Symbol, sp.Expr]) -> sp.Expr:
    """Evaluate at a point, or return nan if any part of the expression is undefined there.

    Substituting one variable at a time can hide a division by zero: 0*y/y**2 becomes 0
    before y is replaced, so every sub-expression is checked with all values at once.
    """
    for part in sp.preorder_traversal(expression):
        if isinstance(part, sp.Expr) and part.free_symbols:
            value = part.subs(substitutions, simultaneous=True)
            if value.has(sp.nan, sp.zoo) or value.is_finite is False:
                return sp.nan
    return sp.simplify(expression.subs(substitutions, simultaneous=True))


def _prime_factors(number: int) -> sp.Expr:
    if abs(number) < 2:
        return sp.Integer(number)
    factors = [
        sp.Pow(prime, power, evaluate=False) if power > 1 else sp.Integer(prime)
        for prime, power in sorted(sp.factorint(abs(number)).items())
    ]
    if number < 0:
        factors.insert(0, sp.Integer(-1))
    return sp.Mul(*factors, evaluate=False) if len(factors) > 1 else factors[0]


# Equations and inequalities --------------------------------------------------------------------


def _period(relation: Relation, variable: sp.Symbol) -> sp.Expr | None:
    left, _, right = relation
    try:
        period = periodicity(sp.Add(left, -right), variable)
    except (NotImplementedError, TypeError, ValueError):
        return None
    return period if period is not None and period.is_positive else None


def _common_period(periods: list[sp.Expr]) -> sp.Expr:
    ratios = [sp.simplify(period / periods[0]) for period in periods]
    if any(not ratio.is_Rational for ratio in ratios):
        raise ValueError("Le relazioni periodiche non hanno un periodo comune.")
    period = periods[0] * sp.Rational(math.lcm(*(ratio.p for ratio in ratios)), math.gcd(*(ratio.q for ratio in ratios)))
    if any(period / own > 12 for own in periods):
        raise ValueError("Il periodo comune è troppo lungo per il calcolatore.")
    return period


def _shift(solutions: sp.Set, offset: sp.Expr) -> sp.Set:
    if isinstance(solutions, sp.Interval):
        return sp.Interval(solutions.start + offset, solutions.end + offset, solutions.left_open, solutions.right_open)
    if isinstance(solutions, sp.FiniteSet):
        return sp.FiniteSet(*(item + offset for item in solutions))
    if isinstance(solutions, sp.Union):
        # With a symbolic offset such as 2*pi*k sympy cannot order the pieces, so keep them as they are.
        return sp.Union(*(_shift(part, offset) for part in solutions.args), evaluate=offset.is_number)
    point = sp.Dummy("t")
    return sp.imageset(sp.Lambda(point, point + offset), solutions)


def _apply(relation: Relation, variable: sp.Symbol, domain: sp.Set) -> sp.Set:
    left, operator, right = relation
    if operator == "==":
        return sp.solveset(sp.Add(left, -right, evaluate=False), variable, domain=domain)
    if operator == "!=":
        return domain - sp.solveset(sp.Add(left, -right, evaluate=False), variable, domain=domain)
    solutions = sp.solveset(sp.Rel(left, right, operator), variable, domain=domain)
    if solutions.has(sp.ConditionSet) and domain.is_subset(sp.S.Reals) and (left - right).has(sp.Abs):
        split = _split_absolute_values(relation, variable, domain)
        if split is not None:
            return split
    return solutions


def _split_absolute_values(relation: Relation, variable: sp.Symbol, domain: sp.Set) -> sp.Set | None:
    """Solve an inequality with |u| on the intervals where every u keeps its sign.

    Sympy leaves |x| >= x unsolved. Between two zeros or poles of u, |u| is u or -u, so
    each piece is an ordinary inequality: |x| >= x holds for x >= 0 and for x < 0.
    """
    left, operator, right = relation
    arguments = {part.args[0] for part in sp.preorder_traversal(left - right) if isinstance(part, sp.Abs)}
    points: set[sp.Expr] = set()
    for argument in arguments:
        if argument.free_symbols - {variable}:
            return None
        for factor in sp.together(argument).as_numer_denom():
            if not factor.has(variable):
                continue
            zeros = sp.solveset(factor, variable, sp.S.Reals)
            if not isinstance(zeros, sp.FiniteSet) or len(zeros) > 12:
                return None
            points |= set(zeros)
    try:
        cuts = sorted(points, key=lambda point: float(point))
    except TypeError:
        return None
    edges = [-sp.oo, *cuts, sp.oo]
    pieces: list[tuple[sp.Set, sp.Expr]] = [(sp.FiniteSet(point), point) for point in cuts]
    for low, high in zip(edges, edges[1:]):
        if low.is_finite and high.is_finite:
            sample = (low + high) / 2
        elif high.is_finite:
            sample = high - 1
        elif low.is_finite:
            sample = low + 1
        else:
            sample = sp.Integer(0)
        pieces.append((sp.Interval.open(low, high), sample))
    solutions = sp.S.EmptySet
    for piece, sample in pieces:
        signs = {}
        for argument in arguments:
            value = argument.subs(variable, sample)
            if value.is_finite:
                signs[sp.Abs(argument)] = argument if value >= 0 else -argument
        rewritten = sp.Rel(left.xreplace(signs), right.xreplace(signs), operator)
        part = sp.solveset(rewritten, variable, domain=piece & domain)
        if part.has(sp.ConditionSet):
            return None
        solutions |= part
    return solutions


def _conditions(expression: sp.Basic, real: bool) -> list[Relation]:
    """Existence conditions read from the parsed expression, before any simplification.

    After simplifying they are lost: cbrt(x)/cbrt(x) becomes 1 and forgets x != 0. The
    conditions keep their RealRoot markers, so sqrt(-cbrt(x)) needs -cbrt(x) >= 0 and still
    admits x = -64. In the complex numbers only the zeros of denominators and logarithms count.
    """
    zero = sp.Integer(0)
    found: list[Relation] = []
    for part in sp.preorder_traversal(expression):
        if not part.free_symbols:
            continue
        if isinstance(part, sp.Pow):
            base, exponent = part.base, part.exp.doit()
            if not base.free_symbols:
                if exponent.free_symbols and base.doit().is_zero:
                    found.append((exponent, ">", zero))  # 0**x exists only for x > 0
                continue
            if exponent.free_symbols:
                found.append((base, ">", zero))  # a variable exponent needs a positive base
            elif exponent.is_negative:
                found.append((base, "!=", zero))
            if real and exponent.is_Rational and not exponent.is_Integer:
                # Even roots, and powers with a fractional exponent, need a non-negative base.
                found.append((base, ">=" if exponent.is_positive else ">", zero))
        elif isinstance(part, RealRoot):
            if part.args[1].is_negative:
                found.append((part.args[0], "!=", zero))
        elif isinstance(part, sp.log):
            found.append((part.args[0], ">" if real else "!=", zero))
            if len(part.args) == 2 and part.args[1].free_symbols:
                # An unevaluated log(x, b) keeps its base: b > 0 and b != 1.
                found += [(part.args[1], ">" if real else "!=", zero), (part.args[1], "!=", sp.Integer(1))]
        elif real and isinstance(part, (sp.tan, sp.sec)):
            found.append((sp.cos(part.args[0]), "!=", zero))
        elif real and isinstance(part, (sp.cot, sp.csc)):
            found.append((sp.sin(part.args[0]), "!=", zero))
        elif real and isinstance(part, (sp.asin, sp.acos)):
            found += [(part.args[0], ">=", sp.Integer(-1)), (part.args[0], "<=", sp.Integer(1))]
    return list(dict.fromkeys(found))


def _signed(relations: list[Relation]) -> list[Relation]:
    """Evaluate the relations, with real odd roots as sign(u)*|u|**(1/n) for the solvers."""
    return [(_lower(left, "sign").doit(), operator, _lower(right, "sign").doit()) for left, operator, right in relations]


def _one_variable(system: list[Relation], variable: sp.Symbol, domain: sp.Set) -> sp.Set | None:
    """Exact solutions of a one-variable system, or None if a periodic inequality needs _solve_periodic."""
    if domain == sp.S.Reals and any(
        relation[1] not in ("==", "!=") and _period(relation, variable) for relation in system
    ):
        return None
    solutions = domain
    for relation in system:
        solutions &= _apply(relation, variable, domain)
    if isinstance(solutions, sp.FiniteSet):
        solutions = sp.FiniteSet(*(
            solution for solution in solutions if all(_holds(relation, {variable: solution}) for relation in system)
        ))
    return solutions


def _solve_periodic(request: MathRequest, system: list[Relation], variable: sp.Symbol) -> tuple[sp.Set | None, dict]:
    """Solve a one-variable system that contains a periodic inequality.

    Returns the solution set when it can be listed (empty, or inside a short interval) and
    None for an infinite family, together with the result for the agent.

    Sympy only returns the solutions of a periodic inequality in its first period [0, T),
    even when asked for another interval: sin(x) > 0 with x > 4 would come back empty.
    Each periodic relation is solved on [0, T) and repeated over a common period L. The
    other relations, existence conditions such as x > 0 for log(x) included, are solved on
    all the reals and select which repetitions S + k*L belong to the answer.
    """
    periodic, constraint = [], sp.S.Reals
    for relation in system:
        own = _period(relation, variable)
        if own:
            periodic.append((relation, own))
        else:
            constraint &= _apply(relation, variable, sp.S.Reals)
    period = _common_period([own for _, own in periodic])
    pattern = sp.Interval.Ropen(0, period)
    for relation, own in periodic:
        cell = _apply(relation, variable, sp.Interval.Ropen(0, own))
        pattern &= sp.Union(*(_shift(cell, index * own) for index in range(int(period / own))))
    if pattern.has(sp.ConditionSet) or constraint.has(sp.ConditionSet):
        raise ValueError("Il calcolatore non ha trovato una forma esatta per la disequazione.")
    if sp.S.EmptySet in (pattern, constraint):
        return sp.S.EmptySet, _result(request, sp.S.EmptySet, domain=request.domain)
    # The common period can be longer than needed: tan(x) >= 1 repeats every pi even though its
    # condition cos(x) != 0 has period 2*pi. Keep the shortest period that rebuilds the pattern.
    for parts in (6, 5, 4, 3, 2):
        shorter = period / parts
        piece = pattern & sp.Interval.Ropen(0, shorter)
        if sp.Union(*(_shift(piece, index * shorter) for index in range(parts))) == pattern:
            pattern, period = piece, shorter
            break

    def copy(index: int) -> sp.Set:
        return _shift(pattern, index * period)

    def repetitions(first: int, last: int) -> sp.Set:
        return sp.Union(*(copy(index) for index in range(first, last + 1))) & constraint

    try:
        low, high = constraint.inf, constraint.sup
    except (AttributeError, NotImplementedError, TypeError, ValueError):
        low, high = -sp.oo, sp.oo
    first = int(sp.floor(low / period)) if low.is_finite else None
    last = int(sp.floor(high / period)) if high.is_finite else None
    if first is not None and last is not None and last - first <= 12:
        # A bounded constraint only meets a few repetitions: list them all.
        listed = repetitions(first, last)
        return listed, _result(request, listed, domain=request.domain)

    name = next(name for name in ("k", "n", "j", "h") if name not in request.variables)
    k = sp.Symbol(name, integer=True)
    general = _shift(pattern, k * period)
    start = first if first is not None else last - 2 if last is not None else 0
    details = {
        "domain": request.domain, "period": str(period), "periodic_solution": str(pattern),
        "first_solutions": str(repetitions(start, start + 2)),
        "repetitions": "finite" if first is not None and last is not None else "infinite",
    }
    if constraint == sp.S.Reals or isinstance(constraint, sp.Interval):
        # The bounds can cut the first and last repetition: keep those parts apart and the
        # whole repetitions in the family.
        before, after = [], []
        if first is not None and (head := repetitions(first, first)) != copy(first):
            before += [head] if head != sp.S.EmptySet else []
            first += 1
        if last is not None and (tail := repetitions(last, last)) != copy(last):
            after += [tail] if tail != sp.S.EmptySet else []
            last -= 1
        if first is None and last is None:
            k_range, below, above = f"{name} intero", rf"{name} \in \mathbb{{Z}}", ""
        elif last is None:
            k_range, below, above = f"{name} >= {first}", rf"{name} \geq {first}", ""
        elif first is None:
            k_range, below, above = f"{name} <= {last}", rf"{name} \leq {last}", ""
        else:
            k_range, below, above = f"{first} <= {name} <= {last}", f"{name} = {first}", f"^{{{last}}}"
            if isinstance(pattern, sp.FiniteSet) and all(isinstance(part, sp.FiniteSet) for part in before + after):
                details["count"] = len(pattern) * (last - first + 1) + sum(len(part) for part in before + after)
        family = f"unione per {name} intero" + ("" if k_range == f"{name} intero" else f", {k_range},") + " di"
        text = " ∪ ".join([*map(str, before), f"{family} {general}", *map(str, after)])
        latex = r" \cup ".join([
            *map(sp.latex, before), rf"\bigcup_{{{below}}}{above} {sp.latex(general)}", *map(sp.latex, after),
        ])
        details["k_range"] = k_range
    else:
        text = f"(unione per {name} intero di {general}) ∩ {constraint}"
        bounds = rf"\left({sp.latex(constraint)}\right)" if isinstance(constraint, sp.Union) else sp.latex(constraint)
        latex = rf"\left(\bigcup_{{{name} \in \mathbb{{Z}}}} {sp.latex(general)}\right) \cap {bounds}"
        details["k_range"] = f"{name} intero, nel vincolo indicato"
    result = {**_result(request, pattern, **details), "result": text, "latex": latex}
    result.pop("approximation", None)
    return None, result


def _holds(relation: Relation, substitutions: dict[sp.Symbol, sp.Expr]) -> bool:
    left, operator, right = relation
    lhs = left.subs(substitutions, simultaneous=True).doit()
    rhs = right.subs(substitutions, simultaneous=True).doit()
    if lhs.is_finite is False or rhs.is_finite is False:
        return False
    if operator == "==":
        return sp.simplify(lhs - rhs).is_zero is not False
    return sp.Rel(sp.simplify(lhs), sp.simplify(rhs), operator) is not sp.false


def _solve(request: MathRequest, variables: tuple[sp.Symbol, ...], symbols: dict[str, sp.Symbol]) -> dict:
    if not variables:
        raise ValueError("Indica almeno un'incognita.")
    real = request.domain == "real"
    parsed = [relation for source in request.expressions for relation in _relations(source, symbols, real)]
    conditions = [condition for left, _, right in parsed for side in (left, right) for condition in _conditions(side, real)]
    result = _solve_system(request, parsed, conditions, variables)
    if len(variables) == len(parsed) == 1 and not any(
        left.free_symbols or right.free_symbols for left, _, right in conditions
    ):
        left, operator, right = parsed[0]
        if operator == "==":
            variable = variables[0]
            difference = sp.expand(_lower(left).doit() - _lower(right).doit())
            coefficient = difference.coeff(variable)
            constant = difference.subs(variable, 0)
            if coefficient.is_Rational and coefficient != 0 and difference == coefficient * variable + constant:
                result["linear_step"] = {
                    "term": str(coefficient * variable),
                    "value": str(-constant),
                    "coefficient": str(coefficient),
                }
    return result


Piece = tuple[sp.Set | None, str, str]


def _restrict(
    request: MathRequest, solutions: sp.FiniteSet, variables: tuple[sp.Symbol, ...], system: list[Relation],
    domain: sp.Set,
) -> tuple[list[Piece], list[dict]]:
    """Keep the solutions of a system in several unknowns that satisfy every relation.

    A solution such as (x, 1) leaves x free. Checking the conditions at that point proves
    nothing, so they become restrictions on the free unknown: x/x + y = y + 1 with y = 1
    gives (x, 1) with x != 0. In the reals the coordinates must also stay real: for
    x**2 + y**2 = -1, sqrt(-y**2 - 1) needs -y**2 - 1 >= 0, which no y satisfies.
    Each piece is the set when it has a finite form (None for a periodic family), its text
    and its LaTeX.
    """
    unknowns, pieces, parameters, kept = set(variables), [], [], []
    for solution in solutions:
        # nonlinsolve can return the same family twice, written in two different forms.
        if any(all(sp.simplify(one - other) == 0 for one, other in zip(solution, seen)) for seen in kept):
            continue
        if domain == sp.S.Reals and any(value.is_real is False for value in solution):
            continue
        substitutions = dict(zip(variables, solution))
        if not all(_holds(relation, substitutions) for relation in system):
            continue
        free = sorted(solution.free_symbols & unknowns, key=str)
        residuals = [
            (left.subs(substitutions, simultaneous=True), operator, right.subs(substitutions, simultaneous=True))
            for left, operator, right in system
        ]
        if domain == sp.S.Reals and free:
            real = {symbol: sp.Dummy(symbol.name, real=True) for symbol in free}
            if any(value.subs(real).is_real is False for value in solution):
                continue
            residuals += [condition for value in solution for condition in _conditions(value, True)]
        own: dict[sp.Symbol, list[Relation]] = {symbol: [] for symbol in free}
        for residual in residuals:
            involved = (residual[0].free_symbols | residual[2].free_symbols) & set(free)
            if len(involved) > 1:
                raise ValueError("Il calcolatore non riesce a imporre condizioni che legano più incognite libere.")
            if involved:
                own[next(iter(involved))].append(residual)
        ranges: dict[sp.Symbol, Piece] = {}
        for symbol, restrictions in own.items():
            allowed = _one_variable(restrictions, symbol, domain)
            if allowed is None:
                # A periodic condition such as sin(x) > 0 holds on every period, not only the first.
                allowed, description = _solve_periodic(request, restrictions, symbol)
                ranges[symbol] = (allowed, description["result"], description["latex"])
            else:
                ranges[symbol] = (allowed, str(allowed), sp.latex(allowed))
        if any(allowed == sp.S.EmptySet for allowed, _, _ in ranges.values()):
            continue
        kept.append(solution)
        point = sp.FiniteSet(solution)
        if all(allowed == domain for allowed, _, _ in ranges.values()):
            pieces.append((point, str(point), sp.latex(point)))
            continue
        if all(allowed is not None for allowed, _, _ in ranges.values()):
            base = ranges[free[0]][0] if len(free) == 1 else sp.ProductSet(*(ranges[symbol][0] for symbol in free))
            family = sp.ImageSet(sp.Lambda(free[0] if len(free) == 1 else tuple(free), solution), base)
            pieces.append((family, str(family), sp.latex(family)))
        else:
            bounded = [(symbol, piece) for symbol, piece in ranges.items() if piece[0] != domain]
            text = f"{point} con " + ", ".join(f"{symbol} in {piece[1]}" for symbol, piece in bounded)
            members = ", ".join(rf"{sp.latex(symbol)} \in {piece[2]}" for symbol, piece in bounded)
            pieces.append((None, text, rf"\left\{{{sp.latex(solution)} \;\middle|\; {members}\right\}}"))
        parameters.append({"solution": str(solution), "ranges": {str(symbol): piece[1] for symbol, piece in ranges.items()}})
    return pieces, parameters


def _solve_system(
    request: MathRequest, parsed: list[Relation], conditions: list[Relation], variables: tuple[sp.Symbol, ...],
) -> dict:
    """Solve the relations together with their existence conditions.

    The conditions are relations of the system like the others, so they restrict the final
    set of solutions, periodic repetitions included.
    """
    real = request.domain == "real"
    relations, conditions = _signed(parsed), _signed(conditions)
    system = list(dict.fromkeys(relations + conditions))
    equations = [sp.Add(left, -right, evaluate=False) for left, operator, right in relations if operator == "=="]
    if request.domain == "complex" and any(operator not in ("==", "!=") for _, operator, _ in relations):
        raise ValueError("Le disequazioni si risolvono nei numeri reali.")
    domain = sp.S.Reals if real else sp.S.Complexes

    if len(variables) == 1:
        solutions = _one_variable(system, variables[0], domain)
        if solutions is None:
            return _solve_periodic(request, system, variables[0])[1]
    else:
        if len(equations) != len(relations):
            raise ValueError("Le disequazioni e le condizioni con != sono supportate con una sola incognita.")
        solutions = sp.nonlinsolve(equations, variables)
        if isinstance(solutions, sp.FiniteSet):
            pieces, parameters = _restrict(request, solutions, variables, system, domain)
            sets = [piece for piece, _, _ in pieces]
            details = {"domain": request.domain, **({"parameter_conditions": parameters} if parameters else {})}
            if all(piece is not None for piece in sets):
                return _result(request, sp.Union(*sets), **details)
            result = {
                **_result(request, sp.Union(*(piece for piece in sets if piece is not None)), **details),
                "result": " ∪ ".join(text for _, text, _ in pieces),
                "latex": r" \cup ".join(latex for _, _, latex in pieces),
            }
            result.pop("approximation", None)
            return result
        solutions &= sp.ProductSet(*([domain] * len(variables)))

    if not solutions.has(sp.ConditionSet):
        return _result(request, solutions, domain=request.domain)
    if not relations:
        raise ValueError("Il calcolatore non ha determinato il dominio in forma esatta.")
    if len(equations) != len(relations):
        raise ValueError("Il calcolatore non ha trovato una forma esatta per la disequazione.")
    if len(request.initial_values) != len(variables):
        raise ValueError("Il calcolatore non ha trovato una forma esatta. Indica un valore iniziale per ogni incognita per cercare una soluzione numerica.")

    guesses = [_expression(guess, {}).doit() for guess in request.initial_values]
    # nsolve checks the residual and finds a local root from the chosen initial values.
    if len(variables) == len(equations) == 1:
        value = sp.nsolve(equations[0], variables[0], guesses[0], prec=20)
    else:
        value = sp.Tuple(*sp.nsolve(equations, variables, guesses, prec=20))
    if request.domain == "real" and any(item.is_real is not True for item in sp.flatten([value])):
        raise ValueError("Il calcolatore non ha trovato una soluzione reale dai valori iniziali indicati.")
    substitutions = dict(zip(variables, sp.flatten([value])))
    if not all(_holds(condition, substitutions) for condition in conditions):
        raise ValueError("La soluzione numerica trovata non rispetta le condizioni di esistenza.")
    return _result(request, value, exact=False, domain=request.domain, coverage="una soluzione locale")


# Calculus --------------------------------------------------------------------------------------


def _domain_between(
    request: MathRequest, parsed: sp.Basic, variable: sp.Symbol, low: sp.Expr, high: sp.Expr,
    skip_points: bool = False,
) -> sp.Set | None:
    """Where the formula as written exists inside (low, high), or None if that is unknown.

    Calculus runs on the evaluated formula, which can exist where the original does not:
    exp(log(x)) evaluates to x, defined for every x, while log(x) needs x > 0.
    With skip_points the conditions u != 0, which only remove isolated points, are left out.
    """
    if request.domain != "real" or parsed.free_symbols - {variable}:
        return None
    window = [(variable, ">", low)] if low.is_finite else []
    window += [(variable, "<", high)] if high.is_finite else []
    conditions = [condition for condition in _conditions(parsed, True) if not (skip_points and condition[1] == "!=")]
    system = _signed(conditions) + window
    try:
        inside = _one_variable(system, variable, sp.S.Reals)
        if inside is None:
            inside = _solve_periodic(request, system, variable)[0]
    except (ArithmeticError, NotImplementedError, TypeError, ValueError):
        return None
    return None if inside is None or inside.has(sp.ConditionSet) else inside


def _sides(request: MathRequest, parsed: sp.Basic, variable: sp.Symbol, point: sp.Expr) -> tuple[bool, bool] | None:
    """Whether the formula exists arbitrarily close to a finite point, on its left and on its right."""
    inside = _domain_between(request, parsed, variable, point - 1, point + 1)
    if inside is None:
        return None
    try:
        left = (inside & sp.Interval.open(point - 1, point)).closure.contains(point)
        right = (inside & sp.Interval.open(point, point + 1)).closure.contains(point)
        return bool(left), bool(right)
    except (NotImplementedError, TypeError, ValueError):
        return None


def _limit(request: MathRequest, expression: sp.Expr, variables: tuple[sp.Symbol, ...], parsed: sp.Basic) -> dict:
    if request.point is None:
        raise ValueError("Indica a quale valore tende la variabile.")
    coordinates = _point(request.point)
    if len(coordinates) > 1:
        return _plane_limit(request, expression, variables, coordinates)
    variable, point = variables[0], coordinates[0]
    direction, details = request.direction, {}
    if point.is_finite:
        sides = _sides(request, parsed, variable, point)
        if sides is not None:
            left_side, right_side = sides
            if not {"both": left_side or right_side, "left": left_side, "right": right_side}[direction]:
                raise ValueError(f"La funzione non è definita vicino a {variable} = {point}, quindi il limite non esiste.")
            if direction == "both" and left_side != right_side:
                # Defined on one side only: the limit is the one-sided limit on that side.
                direction = "right" if right_side else "left"
                side, limit = ("destra", "destro") if right_side else ("sinistra", "sinistro")
                details["note"] = f"la funzione è definita solo a {side} di {point}: il limite coincide con il limite {limit}"
    elif (inside := _domain_between(request, parsed, variable, -sp.oo, sp.oo)) is not None:
        try:
            reaches = inside.sup == sp.oo if point == sp.oo else inside.inf == -sp.oo
        except (NotImplementedError, TypeError, ValueError):
            reaches = True
        if not reaches:
            raise ValueError(f"La funzione non è definita per {variable} vicino a {point}, quindi il limite non esiste.")
    if direction == "both" and point not in (sp.oo, -sp.oo):
        left = sp.limit(expression, variable, point, dir="-")
        right = sp.limit(expression, variable, point, dir="+")
        if any(side.has(sp.Limit, sp.nan) for side in (left, right)):
            raise ValueError("Il calcolatore non ha determinato entrambi i limiti laterali.")
        if left != right and not (left.has(sp.AccumBounds) or right.has(sp.AccumBounds)):
            return {
                **_result(request, sp.Tuple(left, right), point=str(point)),
                "result": "Il limite bilatero non esiste. I limiti laterali sono diversi.",
                "left": str(left), "right": str(right),
            }
        value = right if right.has(sp.AccumBounds) else left
    else:
        value = sp.limit(expression, variable, point, dir="-" if direction == "left" else "+")
    if value.has(sp.Limit) or value is sp.nan:
        raise ValueError("Il calcolatore non ha determinato il limite.")
    if value.has(sp.AccumBounds):
        return {
            **_result(request, value, point=str(point), direction=direction, **details),
            "result": "Il limite non esiste. La funzione oscilla.",
        }
    return _result(request, value, point=str(point), direction=direction, **details)


def _plane_limit(
    request: MathRequest, expression: sp.Expr, variables: tuple[sp.Symbol, ...], coordinates: list[sp.Expr],
) -> dict:
    if len(coordinates) != 2 or len(variables) < 2:
        raise ValueError("Il limite in più variabili è supportato con due variabili e un punto (a, b).")
    (x, y), (a, b) = variables[:2], coordinates
    if any(coordinate.is_finite is not True for coordinate in coordinates):
        raise ValueError("Il limite in due variabili si calcola verso un punto finito.")
    point = str(sp.Tuple(a, b))
    direct = _at(expression, {x: a, y: b})
    if direct.is_finite and not direct.has(sp.nan, sp.zoo) and (request.domain != "real" or direct.is_real):
        # Elementary functions are continuous where they are defined.
        return _result(request, direct, point=point, method="continuità")

    slope, radius, angle = sp.Dummy("m", real=True), sp.Dummy("r", positive=True), sp.Dummy("t", real=True)
    taken = set(request.variables)
    shown = {
        slope: sp.Symbol(next(name for name in ("m", "k", "mu", "slope") if name not in taken)),
        angle: sp.Symbol(next(name for name in ("theta", "phi", "alpha", "angle") if name not in taken)),
    }
    line, parabola, other = b + slope * (x - a), b + (x - a) ** 2, a + (y - b) ** 2
    paths = [
        (f"rette {y} = {line.subs(shown)}", expression.subs(y, line), x, a),
        (f"retta {x} = {a}", expression.subs(x, a), y, b),
        (f"parabola {y} = {parabola}", expression.subs(y, parabola), x, a),
        (f"parabola {x} = {other}", expression.subs(x, other), y, b),
        (
            f"coordinate polari con angolo {shown[angle]}",
            expression.subs({x: a + radius * sp.cos(angle), y: b + radius * sp.sin(angle)}, simultaneous=True),
            radius, sp.Integer(0),
        ),
    ]
    values: dict[str, sp.Expr] = {}
    missing = None
    for name, restricted, variable, target in paths:
        try:
            value = sp.limit(sp.simplify(restricted), variable, target, dir="+" if variable is radius else "+-")
        except ValueError:
            missing = name  # the one-sided limits along this path differ
            break
        except (NotImplementedError, TypeError, ArithmeticError):
            continue
        if value.has(sp.Limit, sp.nan):
            continue
        if value.has(sp.AccumBounds, sp.zoo):
            missing = name
            break
        values[name] = sp.simplify(value)

    paths_found = {name: str(value.subs(shown)) for name, value in values.items()}
    if missing or len(set(values.values())) > 1 or any(value.has(slope, angle) for value in values.values()):
        reason = (
            f"lungo {missing} il limite non esiste" if missing
            else "lungo percorsi diversi si ottengono valori diversi"
        )
        return {
            **_result(request, sp.Tuple(*values.values()).subs(shown), point=point, paths=paths_found),
            "result": f"Il limite non esiste: {reason}.",
        }
    if not values:
        raise ValueError("Il calcolatore non ha determinato il limite.")
    return _result(
        request, next(iter(values.values())), point=point, paths=paths_found,
        coverage=(
            "stesso valore lungo rette, parabole e in coordinate polari: è il valore del limite se esiste; "
            "per dimostrarlo serve una maggiorazione indipendente dall'angolo"
        ),
    )


def _derivative(
    request: MathRequest, expression: sp.Expr, variable: sp.Symbol, symbols: dict[str, sp.Symbol], existence: dict,
) -> dict:
    # The derivative is only meaningful where the original formula exists.
    details = dict(existence)
    if expression.has(sp.Abs, sp.sign):
        details["note"] = (
            "dove l'argomento del valore assoluto si annulla la funzione può non essere derivabile: "
            "la formula vale negli altri punti"
        )
    if not request.partials:
        value = _tidy_signs(sp.diff(expression, variable, request.order))
        return _result(request, value, order=request.order, **details)
    if any(name not in symbols for name in request.partials):
        raise ValueError("Indica in variables tutte le variabili di derivazione.")
    value = _tidy_signs(sp.diff(expression, *(symbols[name] for name in request.partials)))
    return _result(request, value, partials=request.partials, **details)


def _tidy_signs(value: sp.Expr) -> sp.Expr:
    """Write the derivatives of |u| as a student would: x*sign(x) + |x| is 2|x|, sign(x)/|x| is 1/x."""
    if not value.has(sp.sign):
        return value
    try:
        tidy = sp.simplify(value.replace(sp.sign, lambda argument: sp.Abs(argument) / argument))
    except (ArithmeticError, NotImplementedError, TypeError, ValueError):
        return value
    if tidy.has(sp.Piecewise):
        return value

    def as_sign(product: sp.Expr) -> sp.Expr:
        factors = list(product.args)
        for factor in list(factors):
            inverse = sp.Pow(factor.args[0], -1) if isinstance(factor, sp.Abs) else None
            if inverse is not None and factor in factors and inverse in factors:
                factors.remove(factor)
                factors.remove(inverse)
                factors.append(sp.sign(factor.args[0]))
        return sp.Mul(*factors)

    return tidy.replace(lambda part: part.is_Mul and any(isinstance(item, sp.Abs) for item in part.args), as_sign)


def _integral(
    request: MathRequest, expression: sp.Expr, variables: tuple[sp.Symbol, ...], symbols: dict[str, sp.Symbol],
    parsed: sp.Basic, existence: dict,
) -> dict:
    real = request.domain == "real"
    if request.bounds:
        if len(request.bounds) > len(variables):
            raise ValueError("Indica in variables una variabile d'integrazione per ogni coppia di estremi.")
        limits = [
            (variable, *(_expression(bound, symbols, real).doit() for bound in pair))
            for variable, pair in zip(variables, request.bounds)
        ]
    else:
        if (request.lower is None) != (request.upper is None):
            raise ValueError("Indica entrambi gli estremi dell'integrale definito.")
        limits = [variables[0]] if request.lower is None else [(
            variables[0],
            _expression(request.lower, symbols, real).doit(),
            _expression(request.upper, symbols, real).doit(),
        )]
    definite = all(isinstance(limit, tuple) for limit in limits)
    if definite and len(limits) == 1 and all(bound.is_extended_real for bound in limits[0][1:]):
        # The integrand must exist on the whole interval, apart from isolated points.
        variable, start, end = limits[0]
        low, high = (start, end) if bool(start <= end) else (end, start)
        inside = _domain_between(request, parsed, variable, low, high, skip_points=True)
        if inside is not None:
            missing = sp.Interval.open(low, high) - inside
            if missing != sp.S.EmptySet and not isinstance(missing, sp.FiniteSet):
                raise ValueError(
                    "La funzione non è definita su tutto l'intervallo di integrazione: "
                    f"non esiste per {variable} in {_readable(missing)}."
                )
            singular = set(missing) | _excluded_points(parsed, variable, low, high)
            if singular and (improper := _improper_integral(request, expression, variable, singular, start, end)):
                return improper
    value = sp.integrate(expression, *limits)
    if definite and len(limits) == 1 and value in (sp.oo, -sp.oo):
        text = f"L'integrale diverge a {_readable(value)}."
        return {
            **_result(request, value, bounds=[str(limits[0][1]), str(limits[0][2])], convergent=False),
            "result": text, "display": text,
        }
    exact = not value.has(sp.Integral)
    if not exact and definite:
        value = value.evalf(15)
    if value.has(sp.Integral) or value is sp.nan:
        raise ValueError("Il calcolatore non ha trovato un risultato per l'integrale.")
    bounds = [[str(limit[1]), str(limit[2])] for limit in limits] if definite else None
    return _result(
        request, value, exact=exact, bounds=bounds[0] if bounds and len(bounds) == 1 else bounds,
        **({} if definite else existence),
    )


def _excluded_points(parsed: sp.Basic, variable: sp.Symbol, low: sp.Expr, high: sp.Expr) -> set[sp.Expr]:
    """Isolated points of (low, high) where the formula as written is undefined, such as x = 0 for 1/x."""
    points: set[sp.Expr] = set()
    for left, operator, right in _signed(_conditions(parsed, True)):
        if operator != "!=":
            continue
        try:
            zeros = sp.solveset(left - right, variable, sp.Interval.open(low, high))
        except (NotImplementedError, TypeError, ValueError):
            continue
        if isinstance(zeros, sp.FiniteSet) and len(zeros) <= 20:
            points |= set(zeros)
    return points


def _improper_integral(
    request: MathRequest, expression: sp.Expr, variable: sp.Symbol, singular: set[sp.Expr],
    start: sp.Expr, end: sp.Expr,
) -> dict | None:
    """Integrate across the points where the integrand is undefined, one piece at a time.

    Returns None when sympy cannot decide a piece, so the caller tries the whole interval.
    """
    try:
        cuts = sorted(singular, key=lambda point: float(point))
    except TypeError:
        return None
    low, high = (start, end) if bool(start <= end) else (end, start)
    orientation = 1 if bool(start <= end) else -1
    pieces = []
    for left, right in zip([low, *cuts], [*cuts, high]):
        piece = sp.integrate(expression, (variable, left, right))
        if piece.has(sp.Integral):
            return None
        pieces.append(piece)
    points = ", ".join(f"{variable} = {_readable(point)}" for point in cuts)
    details = {"bounds": [str(start), str(end)], "singular_points": [str(point) for point in cuts]}
    if not any(piece.has(sp.oo, -sp.oo, sp.zoo, sp.nan) or piece.is_finite is False for piece in pieces):
        return _result(request, sp.simplify(orientation * sp.Add(*pieces)), **details)
    text = f"La funzione non è definita in {points}, dove non è limitata: l'integrale improprio diverge."
    principal = _principal_value(expression, variable, low, high, cuts)
    if principal is not None:
        principal = orientation * principal
        text += f" Esiste invece il valore principale di Cauchy, uguale a {_readable(principal)}."
        details["principal_value"] = str(principal)
    return {**_result(request, sp.nan, convergent=False, **details), "result": text, "display": text}


def _principal_value(
    expression: sp.Expr, variable: sp.Symbol, low: sp.Expr, high: sp.Expr, cuts: list[sp.Expr],
) -> sp.Expr | None:
    """Cauchy principal value from an antiderivative, cutting the same distance on both sides of each point.

    Sympy's principal_value can run for minutes on tan(x). An antiderivative written with
    log|u| is valid on every piece, so the symmetric limits are short computations.
    """
    try:
        antiderivative = sp.integrate(expression, variable)
        if antiderivative.has(sp.Integral):
            return None
        antiderivative = antiderivative.replace(sp.log, lambda argument: sp.log(sp.Abs(argument)))
        gap = sp.Dummy("epsilon", positive=True)
        value = (
            sp.limit(antiderivative, variable, high, dir="-")
            - sp.limit(antiderivative, variable, low, dir="+")
        )
        for point in cuts:
            jump = antiderivative.subs(variable, point - gap) - antiderivative.subs(variable, point + gap)
            value += sp.limit(sp.simplify(jump), gap, 0, dir="+")
        value = sp.simplify(value)
    except (ArithmeticError, NotImplementedError, TypeError, ValueError):
        return None
    return value if value.is_real and value.is_finite else None


def _sum(request: MathRequest, expression: sp.Expr, index: sp.Symbol, symbols: dict[str, sp.Symbol]) -> dict:
    if request.lower is None or request.upper is None:
        raise ValueError("Indica gli estremi della sommatoria.")
    real = request.domain == "real"
    lower = _expression(request.lower, symbols, real).doit()
    upper = _expression(request.upper, symbols, real).doit()
    if lower.is_Integer:
        # A term such as 1/n with n = 0 makes the whole sum meaningless.
        last = int(lower) + 50
        if upper.is_Integer:
            last = min(last, int(upper))
        for value in range(int(lower), last + 1):
            term = expression.subs(index, value)
            if term.has(sp.zoo, sp.nan) or term.is_finite is False:
                raise ValueError(f"Il termine con {index} = {value} non è definito.")
    limits = (index, lower, upper)
    summation = sp.Sum(expression, limits)
    total = sp.summation(expression, limits)
    if total.has(sp.zoo, sp.nan):
        raise ValueError("La somma non è definita per gli estremi indicati.")
    details = {"bounds": [str(lower), str(upper)]}
    infinite = sp.oo in (upper, -lower)
    if infinite:
        if total in (sp.oo, -sp.oo):
            convergent = False
        elif total.is_number and total.is_finite and not total.has(sp.Sum, sp.AccumBounds):
            # A finite closed form already proves convergence; is_convergent can take seconds.
            convergent = True
        elif (convergent := _ratio_test(expression, index)) is None:
            try:
                convergent = summation.is_convergent()
            except (NotImplementedError, TypeError, ValueError, ArithmeticError):
                convergent = None
            convergent = bool(convergent) if isinstance(convergent, sp.logic.boolalg.BooleanAtom) else None
        details["convergent"] = convergent
        if convergent is False:
            text = f"La serie diverge a {_readable(total)}." if total in (sp.oo, -sp.oo) else "La serie non converge."
            return {**_result(request, total, **details), "result": text, "display": text}
    if total.has(sp.Sum):
        if infinite and details["convergent"]:
            approximation = _numeric_series(expression, index, lower, upper)
            if approximation is not None:
                return _result(request, approximation, exact=False, coverage="valore numerico della serie", **details)
            # Sympy's evalf can run for tens of seconds here and still miss digits.
            text = "La serie converge, ma il calcolatore non ne ha trovato la somma."
            return {**_result(request, summation, **details), "result": text, "display": text}
        if not infinite:
            approximation = summation.evalf(15)
            if approximation.is_number and approximation.is_finite:
                return _result(request, approximation, exact=False, **details)
        raise ValueError("Il calcolatore non ha trovato la somma.")
    if total.free_symbols and total.is_rational_function(*total.free_symbols):
        total = sp.factor(total)
    return _result(request, total, **details)


def _ratio_test(expression: sp.Expr, index: sp.Symbol) -> bool | None:
    """Ratio test: a quick answer for series such as 2**n/n! or n!/n**n, None when it is inconclusive."""
    try:
        ratio = sp.combsimp(sp.simplify(expression.subs(index, index + 1) / expression))
        limit = sp.limit(sp.Abs(ratio), index, sp.oo)
    except (ArithmeticError, NotImplementedError, TypeError, ValueError):
        return None
    if not limit.is_number or limit.has(sp.AccumBounds) or limit is sp.nan:
        return None
    if limit.is_extended_real and limit < 1:
        return True
    if limit.is_extended_real and limit > 1:
        return False
    return None


def _numeric_series(expression: sp.Expr, index: sp.Symbol, lower: sp.Expr, upper: sp.Expr) -> sp.Float | None:
    """Value of a convergent series by two independent numeric methods, kept only when they agree.

    Sympy's evalf can need tens of seconds for an oscillating series such as sin(n)/n**2,
    and the extrapolation methods can disagree there: then no value is reported.
    """
    import mpmath

    if not (lower.is_finite or upper.is_finite) or expression.free_symbols - {index}:
        return None
    term = sp.lambdify(index, expression, modules="mpmath")
    span = [mpmath.mpf(lower), mpmath.inf] if upper == sp.oo else [mpmath.ninf, mpmath.mpf(upper)]
    with mpmath.workdps(20):
        try:
            values = [mpmath.nsum(term, span, method=method) for method in ("r+s", "levin")]
        except (ArithmeticError, TypeError, ValueError, ZeroDivisionError):
            return None
    first, second = (complex(value) for value in values)
    if first.imag or second.imag or abs(first.real - second.real) > 1e-9 * max(1, abs(first.real)):
        return None
    return sp.Float(first.real, 12)


def _critical_kind(expression: sp.Expr, variables: tuple[sp.Symbol, ...], point: tuple[sp.Expr, ...]) -> str:
    substitutions = dict(zip(variables, point))
    if len(variables) == 1:
        # The first non-zero derivative decides: even order gives an extremum, odd order an inflection.
        for order in range(2, 9):
            value = _at(sp.diff(expression, variables[0], order), substitutions)
            if value.is_zero:
                continue
            if order % 2:
                return "flesso a tangente orizzontale" if value.is_zero is False else "non determinato"
            return "minimo relativo" if value.is_positive else "massimo relativo" if value.is_negative else "non determinato"
        return "non determinato"
    hessian = sp.hessian(expression, variables).applyfunc(lambda entry: _at(entry, substitutions))
    if hessian.has(sp.nan):
        return "non determinato"
    if len(variables) == 2:
        determinant, corner = sp.simplify(hessian.det()), hessian[0, 0]
        if determinant.is_negative:
            return "punto di sella"
        if determinant.is_positive:
            return "minimo relativo" if corner.is_positive else "massimo relativo" if corner.is_negative else "non determinato"
        return "non determinato"
    eigenvalues = list(hessian.eigenvals())
    if all(value.is_positive for value in eigenvalues):
        return "minimo relativo"
    if all(value.is_negative for value in eigenvalues):
        return "massimo relativo"
    if any(value.is_positive for value in eigenvalues) and any(value.is_negative for value in eigenvalues):
        return "punto di sella"
    return "non determinato"


def _extrema(request: MathRequest, expression: sp.Expr, variables: tuple[sp.Symbol, ...]) -> dict:
    if len(variables) > 3:
        raise ValueError("I punti critici si cercano con al massimo tre variabili.")
    gradient = [sp.diff(expression, variable) for variable in variables]
    if all(sp.simplify(component) == 0 for component in gradient):
        raise ValueError("La funzione è costante: ogni punto è stazionario.")
    try:
        candidates = sp.solve(gradient, variables, dict=True)
    except NotImplementedError:
        raise ValueError("Il calcolatore non ha trovato i punti critici.") from None
    real = request.domain == "real"
    points = []
    for candidate in candidates[:20]:
        point = tuple(candidate.get(variable, variable) for variable in variables)
        if real and any(coordinate.is_real is False for coordinate in point):
            continue
        value = _at(expression, dict(zip(variables, point)))
        if value.has(sp.nan, sp.zoo) or value.is_finite is False or (real and value.is_real is False):
            continue
        isolated = all(variable in candidate for variable in variables)
        kind = _critical_kind(expression, variables, point) if isolated else "punti non isolati"
        points.append((point[0] if len(point) == 1 else sp.Tuple(*point), kind, value))

    rows = [{"point": _entry(point), "kind": kind, "value": _entry(value)} for point, kind, value in points]
    result = {
        **_result(request, sp.FiniteSet(*(point for point, _, _ in points)), points=rows),
        "result": "; ".join(f"{row['point']['value']}: {row['kind']}, valore {row['value']['value']}" for row in rows)
        or "Nessun punto critico.",
    }
    result.pop("approximation", None)
    if expression.has(*TRIGONOMETRIC):
        result["coverage"] = "solo i punti critici principali: la periodicità può aggiungerne altri"
    return result


def _ode(request: MathRequest) -> dict:
    if len(request.variables) < 2:
        raise ValueError("Indica la variabile indipendente e la funzione incognita, per esempio ['x', 'y'].")
    if len(request.expressions) != 1:
        raise ValueError("Passa una sola equazione differenziale.")
    real = request.domain == "real"
    independent, name, *parameters = request.variables
    x = sp.Symbol(independent)
    function = sp.Function(name)(x)
    constants = {parameter: sp.Symbol(parameter) for parameter in parameters}
    symbols: dict[str, sp.Basic] = {**constants, independent: x, name: function}

    def derivative(match: re.Match) -> str:
        order = len(match.group(1))
        if order > 6:
            raise ValueError("L'ordine della derivata è troppo alto per il calcolatore.")
        placeholder = f"_d{order}_{name}"
        symbols[placeholder] = function.diff(x, order)
        return placeholder

    source = request.expressions[0].translate(UNICODE)
    source = re.sub(rf"\b{re.escape(name)}\s*\(\s*{re.escape(independent)}\s*\)", name, source)
    source = re.sub(rf"\b{re.escape(name)}('+)", derivative, source)
    relations = _relations(source, symbols, real)
    if len(relations) != 1 or relations[0][1] != "==":
        raise ValueError("Scrivi una sola equazione differenziale con il segno =.")
    left, _, right = relations[0]
    equation = sp.Eq(_lower(left).doit(), _lower(right).doit())
    if not equation.has(sp.Derivative):
        raise ValueError("L'equazione non contiene derivate della funzione incognita.")

    pattern = re.compile(rf"\s*{re.escape(name)}('*)\s*\((.+)\)\s*=(.+)")
    initial = {}
    for condition in request.conditions:
        match = pattern.fullmatch(condition.translate(UNICODE))
        if not match:
            raise ValueError(f"Scrivi le condizioni iniziali come {name}(0)=1 oppure {name}'(0)=0.")
        order = len(match.group(1))
        at = _expression(match.group(2), constants, real).doit()
        target = function.subs(x, at) if order == 0 else function.diff(x, order).subs(x, at)
        initial[target] = _expression(match.group(3), constants, real).doit()
    try:
        solution = sp.dsolve(equation, function, ics=initial or None)
    except (NotImplementedError, ValueError):
        raise ValueError("Il calcolatore non ha risolto l'equazione differenziale.") from None
    hints = [hint for hint in sp.classify_ode(equation, function) if not hint.endswith("_Integral")]
    value = sp.Tuple(*solution) if isinstance(solution, list) else solution
    details = {"methods": hints[:3]} if hints else {}
    if request.conditions:
        details["initial_conditions"] = request.conditions
    return _result(request, value, **details)


# Linear algebra --------------------------------------------------------------------------------


def _vector(matrix: sp.ImmutableMatrix) -> list[sp.Expr]:
    if min(matrix.shape) != 1:
        raise ValueError("Serve un vettore, cioè una sola riga o colonna.")
    return list(matrix)


def _linear_algebra(request: MathRequest, symbols: dict[str, sp.Symbol]) -> dict:
    task = request.matrix_operation
    if task is None:
        raise ValueError("Indica in matrix_operation quale calcolo eseguire sulla matrice.")
    real = request.domain == "real"
    domain = sp.S.Reals if real else sp.S.Complexes
    matrices = [_matrix(source, symbols, real) for source in request.expressions]
    if task in PAIR_MATRIX and len(matrices) != 2:
        raise ValueError("Passa esattamente due matrici o vettori.")
    if task in MANY_MATRIX and len(matrices) < 2:
        raise ValueError("Passa almeno due matrici, nell'ordine dell'operazione.")
    if task not in PAIR_MATRIX | MANY_MATRIX and len(matrices) != 1:
        raise ValueError("Passa una sola matrice.")
    first = matrices[0]
    if task in SQUARE_MATRIX and not first.is_square:
        raise ValueError("Serve una matrice quadrata.")
    details: dict = {"matrix_operation": task}

    if task == "determinant":
        value = sp.factor(first.det())
        if len(first.free_symbols) == 1:
            (parameter,) = first.free_symbols
            details["singular_values"] = str(sp.solveset(value, parameter, domain))
    elif task == "inverse":
        determinant = sp.factor(first.det())
        if determinant.is_zero:
            raise ValueError("La matrice non è invertibile: il determinante è 0.")
        value = first.inv().applyfunc(sp.factor)
        details["determinant"] = str(determinant)
        if determinant.free_symbols:
            details["condition"] = f"{determinant} != 0"
    elif task == "rank":
        rank = first.rank(simplify=True)
        value = sp.Integer(rank)
        if first.free_symbols:
            details["coverage"] = "rango per valori generici dei parametri"
            if first.is_square and len(first.free_symbols) == 1:
                (parameter,) = first.free_symbols
                special = sp.solveset(sp.factor(first.det()), parameter, domain)
                if isinstance(special, sp.FiniteSet) and len(special) <= 6:
                    details["rank_cases"] = {
                        f"{parameter} = {item}": int(first.subs(parameter, item).rank(simplify=True)) for item in special
                    }
                    details["coverage"] = f"rango {rank} per {parameter} fuori da {special}"
    elif task == "transpose":
        value = first.T
    elif task == "rref":
        reduced, pivots = first.rref(simplify=True)
        value = sp.ImmutableMatrix(reduced)
        details["pivot_columns"] = [pivot + 1 for pivot in pivots]
    elif task == "charpoly":
        value = sp.factor(first.charpoly(sp.Symbol("lambda")).as_expr())
        details["convention"] = "det(lambda*I - A)"
    elif task == "eigenvalues":
        eigenvalues = first.eigenvals()
        value = sp.Dict(eigenvalues)
        details["multiplicities"] = {str(key): int(count) for key, count in eigenvalues.items()}
        if real and any(key.is_real is False for key in eigenvalues):
            details["note"] = "alcuni autovalori non sono reali"
    elif task == "eigenvectors":
        spaces = first.eigenvects()
        value = sp.Tuple(*(sp.Tuple(key, count, sp.Tuple(*map(sp.ImmutableMatrix, basis))) for key, count, basis in spaces))
        details["eigenvectors"] = [
            {
                "eigenvalue": str(key), "algebraic_multiplicity": int(count),
                "geometric_multiplicity": len(basis), "basis": [str(list(vector)) for vector in basis],
            }
            for key, count, basis in spaces
        ]
        details["diagonalizable"] = bool(first.is_diagonalizable())
        return {**_result(request, value, **details), "result": "; ".join(
            f"autovalore {space['eigenvalue']} (molteplicità {space['algebraic_multiplicity']}): "
            + ", ".join(space["basis"])
            for space in details["eigenvectors"]
        )}
    elif task == "nullspace":
        basis = first.nullspace(simplify=True)
        value = sp.Tuple(*map(sp.ImmutableMatrix, basis))
        details["dimension"] = len(basis)
        text = f"base del nucleo: {', '.join(str(list(vector)) for vector in basis)}" if basis else (
            "Il nucleo contiene solo il vettore nullo."
        )
        return {**_result(request, value, **details), "result": text}
    elif task == "multiply":
        for left, right in zip(matrices, matrices[1:]):
            if left.cols != right.rows:
                raise ValueError(
                    f"Le dimensioni {left.rows}x{left.cols} e {right.rows}x{right.cols} non sono compatibili per il prodotto."
                )
        value = reduce(lambda left, right: left * right, matrices)
    elif task == "add":
        if any(matrix.shape != first.shape for matrix in matrices):
            raise ValueError("Per la somma le matrici devono avere le stesse dimensioni.")
        value = reduce(lambda left, right: left + right, matrices)
    elif task == "power":
        value = first ** request.order
        details["exponent"] = request.order
    elif task == "linear_system":
        coefficients, constants = matrices
        if constants.shape == (1, coefficients.rows):
            constants = constants.T
        if constants.shape != (coefficients.rows, 1):
            raise ValueError("Il vettore dei termini noti deve avere una componente per ogni riga della matrice.")
        parameters = coefficients.free_symbols | constants.free_symbols
        names = [name for name in request.variables if symbols[name] not in parameters]
        if len(names) == coefficients.cols:
            unknowns = tuple(symbols[name] for name in names)
        elif not names:
            unknowns = sp.symbols(f"x1:{coefficients.cols + 1}")
        else:
            raise ValueError(f"Indica {coefficients.cols} incognite in variables oppure nessuna.")
        value = sp.linsolve((coefficients, constants), unknowns)
        rank, augmented = coefficients.rank(simplify=True), coefficients.row_join(constants).rank(simplify=True)
        details.update(unknowns=[str(unknown) for unknown in unknowns], rank=rank, augmented_rank=augmented)
        if rank == augmented:
            details["free_parameters"] = coefficients.cols - rank
        if parameters:
            details["coverage"] = "soluzione per valori generici dei parametri"
    else:
        vectors = [_vector(matrix) for matrix in matrices]
        if task == "norm":
            squares = [item ** 2 if real else sp.Abs(item) ** 2 for item in vectors[0]]
            value = sp.simplify(sp.sqrt(sp.Add(*squares)))
        elif len(vectors[0]) != len(vectors[1]):
            raise ValueError("I vettori devono avere lo stesso numero di componenti.")
        elif task == "dot":
            value = sp.simplify(sp.Add(*(left * right for left, right in zip(*vectors))))
        else:
            if len(vectors[0]) != 3:
                raise ValueError("Il prodotto vettoriale richiede vettori con tre componenti.")
            (u1, u2, u3), (v1, v2, v3) = vectors
            value = sp.Tuple(*(sp.simplify(item) for item in (u2 * v3 - u3 * v2, u3 * v1 - u1 * v3, u1 * v2 - u2 * v1)))
    return _result(request, value, **details)


# Statistics ------------------------------------------------------------------------------------


def _numbers(source: str) -> list[sp.Expr]:
    if re.fullmatch(r"\s*\[\s*\]\s*", source):
        raise ValueError("Non ci sono dati da analizzare.")
    try:
        values = _vector(_matrix(source, {}, True, max_size=200))
    except ValueError as error:
        if "matrice" in str(error) or "vettore" in str(error):
            raise ValueError("Scrivi i dati come lista di numeri, per esempio [2, 4, 4, 5].") from None
        raise
    if any(not value.is_number or value.is_real is not True for value in values):
        raise ValueError("I dati devono essere numeri reali.")
    return values


def _statistics(request: MathRequest) -> dict:
    if len(request.expressions) > 2:
        raise ValueError("Passa la lista dei dati e, se servono, la lista delle frequenze.")
    values = _numbers(request.expressions[0])
    frequencies = _numbers(request.expressions[1]) if len(request.expressions) == 2 else [sp.Integer(1)] * len(values)
    if len(frequencies) != len(values):
        raise ValueError("Dati e frequenze devono avere la stessa lunghezza.")
    if any(not frequency.is_Integer or frequency < 0 for frequency in frequencies):
        raise ValueError("Le frequenze devono essere numeri interi non negativi.")
    counts: dict[sp.Expr, int] = {}
    for value, frequency in zip(values, frequencies):
        counts[value] = counts.get(value, 0) + int(frequency)
    counts = {value: count for value, count in counts.items() if count}
    size = sum(counts.values())
    if not size:
        raise ValueError("Non ci sono dati da analizzare.")

    ordered = sorted(counts, key=lambda value: value.evalf(30))

    def nth(position: int) -> sp.Expr:
        seen = 0
        for value in ordered:
            seen += counts[value]
            if seen >= position:
                return value
        raise AssertionError("position out of range")

    total = sp.Add(*(value * count for value, count in counts.items()))
    mean = total / size
    variance = sp.simplify(sp.Add(*(count * (value - mean) ** 2 for value, count in counts.items())) / size)
    median = nth((size + 1) // 2) if size % 2 else (nth(size // 2) + nth(size // 2 + 1)) / 2
    top = max(counts.values())
    modes = [value for value in ordered if counts[value] == top]
    stats: dict[str, sp.Basic | str] = {
        "count": sp.Integer(size), "sum": total, "mean": mean, "median": median,
        # With every value equally frequent the distribution has no mode.
        "mode": "nessuna" if len(modes) == len(counts) > 1 else modes[0] if len(modes) == 1 else sp.FiniteSet(*modes),
        "minimum": ordered[0], "maximum": ordered[-1], "range": ordered[-1] - ordered[0],
        "variance": variance, "standard_deviation": sp.sqrt(variance),
    }
    if size > 1:
        sample = sp.simplify(variance * size / (size - 1))
        stats.update(sample_variance=sample, sample_standard_deviation=sp.sqrt(sample))
    entries = {
        key: {"value": value, "latex": rf"\text{{{value}}}"} if isinstance(value, str) else _entry(value)
        for key, value in stats.items()
    }
    labels = [(label, entries[key]) for key, label in STATISTICS if key in entries]
    return {
        "status": "ok",
        "operation": request.operation,
        "expressions": request.expressions,
        "variables": request.variables,
        "result": "; ".join(f"{label} = {entry['value']}" for label, entry in labels),
        "latex": r",\quad ".join(rf"\text{{{label}}} = {entry['latex']}" for label, entry in labels),
        "exact": True,
        "statistics": entries,
    }


# Dispatcher ------------------------------------------------------------------------------------


def printed_equation(text: str) -> dict | None:
    """Recognize an unambiguous single-line equation in selected text."""
    text = re.sub(
        r"[\u00bc-\u00be\u2150-\u215e\U0001d400-\U0001d7ff]",
        lambda match: (
            f"({fraction.replace('⁄', '/')})"
            if "⁄" in (fraction := normalize("NFKC", match[0])) else fraction
        ),
        text,
    ).replace("⁄", "/").replace(" ", " ")
    if len(text) > 300 or text.count("=") != 1 or not re.fullmatch(r"[\da-zA-Z.()+−–×·÷*/= \t-]+", text):
        return None
    names = set(re.findall(r"[a-zA-Z]+", text))
    if len(names) != 1:
        return None
    variable = next(iter(names))
    if len(variable) != 1 or variable in CONSTANTS:
        return None
    expression = re.sub(
        r"(?<=[0-9)])\s*(?=[a-zA-Z(])|(?<=[a-zA-Z])\s*(?=\()|(?<=\))\s*(?=\d)",
        "*",
        text.translate(UNICODE),
    )
    return {"operation": "solve", "expressions": [expression], "variables": [variable]}


def _is_power_series(value: sp.Expr, variable: sp.Symbol, point: sp.Expr) -> bool:
    """Whether a series has only integer powers of (x - point), as Taylor and Laurent series do."""
    step = sp.Dummy("t")
    body = sp.expand(value.removeO().subs(variable, point + step))
    for term in sp.Add.make_args(body):
        coefficient, exponent = term.as_coeff_exponent(step)
        if coefficient.has(step) or not exponent.is_Integer:
            return False
    return True


def _calculate(request: MathRequest) -> dict:
    if request.operation == "clarify":
        return {"status": "clarify", "message": request.clarification.strip() or "Seleziona l'esercizio completo o scrivi la formula."}
    if not request.expressions:
        raise ValueError("Seleziona l'esercizio completo o scrivi la formula.")
    if len(set(request.variables)) != len(request.variables) or any(
        name in CONSTANTS or name in FUNCTIONS for name in request.variables
    ):
        raise ValueError("Usa nomi di variabile distinti dai nomi riservati delle funzioni e delle costanti.")
    if request.operation == "ode":
        return _ode(request)
    if request.operation == "statistics":
        return _statistics(request)
    # Real symbols let sympy simplify |x| and sqrt(x**2) without re(x) and im(x).
    real = request.domain == "real"
    symbols = {name: sp.Symbol(name, real=True) if real else sp.Symbol(name) for name in request.variables}
    variables = tuple(symbols.values())
    if request.operation == "solve":
        return _solve(request, variables, symbols)
    if request.operation == "matrix":
        return _linear_algebra(request, symbols)
    if len(request.expressions) != 1:
        raise ValueError("Passa una sola espressione per questa operazione.")

    parsed = _expression(request.expressions[0], symbols, request.domain == "real", keep_roots=True)
    expression = _lower(parsed).doit()
    existence = _existence(request, parsed)
    if request.operation == "evaluate":
        value = _defined(sp.simplify(expression))
        if request.domain == "real" and value.is_number and value.is_real is False:
            raise ValueError("Il risultato non è un numero reale.")
        return _result(request, value, **existence)
    if request.operation == "factor":
        number = expression.doit()
        value = _prime_factors(int(number)) if number.is_Integer else _defined(sp.factor(expression))
        return _result(request, value, **existence)
    if request.operation == "expand":
        return _result(request, _defined(sp.expand(expression)), **existence)

    if not variables:
        raise ValueError("Indica la variabile dell'operazione.")
    variable = variables[0]
    if request.operation == "domain":
        if request.domain != "real":
            raise ValueError("Il dominio si calcola nei numeri reali.")
        if parsed.free_symbols - {variable}:
            raise ValueError("Il dominio si calcola per funzioni di una sola variabile.")
        return _domain(request, parsed, variable)
    if request.operation == "derivative":
        return _derivative(request, expression, variable, symbols, existence)
    if request.operation == "gradient":
        return _result(request, sp.Tuple(*(sp.diff(expression, item) for item in variables)))
    if request.operation == "hessian":
        hessian = sp.ImmutableMatrix(sp.hessian(expression, variables))
        return _result(request, hessian, determinant=str(sp.factor(hessian.det())))
    if request.operation == "extrema":
        return _extrema(request, expression, variables)
    if request.operation == "series":
        point = sp.Integer(0) if request.point is None else _expression(request.point, {}).doit()
        sides = _sides(request, parsed, variable, point) if point.is_finite else None
        if sides is not None and not any(sides):
            raise ValueError(f"La funzione non è definita vicino a {variable} = {point}, quindi lo sviluppo non esiste.")
        value = sp.series(_lower(parsed, at={variable: point}).doit(), variable, point, n=request.order + 1)
        if point.is_finite and not _is_power_series(value, variable, point):
            reason = (
                f"è definita solo a {'destra' if sides[1] else 'sinistra'} del punto"
                if sides is not None and sides[0] != sides[1]
                else "non è derivabile infinite volte in quel punto"
            )
            raise ValueError(
                f"La funzione non è sviluppabile in serie di Taylor in {variable} = {_readable(point)}: {reason}."
            )
        return _result(request, value, point=str(point), order=request.order)
    if request.operation == "sum":
        return _sum(request, expression, variable, symbols)
    if request.operation == "limit":
        return _limit(request, expression, variables, parsed)
    return _integral(request, expression, variables, symbols, parsed, existence)


def _answer(payload: str | bytes) -> dict:
    try:
        return _calculate(MathRequest.model_validate_json(payload))
    except SyntaxError:
        return {
            "status": "unavailable",
            "message": "Non riesco a leggere la formula. Controlla parentesi e operatori.",
        }
    except ValueError as error:
        return {"status": "unavailable", "message": str(error)}
    except (ArithmeticError, MatrixError, NotImplementedError, TypeError):
        return {"status": "unavailable", "message": "Il calcolatore non è riuscito a elaborare questa espressione."}


if __name__ == "__main__":
    # A long-lived worker: one JSON request per line, one JSON answer per line.
    print("ready", flush=True)
    for line in sys.stdin.buffer:
        if line.strip():
            print(json.dumps(_answer(line), ensure_ascii=True), flush=True)
else:
    from langchain_core.tools import tool

    COMPUTE_TIMEOUT = 10
    STARTUP_TIMEOUT = 60
    TIMEOUT_MESSAGE = "Il calcolo ha impiegato troppo tempo. Prova con un passaggio alla volta."

    class _Worker:
        """A calculator process kept alive between requests, so sympy is imported only once.

        A separate process still lets us stop a long symbolic computation: on timeout the
        worker is killed and a fresh one takes its place.
        """

        def __init__(self):
            self.process = subprocess.Popen(
                [sys.executable, "-B", str(Path(__file__).resolve())],
                stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
            )
            self.lines: queue.Queue[bytes | None] = queue.Queue()
            self.ready = False
            threading.Thread(target=self._read, daemon=True).start()

        def _read(self):
            for line in self.process.stdout:
                self.lines.put(line)
            self.lines.put(None)

        def _line(self, timeout: float) -> bytes:
            line = self.lines.get(timeout=timeout)
            if line is None:
                raise OSError("calculator worker stopped")
            return line

        def alive(self) -> bool:
            return self.process.poll() is None

        def ask(self, payload: str) -> dict:
            if not self.ready:
                if self._line(STARTUP_TIMEOUT).strip() != b"ready":
                    raise OSError("calculator worker did not start")
                self.ready = True
            self.process.stdin.write(payload.encode("utf-8") + b"\n")
            self.process.stdin.flush()
            return json.loads(self._line(COMPUTE_TIMEOUT))

        def close(self):
            try:
                self.process.kill()
            except OSError:
                pass

    _idle: list[_Worker] = []
    _pool = threading.Lock()

    def warm_calculator():
        """Keep one worker started in advance, so a calculation does not wait for sympy."""
        with _pool:
            if any(worker.alive() for worker in _idle):
                return
            _idle.append(_Worker())

    def _run_in_worker(payload: str) -> dict:
        with _pool:
            while _idle and not _idle[-1].alive():
                _idle.pop().close()
            worker = _idle.pop() if _idle else _Worker()
        threading.Thread(target=warm_calculator, daemon=True).start()
        try:
            result = worker.ask(payload)
        except queue.Empty:
            worker.close()
            return {"status": "unavailable", "message": TIMEOUT_MESSAGE}
        except (OSError, ValueError):
            worker.close()
            return {"status": "unavailable", "message": "Il calcolatore non è riuscito a completare l'operazione."}
        with _pool:
            if len(_idle) < 2:
                _idle.append(worker)
                return result
        worker.close()
        return result

    @tool(args_schema=MathRequest, response_format="content_and_artifact")
    def calculate_math(**arguments) -> tuple[str, dict]:
        """Calcola espressioni, scomposizioni, equazioni, disequazioni, sistemi, domini, limiti,
        derivate, integrali, serie, sommatorie, punti critici, equazioni differenziali,
        matrici, vettori e statistiche.

        Trascrivi solo l'esercizio visibile o scritto dall'utente. Se manca un dato,
        la formula è illeggibile o ci sono più esercizi senza una scelta chiara, usa
        operation=clarify e chiedi l'informazione necessaria in clarification.
        """
        request = MathRequest.model_validate(arguments)
        if request.operation == "clarify":
            result = _calculate(request)
        else:
            result = _run_in_worker(request.model_dump_json())
        return json.dumps(result, ensure_ascii=False), result
