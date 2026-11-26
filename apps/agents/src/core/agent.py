from functools import lru_cache
from os import environ

from langchain_core.messages import HumanMessage
from langchain_openai import ChatOpenAI
from langgraph.graph import END, START, MessagesState, StateGraph

from .promts.system_promt import SYSTEM_MESSAGE


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


async def assistant(state: MessagesState):
    reply = await model().ainvoke([SYSTEM_MESSAGE, *state["messages"]])
    return {"messages": [reply]}


builder = StateGraph(MessagesState)
builder.add_node("assistant", assistant)
builder.add_edge(START, "assistant")
builder.add_edge("assistant", END)
graph = builder.compile()


async def answer_selection(prompt: str, image: str) -> str:
    message = HumanMessage(
        content=[
            {"type": "text", "text": prompt},
            {"type": "image_url", "image_url": {"url": image}},
        ],
    )
    result = await graph.ainvoke({"messages": [message]})
    return result["messages"][-1].text.strip()
