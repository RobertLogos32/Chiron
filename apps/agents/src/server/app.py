from base64 import b64decode
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from openai import APIError, RateLimitError
from pydantic import BaseModel, Field

from ..core.agent import AgentConfigurationError, answer_selection
from ..core.tools.cursor_tools import SelectionAnswer, SelectionGuide

load_dotenv(Path(__file__).resolve().parents[2] / ".env")

app = FastAPI()
PNG_PREFIX = "data:image/png;base64,"
PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"


class SelectionRequest(BaseModel):
    prompt: str = Field(min_length=1, max_length=4000)
    image: str = Field(max_length=13 * 1024 * 1024)
    guide: SelectionGuide | None = None
    can_write: bool = False


def validate_png(image: str):
    if not image.startswith(PNG_PREFIX):
        raise ValueError("Unsupported image format")
    data = b64decode(image[len(PNG_PREFIX):], validate=True)
    if not data.startswith(PNG_SIGNATURE):
        raise ValueError("Invalid PNG")


@app.post("/api/ai/selection")
async def explain_selection(request: SelectionRequest) -> SelectionAnswer:
    prompt = request.prompt.strip()
    if not prompt:
        raise HTTPException(422, "Scrivi un messaggio per l'assistente.")

    try:
        validate_png(request.image)
        if request.guide:
            validate_png(request.guide.image)
    except ValueError as error:
        raise HTTPException(422, "Lo screenshot deve essere un'immagine PNG.") from error

    try:
        reply = await answer_selection(prompt, request.image, request.guide, request.can_write)
    except AgentConfigurationError as error:
        raise HTTPException(503, str(error)) from error
    except RateLimitError as error:
        raise HTTPException(429, "Limite di richieste raggiunto. Riprova tra poco.") from error
    except APIError as error:
        raise HTTPException(502, "Il fornitore AI non ha risposto correttamente.") from error

    if not reply.response and not reply.annotations and not reply.writes:
        raise HTTPException(502, "Il modello ha restituito una risposta vuota.")
    return reply
