from functools import lru_cache
from os import environ
import re

from langchain_core.messages import HumanMessage, ToolMessage
from langchain_openai import ChatOpenAI
from langgraph.graph import END, START, MessagesState, StateGraph
from langgraph.prebuilt import ToolNode, tools_condition
from langgraph.runtime import Runtime

from .promts.system_promt import SYSTEM_MESSAGE
from .tools.cursor_tools import (
    SelectionAnswer,
    SelectionContext,
    SelectionGuide,
    explain_regions,
    write_board_solution,
    write_latex,
)


class AgentConfigurationError(RuntimeError):
    pass


@lru_cache(maxsize=1)
def model() -> ChatOpenAI:
    key = environ.get("OPENROUTER_API_KEY", "").strip()
    if not key:
        raise AgentConfigurationError("Configura OPENROUTER_API_KEY per il servizio AI.")
    return ChatOpenAI(
        api_key=key,
        base_url=environ.get("AI_BASE_URL", "https://openrouter.ai/api/v1"),
        model=environ.get("AI_MODEL", "openrouter/free"),
        use_responses_api=False,
        timeout=60,
        max_retries=0,
    )


async def assistant(state: MessagesState, runtime: Runtime[SelectionContext]):
    llm = model()
    write_tool = runtime.context["write_tool"]
    if write_tool:
        tool = write_latex if write_tool == "write_latex" else write_board_solution
        reply = await llm.bind_tools([tool], tool_choice=tool.name).ainvoke(
            [SYSTEM_MESSAGE, *state["messages"]]
        )
        return {"messages": [reply]}

    tools = []
    if runtime.context["regions"]:
        tools.append(explain_regions)
    if runtime.context["can_write"]:
        tools.extend([write_board_solution, write_latex])
    sender = llm.bind_tools(tools) if tools else llm
    reply = await sender.ainvoke([SYSTEM_MESSAGE, *state["messages"]])
    return {"messages": [reply]}


builder = StateGraph(MessagesState, context_schema=SelectionContext)
builder.add_node("assistant", assistant)
builder.add_node(
    "tools",
    ToolNode([explain_regions, write_board_solution, write_latex], handle_tool_errors=True),
)
builder.add_edge(START, "assistant")
builder.add_conditional_edges("assistant", tools_condition)
builder.add_edge("tools", END)
graph = builder.compile()


def selection_context(
    prompt: str, guide: SelectionGuide | None, can_write: bool
) -> SelectionContext:
    text = prompt.casefold()
    in_reply = re.search(
        r"\brispondi(?:mi)?(?:\s+solo)?\s+(?:qui|qua)\b"
        r"|\b(?:rispondi\w*|scrivi\w*)\b[^.!?]{0,50}\b(?:in chat|nella risposta)\b"
        r"|\bnon\s+(?:scrivere|scrivermi)\b"
        r"|\bnon\s+(?:inserire|mettere)\b[^.!?]{0,40}\blavagna\b",
        text,
    )
    writable = can_write and not in_reply
    solve = re.search(r"\b(?:risolvi(?:mi|lo|la)?|risolvermi|solve|soluzione completa)\b", text)
    direct_write = r"scrivi(?:mi|lo|la|li|le)?|scrivermi|write"
    write_verb = rf"(?:{direct_write}|(?:inserisci|aggiungi|riporta|metti)(?:mi|lo|la|li|le)?)"
    write = re.search(rf"\b{write_verb}\b", text)
    board_place = re.search(r"\b(?:lavagna|qui|qua|sotto|accanto)\b", text)
    write_on_board = write and (board_place or re.search(rf"\b(?:{direct_write})\b", text))
    below = re.search(
        rf"\b(?:qui|qua|subito|proprio|direttamente|{write_verb})\s+sotto\b"
        r"|\bsotto\s+(?:la\s+|il\s+|al\s+|l['’])?(?:selezione|ritaglio|formula|limite|esercizio)\b",
        text,
    )
    if not (solve or write) and re.search(r"\b(?:spiega\w*|explain)\b", text):
        writable = False
    write_tool = None
    if writable and (solve or write) and re.search(r"\b(?:latex|latecs)\b", text):
        write_tool = "write_latex"
    elif writable and (solve or write_on_board):
        write_tool = "write_board_solution"
    return {
        "regions": guide.regions if guide and not write_tool else [],
        "can_write": writable,
        "write_tool": write_tool,
        "write_placement": "below" if write_tool and below else None,
        "write_style": "solution" if solve else "note",
    }


async def answer_selection(
    prompt: str,
    image: str,
    guide: SelectionGuide | None = None,
    can_write: bool = False,
) -> SelectionAnswer:
    context = selection_context(prompt, guide, can_write)
    content = [
        {"type": "text", "text": prompt},
        {"type": "image_url", "image_url": {"url": image}},
    ]
    if guide and context["regions"]:
        content.extend([
            {"type": "text", "text": (
                "La prossima immagine è la guida dei simboli del ritaglio, in ordine di lettura. "
                "Il numero sopra ogni simbolo è il suo ID. Per explain_regions usa gli ID "
                f"da 1 a {len(guide.regions)}."
            )},
            {"type": "image_url", "image_url": {"url": guide.image}},
        ])
    result = await graph.ainvoke(
        {"messages": [HumanMessage(content=content)]},
        context=context,
    )
    messages = result["messages"]
    answers = [
        SelectionAnswer.model_validate(reply.artifact)
        for reply in messages
        if isinstance(reply, ToolMessage) and isinstance(reply.artifact, dict)
    ]
    if answers:
        return SelectionAnswer(
            response="\n\n".join(answer.response for answer in answers if answer.response),
            annotations=[step for answer in answers for step in answer.annotations][:8],
            writes=(
                [write for answer in answers for write in answer.writes][:16]
                if context["can_write"] else []
            ),
            write_placement=context["write_placement"],
            write_style=context["write_style"],
        )

    reply = messages[-1]
    if isinstance(reply, ToolMessage) or not reply.text.strip():
        fallback = HumanMessage(content="Rispondi in testo semplice con la spiegazione.")
        reply = await model().ainvoke([SYSTEM_MESSAGE, HumanMessage(content=content[:2]), fallback])
    return SelectionAnswer(response=reply.text.strip())
