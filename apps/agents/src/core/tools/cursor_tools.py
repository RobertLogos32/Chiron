from typing import Annotated, Literal, TypedDict

from langchain_core.tools import tool
from langgraph.graph import MessagesState
from langgraph.prebuilt import ToolRuntime
from pydantic import BaseModel, Field, StringConstraints, model_validator


Coordinate = Annotated[int, Field(ge=0, le=1000)]
WriteStyle = Literal["note", "solution"]


class RegionBounds(BaseModel):
    left: Coordinate
    top: Coordinate
    right: Coordinate
    bottom: Coordinate

    @model_validator(mode="after")
    def validate_rectangle(self):
        if self.right <= self.left or self.bottom <= self.top:
            raise ValueError("Ogni riquadro deve avere larghezza e altezza positive.")
        return self


class ExplainedRegion(RegionBounds):
    explanation: str


class SelectionGuide(BaseModel):
    image: str = Field(max_length=2 * 1024 * 1024)
    regions: list[RegionBounds] = Field(min_length=1, max_length=64)


class SelectionContext(TypedDict):
    regions: list[RegionBounds]
    can_write: bool
    write_tool: Literal["write_board_solution", "write_latex"] | None
    write_placement: Literal["below"] | None
    write_style: WriteStyle


class RegionExplanation(BaseModel):
    region_ids: list[Annotated[int, Field(ge=1, le=64)]] = Field(
        min_length=1,
        max_length=64,
        description="Numeri consecutivi dei riquadri da raggruppare. Gli ID partono da 1.",
    )
    explanation: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=600)]


class BoardWrite(BaseModel):
    kind: Literal["text", "latex"]
    content: str


class SelectionAnswer(BaseModel):
    response: str
    annotations: list[ExplainedRegion] = Field(default_factory=list)
    writes: list[BoardWrite] = Field(default_factory=list)
    write_placement: Literal["below"] | None = None
    write_style: WriteStyle = "note"


@tool(response_format="content_and_artifact")
def explain_regions(
    response: Annotated[str, Field(min_length=1, description="Breve spiegazione generale nella lingua della domanda.")],
    annotations: Annotated[list[RegionExplanation], Field(min_length=1, max_length=8)],
    runtime: ToolRuntime[SelectionContext, MessagesState],
) -> tuple[str, dict]:
    """Collega i simboli della guida numerata alle rispettive spiegazioni.

    Per ogni passaggio indica i numeri dei riquadri vicini che contengono
    esattamente i simboli spiegati. Usa la lingua della domanda.
    """
    regions = runtime.context["regions"]
    boxes = []
    paragraphs = [response.strip()]
    for step in annotations:
        ids = sorted(set(step.region_ids))
        if ids[-1] > len(regions) or len(ids) != ids[-1] - ids[0] + 1:
            paragraphs.append(step.explanation)
            continue
        sources = [regions[index - 1] for index in ids]
        boxes.append(
            ExplainedRegion(
                left=min(box.left for box in sources),
                top=min(box.top for box in sources),
                right=max(box.right for box in sources),
                bottom=max(box.bottom for box in sources),
                explanation=step.explanation,
            )
        )

    answer = SelectionAnswer(response="\n\n".join(filter(None, paragraphs)), annotations=boxes)
    return answer.response, answer.model_dump()


@tool(response_format="content_and_artifact")
def write_board_solution(
    solution: Annotated[
        str,
        StringConstraints(strip_whitespace=True, max_length=12000),
    ],
    clarification: Annotated[str, Field(max_length=600)] = "",
) -> tuple[str, dict]:
    """Scrivi del testo in una zona libera della lavagna.

    Usa testo semplice nella lingua della richiesta. Genera direttamente gli esercizi
    o gli appunti richiesti. Per gli esercizi nuovi aggiungi le risposte solo se sono
    richieste. Per una soluzione includi passaggi, calcoli e risultato finale.
    Evita Markdown e delimitatori TeX. Se manca un dato indispensabile per svolgere
    un esercizio esistente, lascia solution vuoto e chiedilo in clarification.
    """
    answer = (
        SelectionAnswer(response="", writes=[BoardWrite(kind="text", content=solution)])
        if solution
        else SelectionAnswer(response=clarification.strip() or "Seleziona l'esercizio completo.")
    )
    return answer.response or "Testo pronto per la lavagna.", answer.model_dump()


@tool(response_format="content_and_artifact")
def write_latex(
    formulas: Annotated[
        list[Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=4000)]],
        Field(max_length=12),
    ],
    clarification: Annotated[str, Field(max_length=600)] = "",
) -> tuple[str, dict]:
    """Aggiungi formule LaTeX impaginate sulla lavagna in una zona libera.

    Passa una formula per elemento, nell'ordine di scrittura. Usa sintassi
    matematica LaTeX senza delimitatori in dollari, blocchi di codice o Markdown.
    Per i passaggi allineati puoi usare l'ambiente aligned.
    Se la formula non è leggibile, passa formulas vuoto e chiedi chiarimenti.
    """
    answer = SelectionAnswer(
        response="" if formulas else clarification.strip() or "Quale formula devo scrivere?",
        writes=[BoardWrite(kind="latex", content=formula) for formula in formulas],
    )
    return "Formule pronte per la lavagna.", answer.model_dump()
