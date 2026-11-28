from unittest import IsolatedAsyncioTestCase, TestCase
from unittest.mock import AsyncMock, Mock, patch

import sympy as sp
from langchain_core.messages import AIMessage

from src.core.agent import answer_selection
from src.core.tools.math_tools import MathRequest, _calculate, calculate_math


class MathTests(TestCase):
    def test_exact_arithmetic_and_solution_domain(self):
        self.assertEqual(_calculate(MathRequest(operation="evaluate", expressions=["0.1+0.2"]))["result"], "3/10")
        result = _calculate(MathRequest(
            operation="solve", expressions=["(x**2-1)/(x-1)=2"], variables=["x"],
        ))
        self.assertEqual(result["result"], "EmptySet")

    def test_system_and_numerical_root(self):
        system = _calculate(MathRequest(
            operation="solve", expressions=["x+y=3", "x-y=1"], variables=["x", "y"],
        ))
        self.assertEqual(system["result"], "{(2, 1)}")
        numerical = _calculate(MathRequest(
            operation="solve", expressions=["cos(x)=x"], variables=["x"], initial_values=["1"],
        ))
        self.assertFalse(numerical["exact"])
        self.assertAlmostEqual(float(numerical["result"]), 0.7390851332)

    def test_distinct_lateral_limits_and_definite_integral(self):
        limits = _calculate(MathRequest(operation="limit", expressions=["1/x"], variables=["x"], point="0"))
        self.assertEqual((limits["left"], limits["right"]), ("-oo", "oo"))
        integral = _calculate(MathRequest(
            operation="integral", expressions=["x**2"], variables=["x"], lower="0", upper="2",
        ))
        self.assertEqual(integral["result"], "8/3")

    def test_only_supported_math_operations_are_parsed(self):
        with self.assertRaisesRegex(ValueError, "funzioni matematiche supportate"):
            _calculate(MathRequest(operation="evaluate", expressions=["sin(x).expand()"], variables=["x"]))

    def test_irrational_results_include_a_decimal_approximation(self):
        result = _calculate(MathRequest(operation="evaluate", expressions=["3*sqrt(2)"]))
        self.assertEqual(result["result"], "3*sqrt(2)")
        self.assertAlmostEqual(float(result["approximation"]), 4.242640687)
        self.assertNotIn("approximation", _calculate(MathRequest(operation="evaluate", expressions=["1/3"])))

    def test_simplification_keeps_the_existence_conditions(self):
        result = _calculate(MathRequest(operation="evaluate", expressions=["(x**2-1)/(x-1)"], variables=["x"]))
        self.assertEqual(result["result"], "x + 1")
        self.assertEqual(result["existence_domain"], "Union(Interval.open(-oo, 1), Interval.open(1, oo))")

    def test_italian_notation_and_real_odd_roots(self):
        self.assertEqual(_calculate(MathRequest(operation="evaluate", expressions=["sen(pi/6)+tg(pi/4)"]))["result"], "3/2")
        self.assertEqual(_calculate(MathRequest(operation="evaluate", expressions=["cbrt(-8)"]))["result"], "-2")
        self.assertEqual(_calculate(MathRequest(operation="evaluate", expressions=["root(-32, 5)"]))["result"], "-2")
        with self.assertRaisesRegex(ValueError, "numero reale"):
            _calculate(MathRequest(operation="evaluate", expressions=["sqrt(-4)"]))
        self.assertEqual(
            _calculate(MathRequest(operation="evaluate", expressions=["sqrt(-4)"], domain="complex"))["result"], "2*I",
        )

    def test_integer_functions_are_bounded(self):
        self.assertEqual(_calculate(MathRequest(operation="evaluate", expressions=["factorial(5)/binomial(5, 2)"]))["result"], "12")
        self.assertEqual(_calculate(MathRequest(operation="evaluate", expressions=["gcd(12, 18)+lcm(4, 6)"]))["result"], "18")
        with self.assertRaisesRegex(ValueError, "troppo grande"):
            _calculate(MathRequest(operation="evaluate", expressions=["factorial(5000)"]))

    def test_inequalities(self):
        def solve(*expressions):
            return _calculate(MathRequest(operation="solve", expressions=list(expressions), variables=["x"]))

        self.assertEqual(solve("(x-1)/(x+2)>0")["result"], "Union(Interval.open(-oo, -2), Interval.open(1, oo))")
        self.assertEqual(solve("-1<2*x+1<=3")["result"], "Interval.Lopen(-1, 1)")
        self.assertEqual(solve("x**2-4>=0", "x<5")["result"], "Union(Interval(-oo, -2), Interval.Ropen(2, 5))")
        self.assertEqual(solve("x**2<=0")["result"], "{0}")
        self.assertEqual(solve("x**2=9", "x!=3")["result"], "{-3}")
        with self.assertRaisesRegex(ValueError, "una sola incognita"):
            _calculate(MathRequest(operation="solve", expressions=["x+y>3"], variables=["x", "y"]))

    def test_periodic_inequalities_give_every_period(self):
        result = _calculate(MathRequest(operation="solve", expressions=["tg(x)>=1"], variables=["x"]))
        self.assertEqual(result["result"], "unione per k intero di Interval.Ropen(pi*k + pi/4, pi*k + pi/2)")
        self.assertEqual(result["latex"], r"\bigcup_{k \in \mathbb{Z}} \left[\pi k + \frac{\pi}{4}, \pi k + \frac{\pi}{2}\right)")
        self.assertEqual((result["period"], result["periodic_solution"]), ("pi", "Interval.Ropen(pi/4, pi/2)"))

    def test_factor_expand_and_domain(self):
        def run(operation, expression, variables=()):
            return _calculate(MathRequest(
                operation=operation, expressions=[expression], variables=list(variables),
            ))["result"]

        self.assertEqual(run("factor", "x**2-5*x+6", "x"), "(x - 3)*(x - 2)")
        self.assertEqual(run("factor", "360"), "2**3*3**2*5")
        self.assertEqual(run("expand", "(x+1)**3", "x"), "x**3 + 3*x**2 + 3*x + 1")
        self.assertEqual(run("domain", "sqrt(x-1)/(x-3)", "x"), "Union(Interval.Ropen(1, 3), Interval.open(3, oo))")
        self.assertEqual(run("domain", "cbrt(x)", "x"), "Reals")

    def test_taylor_series(self):
        result = _calculate(MathRequest(operation="series", expressions=["sin(x)"], variables=["x"], order=5))
        self.assertEqual(result["result"], "x - x**3/6 + x**5/120 + O(x**6)")
        self.assertNotIn("approximation", result)


def solve(*expressions, **options):
    return _calculate(MathRequest(operation="solve", expressions=list(expressions), variables=["x"], **options))


class EmptySetRegressionTests(TestCase):
    """The agent trusts the calculator: an empty set here becomes "no solution" on the board."""

    def test_periodic_inequality_with_a_lower_bound(self):
        # x = 5*pi/2 satisfies both conditions; sympy alone only looks at [0, 2*pi).
        result = solve("sin(x) > 0", "x > 4")
        self.assertEqual(result["result"], "unione per k intero, k >= 1, di Interval.open(2*pi*k, 2*pi*k + pi)")
        self.assertEqual(result["latex"], r"\bigcup_{k \geq 1} \left(2 \pi k, 2 \pi k + \pi\right)")
        self.assertTrue(sp.sympify(result["first_solutions"]).contains(5 * sp.pi / 2))

    def test_periodic_inequality_with_an_upper_bound(self):
        result = solve("sin(x) > 0", "x < -4")
        self.assertEqual(
            result["result"],
            "unione per k intero, k <= -2, di Interval.open(2*pi*k, 2*pi*k + pi) ∪ Interval.open(-2*pi, -4)",
        )
        self.assertEqual(result["repetitions"], "infinite")

    def test_periodic_inequality_in_a_bounded_interval(self):
        self.assertEqual(solve("sin(x) > 0", "x > 4", "x < 12")["result"], "Interval.open(2*pi, 3*pi)")
        long = solve("sin(x) > 0", "x > 4", "x < 200")
        self.assertEqual(long["result"], "unione per k intero, 1 <= k <= 31, di Interval.open(2*pi*k, 2*pi*k + pi)")
        self.assertEqual(long["repetitions"], "finite")

    def test_finite_periodic_solutions_are_counted(self):
        # 16 solutions: the result must not be described as infinitely many.
        result = solve("cos(x) = 0", "sin(x) > 0", "0 < x < 100")
        self.assertEqual(result["result"], "unione per k intero, 0 <= k <= 15, di {2*pi*k + pi/2}")
        self.assertEqual((result["k_range"], result["repetitions"], result["count"]), ("0 <= k <= 15", "finite", 16))

    def test_repetitions_stay_inside_the_domain(self):
        # log(x) needs x > 0 on every repetition, not only in the first period.
        result = solve("sin(x) + log(x) > log(x)")
        self.assertEqual(result["result"], "unione per k intero, k >= 0, di Interval.open(2*pi*k, 2*pi*k + pi)")
        self.assertEqual(sp.sympify(result["first_solutions"]).inf, 0)

    def test_periodic_existence_conditions(self):
        self.assertEqual(
            solve("sqrt(sin(x)) = 1/2")["result"],
            "unione per k intero di {2*pi*k + asin(1/4), 2*pi*k - asin(1/4) + pi}",
        )
        domain = _calculate(MathRequest(operation="domain", expressions=["sqrt(sin(x))"], variables=["x"]))
        self.assertEqual(domain["result"], "unione per k intero di Interval(2*pi*k, 2*pi*k + pi)")
        self.assertEqual(solve("tan(x) > 1", "x > 0")["result"], "unione per k intero, k >= 0, di Interval.open(pi*k + pi/4, pi*k + pi/2)")

    def test_periodic_relations_share_a_common_period(self):
        # sin(2*x) has period pi: its solutions in [pi, 2*pi) must not be dropped.
        self.assertEqual(
            solve("sin(x) > 0", "sin(2*x) > 0")["result"], "unione per k intero di Interval.open(2*pi*k, 2*pi*k + pi/2)",
        )
        self.assertEqual(solve("cos(x) = 0", "sin(x) > 0")["result"], "unione per k intero di {2*pi*k + pi/2}")
        self.assertEqual(solve("sin(x) > 2")["result"], "EmptySet")
        with self.assertRaisesRegex(ValueError, "periodo comune"):
            solve("sin(x) > 0", "sin(sqrt(2)*x) > 0")

    def test_odd_roots_of_a_variable_are_real(self):
        self.assertEqual(solve("cbrt(x) = -2")["result"], "{-8}")
        self.assertEqual(solve("root(x, 3) = -2")["result"], "{-8}")
        self.assertEqual(solve("cbrt(x) > -2")["result"], "Interval.open(-8, oo)")
        self.assertEqual(solve("cbrt(x-1) = x-1")["result"], "{0, 1, 2}")
        self.assertEqual(solve("cbrt(x) < x")["result"], "Union(Interval.open(-1, 0), Interval.open(1, oo))")
        self.assertEqual(solve("sqrt(x) = -2")["result"], "EmptySet")

    def test_existence_conditions_are_read_before_simplifying(self):
        # The condition is -cbrt(x) >= 0, which holds for x = -64.
        self.assertEqual(solve("sqrt(-cbrt(x)) = 2")["result"], "{-64}")
        domain = _calculate(MathRequest(operation="domain", expressions=["sqrt(-cbrt(x))"], variables=["x"]))
        self.assertEqual(domain["result"], "Interval(-oo, 0)")
        # cbrt(x)/cbrt(x) simplifies to 1 but does not exist at x = 0.
        self.assertEqual(solve("cbrt(x)/cbrt(x) = 1")["result"], "Union(Interval.open(-oo, 0), Interval.open(0, oo))")
        self.assertEqual(solve("x/x = 1")["result"], "Union(Interval.open(-oo, 0), Interval.open(0, oo))")
        simplified = _calculate(MathRequest(operation="evaluate", expressions=["cbrt(x)/cbrt(x)"], variables=["x"]))
        self.assertEqual(
            (simplified["result"], simplified["existence_domain"]),
            ("1", "Union(Interval.open(-oo, 0), Interval.open(0, oo))"),
        )
        self.assertEqual(solve("log(x) + log(x-1) = log(6)")["result"], "{3}")
        self.assertEqual(
            _calculate(MathRequest(operation="solve", expressions=["sqrt(x)+y=3", "x=-1"], variables=["x", "y"]))["result"],
            "EmptySet",
        )

    def test_the_parser_does_not_simplify_away_conditions(self):
        def domain(expression):
            return _calculate(MathRequest(operation="domain", expressions=[expression], variables=["x"]))["result"]

        # sin(asin(x)) is x only for -1 <= x <= 1, so 2 is not a solution.
        self.assertEqual(solve("sin(asin(x)) = 2")["result"], "EmptySet")
        self.assertEqual(domain("exp(log(x))"), "Interval.open(0, oo)")
        self.assertEqual(domain("log(2, x)"), "Union(Interval.open(0, 1), Interval.open(1, oo))")
        # A minus sign must not evaluate x/x to 1 before the conditions are read.
        self.assertEqual(solve("-(x/x) = -1")["result"], "Union(Interval.open(-oo, 0), Interval.open(0, oo))")
        simplified = _calculate(MathRequest(operation="evaluate", expressions=["exp(log(x))"], variables=["x"]))
        self.assertEqual((simplified["result"], simplified["existence_domain"]), ("x", "Interval.open(0, oo)"))

    def test_powers_with_a_zero_base(self):
        def domain(expression):
            return _calculate(MathRequest(operation="domain", expressions=[expression], variables=["x"]))["result"]

        self.assertEqual(domain("0**x"), "Interval.open(0, oo)")
        self.assertEqual(domain("0**(x-1)"), "Interval.open(1, oo)")

    def test_free_unknowns_keep_their_conditions(self):
        def system(*expressions):
            return _calculate(MathRequest(operation="solve", expressions=list(expressions), variables=["x", "y"]))

        # (x, 1) for every x except 0, where x/x is undefined.
        result = system("x/x + y = y + 1", "y = 1")
        self.assertEqual(result["result"], "ImageSet(Lambda(x, (x, 1)), Union(Interval.open(-oo, 0), Interval.open(0, oo)))")
        self.assertEqual(
            result["parameter_conditions"],
            [{"solution": "(x, 1)", "ranges": {"x": "Union(Interval.open(-oo, 0), Interval.open(0, oo))"}}],
        )
        self.assertIs(sp.sympify(result["parameter_conditions"][0]["ranges"]["x"]).contains(0), sp.false)
        self.assertEqual(system("y - x/x = 0")["result"], result["result"])
        # Without conditions on the free unknown the family stays as sympy gives it.
        self.assertEqual(system("sqrt(x) + y = y + 1")["result"], "{(1, y)}")

    def test_real_systems_need_real_coordinates(self):
        def system(*expressions, **options):
            return _calculate(MathRequest(operation="solve", expressions=list(expressions), variables=["x", "y"], **options))

        # x = ±sqrt(-y**2 - 1) is never real.
        self.assertEqual(system("x**2 + y**2 = -1")["result"], "EmptySet")
        self.assertEqual(
            system("x**2 + y**2 = -1", domain="complex")["result"], "{(-sqrt(-y**2 - 1), y), (sqrt(-y**2 - 1), y)}",
        )
        # The circle: two families with y in [-1, 1], each given once.
        circle = system("x**2 + y**2 = 1")
        self.assertEqual(
            circle["result"],
            "Union(ImageSet(Lambda(y, (-sqrt(1 - y**2), y)), Interval(-1, 1)), "
            "ImageSet(Lambda(y, (sqrt(1 - y**2), y)), Interval(-1, 1)))",
        )
        self.assertEqual(len(circle["parameter_conditions"]), 2)

    def test_periodic_conditions_on_a_free_unknown(self):
        result = _calculate(MathRequest(
            operation="solve", expressions=["y + log(sin(x)) = 1 + log(sin(x))"], variables=["x", "y"],
        ))
        # (5*pi/2, 1) is a solution: the condition sin(x) > 0 holds on every period.
        self.assertEqual(result["result"], "{(x, 1)} con x in unione per k intero di Interval.open(2*pi*k, 2*pi*k + pi)")
        self.assertEqual(
            result["latex"],
            r"\left\{\left( x, \  1\right) \;\middle|\; x \in \bigcup_{k \in \mathbb{Z}} \left(2 \pi k, 2 \pi k + \pi\right)\right\}",
        )

    def test_cube_roots_keep_the_variables_of_their_radicand(self):
        domain = _calculate(MathRequest(operation="domain", expressions=["cbrt(-8*x/x)"], variables=["x"]))
        self.assertEqual(domain["result"], "Union(Interval.open(-oo, 0), Interval.open(0, oo))")
        self.assertEqual(solve("cbrt(-8*x/x) = -2")["result"], "Union(Interval.open(-oo, 0), Interval.open(0, oo))")
        self.assertEqual(_calculate(MathRequest(operation="evaluate", expressions=["cbrt(-8)"]))["result"], "-2")


class OriginalDomainTests(TestCase):
    """Calculus runs on the evaluated formula, so the domain of the formula as written is checked first."""

    def run_on(self, operation, expression="exp(log(x))", **options):
        return _calculate(MathRequest(operation=operation, expressions=[expression], variables=["x"], **options))

    def test_integrals_need_the_whole_interval(self):
        with self.assertRaisesRegex(ValueError, r"non esiste per x in \(-2, -1\)"):
            self.run_on("integral", lower="-2", upper="-1")
        with self.assertRaisesRegex(ValueError, r"non esiste per x in \(-1, 0\]"):
            self.run_on("integral", lower="-1", upper="2")
        with self.assertRaisesRegex(ValueError, r"\(π, 2·π\)"):
            self.run_on("integral", "sqrt(sin(x))", lower="0", upper="7")
        self.assertEqual(self.run_on("integral", lower="1", upper="2")["result"], "3/2")
        self.assertEqual(self.run_on("integral", lower="2", upper="1")["result"], "-3/2")
        # Isolated points do not matter: improper and removable cases still work.
        self.assertEqual(self.run_on("integral", "1/sqrt(x)", lower="0", upper="1")["result"], "2")
        self.assertEqual(self.run_on("integral", "x/x", lower="-1", upper="1")["result"], "2")

    def test_antiderivatives_and_derivatives_report_the_domain(self):
        antiderivative = self.run_on("integral")
        self.assertEqual((antiderivative["result"], antiderivative["existence_domain"]), ("x**2/2", "Interval.open(0, oo)"))
        derivative = self.run_on("derivative")
        self.assertEqual((derivative["result"], derivative["existence_domain"]), ("1", "Interval.open(0, oo)"))

    def test_limits_and_series_need_the_function_near_the_point(self):
        with self.assertRaisesRegex(ValueError, "non è definita vicino a x = -1"):
            self.run_on("limit", point="-1")
        with self.assertRaisesRegex(ValueError, "non è definita per x vicino a -oo"):
            self.run_on("limit", point="-oo")
        with self.assertRaisesRegex(ValueError, "lo sviluppo non esiste"):
            self.run_on("series", point="-1")
        one_sided = self.run_on("limit", point="0")
        self.assertEqual((one_sided["result"], one_sided["direction"]), ("0", "right"))
        self.assertIn("solo a destra", one_sided["note"])
        with self.assertRaisesRegex(ValueError, "non è definita vicino a x = 0"):
            self.run_on("limit", "sqrt(-x)", point="0", direction="right")

    def test_odd_roots_in_calculus(self):
        def run(operation, **options):
            return _calculate(MathRequest(operation=operation, expressions=["cbrt(x)"], variables=["x"], **options))["result"]

        self.assertEqual(run("limit", point="-8"), "-2")
        self.assertEqual(run("integral", lower="-8", upper="8"), "0")
        self.assertEqual(run("domain"), "Reals")
        self.assertEqual(run("series", point="-8", order=1), "-4/3 + x/12 + O((x + 8)**2, (x, -8))")


def matrix(task, *expressions, **options):
    return _calculate(MathRequest(operation="matrix", matrix_operation=task, expressions=list(expressions), **options))


class LinearAlgebraTests(TestCase):
    def test_square_matrix_operations(self):
        self.assertEqual(matrix("determinant", "[[1, 2], [3, 4]]")["result"], "-2")
        self.assertEqual(matrix("inverse", "[[1, 2], [3, 4]]")["result"], "Matrix([[-2, 1], [3/2, -1/2]])")
        self.assertEqual(matrix("power", "[[1, 1], [0, 1]]", order=5)["result"], "Matrix([[1, 5], [0, 1]])")
        self.assertEqual(matrix("charpoly", "[[2, 1], [1, 2]]")["result"], "(lambda - 3)*(lambda - 1)")
        with self.assertRaisesRegex(ValueError, "non è invertibile"):
            matrix("inverse", "[[1, 2], [2, 4]]")
        with self.assertRaisesRegex(ValueError, "quadrata"):
            matrix("determinant", "[[1, 2, 3], [4, 5, 6]]")

    def test_rank_is_discussed_for_a_parameter(self):
        result = matrix("rank", "[[k, 1], [1, k]]", variables=["k"])
        self.assertEqual(result["result"], "2")
        self.assertEqual(result["rank_cases"], {"k = -1": 1, "k = 1": 1})
        self.assertEqual(matrix("determinant", "[[k, 1], [1, k]]", variables=["k"])["result"], "(k - 1)*(k + 1)")

    def test_eigenvectors_and_nullspace(self):
        eigen = matrix("eigenvectors", "[[2, 1], [1, 2]]")
        self.assertEqual(eigen["result"], "autovalore 1 (molteplicità 1): [-1, 1]; autovalore 3 (molteplicità 1): [1, 1]")
        self.assertTrue(eigen["diagonalizable"])
        self.assertEqual(matrix("eigenvalues", "[[0, -1], [1, 0]]")["note"], "alcuni autovalori non sono reali")
        self.assertEqual(matrix("nullspace", "[[1, 2], [2, 4]]")["result"], "base del nucleo: [-2, 1]")
        self.assertEqual(matrix("rref", "[[1, 2, 3], [2, 4, 7]]")["pivot_columns"], [1, 3])

    def test_products_and_shapes(self):
        self.assertEqual(matrix("multiply", "[[1, 2], [3, 4]]", "[[0, 1], [1, 0]]")["result"], "Matrix([[2, 1], [4, 3]])")
        with self.assertRaisesRegex(ValueError, "non sono compatibili"):
            matrix("multiply", "[[1, 2]]", "[[1, 2]]")
        with self.assertRaisesRegex(ValueError, "stessa lunghezza"):
            matrix("determinant", "[[1, 2], [3]]")

    def test_linear_systems_follow_rouche_capelli(self):
        unique = matrix("linear_system", "[[1, 1], [1, -1]]", "[3, 1]")
        self.assertEqual((unique["result"], unique["unknowns"]), ("{(2, 1)}", ["x1", "x2"]))
        infinite = matrix("linear_system", "[[1, 1], [2, 2]]", "[2, 4]", variables=["x", "y"])
        self.assertEqual((infinite["result"], infinite["free_parameters"]), ("{(2 - y, y)}", 1))
        impossible = matrix("linear_system", "[[1, 1], [2, 2]]", "[2, 5]")
        self.assertEqual((impossible["result"], impossible["rank"], impossible["augmented_rank"]), ("EmptySet", 1, 2))

    def test_vectors(self):
        self.assertEqual(matrix("dot", "[1, 2, 3]", "[4, 5, 6]")["result"], "32")
        self.assertEqual(matrix("cross", "[1, 0, 0]", "[0, 1, 0]")["result"], "(0, 0, 1)")
        self.assertEqual(matrix("norm", "[3, 4]")["result"], "5")


class AdvancedCalculusTests(TestCase):
    def test_series_convergence(self):
        def total(expression, lower="1", upper="oo"):
            return _calculate(MathRequest(operation="sum", expressions=[expression], variables=["n"], lower=lower, upper=upper))

        basel = total("1/n**2")
        self.assertEqual((basel["result"], basel["convergent"]), ("pi**2/6", True))
        self.assertEqual(total("1/n")["result"], "La serie diverge a +∞.")
        self.assertEqual(total("(-1)**n")["result"], "La serie non converge.")
        gauss = _calculate(MathRequest(operation="sum", expressions=["k"], variables=["k", "n"], lower="1", upper="n"))
        self.assertEqual(gauss["result"], "n*(n + 1)/2")

    def test_differential_equations(self):
        general = _calculate(MathRequest(operation="ode", expressions=["y'' + y = 0"], variables=["x", "y"]))
        self.assertEqual(general["result"], "Eq(y(x), C1*sin(x) + C2*cos(x))")
        cauchy = _calculate(MathRequest(
            operation="ode", expressions=["y'' + y = 0"], variables=["x", "y"], conditions=["y(0)=1", "y'(0)=0"],
        ))
        self.assertEqual(cauchy["result"], "Eq(y(x), cos(x))")
        separable = _calculate(MathRequest(operation="ode", expressions=["y′ = x*y"], variables=["x", "y"]))
        self.assertEqual(separable["result"], "Eq(y(x), C1*exp(x**2/2))")
        with self.assertRaisesRegex(ValueError, "funzione incognita"):
            _calculate(MathRequest(operation="ode", expressions=["y' = y"], variables=["x"]))

    def test_multiple_integrals_and_partial_derivatives(self):
        triangle = _calculate(MathRequest(
            operation="integral", expressions=["x*y"], variables=["y", "x"], bounds=[["0", "x"], ["0", "1"]],
        ))
        self.assertEqual(triangle["result"], "1/8")
        mixed = _calculate(MathRequest(
            operation="derivative", expressions=["x**2*y**3"], variables=["x", "y"], partials=["x", "y"],
        ))
        self.assertEqual(mixed["result"], "6*x*y**2")
        gradient = _calculate(MathRequest(operation="gradient", expressions=["x**2*y + y**3"], variables=["x", "y"]))
        self.assertEqual(gradient["result"], "(2*x*y, x**2 + 3*y**2)")
        hessian = _calculate(MathRequest(operation="hessian", expressions=["x**2 + x*y + y**2"], variables=["x", "y"]))
        self.assertEqual((hessian["result"], hessian["determinant"]), ("Matrix([[2, 1], [1, 2]])", "3"))

    def test_critical_points_are_classified(self):
        def extrema(expression, *variables):
            return _calculate(MathRequest(operation="extrema", expressions=[expression], variables=list(variables)))["result"]

        self.assertEqual(
            extrema("x**3 - 3*x*y + y**3", "x", "y"),
            "(0, 0): punto di sella, valore 0; (1, 1): minimo relativo, valore -1",
        )
        self.assertEqual(extrema("x**3 - 3*x", "x"), "-1: massimo relativo, valore 2; 1: minimo relativo, valore -2")
        self.assertEqual(extrema("x**3", "x"), "0: flesso a tangente orizzontale, valore 0")

    def test_limits_in_two_variables(self):
        def limit(expression, point="(0, 0)"):
            return _calculate(MathRequest(operation="limit", expressions=[expression], variables=["x", "y"], point=point))

        lines = limit("x*y/(x**2+y**2)")
        self.assertTrue(lines["result"].startswith("Il limite non esiste"))
        self.assertEqual(lines["paths"]["rette y = m*x"], "m/(m**2 + 1)")
        # Zero along every line, but 1/2 along the parabola y = x**2.
        self.assertTrue(limit("x**2*y/(x**4+y**2)")["result"].startswith("Il limite non esiste"))
        candidate = limit("x**2*y/(x**2+y**2)")
        self.assertEqual(candidate["result"], "0")
        self.assertIn("maggiorazione", candidate["coverage"])
        continuous = limit("x*y + 1", "(1, 2)")
        self.assertEqual((continuous["result"], continuous["method"]), ("3", "continuità"))


class StatisticsTests(TestCase):
    def test_summary_statistics(self):
        result = _calculate(MathRequest(operation="statistics", expressions=["[2, 4, 4, 4, 5, 5, 7, 9]"]))
        stats = {key: entry["value"] for key, entry in result["statistics"].items()}
        self.assertEqual(
            {key: stats[key] for key in ("mean", "median", "mode", "variance", "standard_deviation", "sample_variance")},
            {"mean": "5", "median": "9/2", "mode": "4", "variance": "4", "standard_deviation": "2", "sample_variance": "32/7"},
        )

    def test_frequencies_and_missing_mode(self):
        weighted = _calculate(MathRequest(operation="statistics", expressions=["[1, 2, 3]", "[2, 5, 3]"]))
        self.assertEqual(weighted["statistics"]["mean"]["value"], "21/10")
        self.assertEqual(weighted["statistics"]["count"]["value"], "10")
        uniform = _calculate(MathRequest(operation="statistics", expressions=["[1, 2, 3, 4]"]))
        self.assertEqual(uniform["statistics"]["mode"]["value"], "nessuna")
        with self.assertRaisesRegex(ValueError, "interi non negativi"):
            _calculate(MathRequest(operation="statistics", expressions=["[1, 2]", "[1, -1]"]))

    def test_combinatorics(self):
        self.assertEqual(_calculate(MathRequest(operation="evaluate", expressions=["comb(5, 2) + perm(5, 2)"]))["result"], "30")


class MathWorkerTests(TestCase):
    def test_tool_runs_the_calculation_in_a_separate_process(self):
        content, artifact = calculate_math.func(operation="solve", expressions=["x**2-4>0"], variables=["x"])
        self.assertEqual(artifact["status"], "ok")
        self.assertEqual(artifact["result"], "Union(Interval.open(-oo, -2), Interval.open(2, oo))")
        self.assertIn('"status": "ok"', content)


class MathFlowTests(IsolatedAsyncioTestCase):
    async def test_calculates_before_writing_latex(self):
        transcription = AsyncMock()
        transcription.ainvoke.return_value = AIMessage(content="", tool_calls=[{
            "id": "math-1",
            "name": "calculate_math",
            "args": {
                "operation": "limit", "expressions": ["(exp(x)-1-x)/x**2"],
                "variables": ["x"], "point": "0",
            },
        }])
        writing = AsyncMock()
        writing.ainvoke.return_value = AIMessage(content="", tool_calls=[{
            "id": "write-1", "name": "write_latex", "args": {"formulas": [r"\frac{1}{2}"]},
        }])
        client = Mock()
        client.bind_tools.side_effect = [transcription, writing]

        with patch("src.core.agent.model", return_value=client):
            answer = await answer_selection("Risolvimi questo limite in LaTeX", "image-of-limit", can_write=True)

        self.assertEqual(
            [call.kwargs["tool_choice"] for call in client.bind_tools.call_args_list],
            ["calculate_math", "write_latex"],
        )
        final_messages = writing.ainvoke.await_args.args[0]
        self.assertIn('"result": "1/2"', final_messages[-1].text)
        self.assertNotIn("image-of-limit", str(final_messages))
        self.assertEqual(answer.writes[0].content, r"\frac{1}{2}")
        self.assertEqual(answer.write_style, "solution")

    async def test_asks_for_clarification_without_writing(self):
        client = Mock()
        client.bind_tools.return_value.ainvoke = AsyncMock(return_value=AIMessage(
            content="", tool_calls=[{
                "id": "clarify-1", "name": "calculate_math",
                "args": {"operation": "clarify", "clarification": "Qual è il denominatore?"},
            }],
        ))
        with patch("src.core.agent.model", return_value=client):
            answer = await answer_selection("Risolvimi questo esercizio", "partial-image", can_write=True)
        client.bind_tools.assert_called_once()
        self.assertEqual(answer.response, "Qual è il denominatore?")
        self.assertEqual(answer.writes, [])
