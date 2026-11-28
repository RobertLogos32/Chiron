import asyncio
import math
import re
import time
from base64 import b64decode
from contextlib import asynccontextmanager
from pathlib import Path
from threading import Thread

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from openai import APIError, RateLimitError
from pydantic import BaseModel, Field

from ..core.agent import AgentConfigurationError, answer_selection
from ..core.tools.cursor_tools import SelectionAnswer, SelectionGuide, SelectionSource
from ..core.tools.math_tools import warm_calculator

load_dotenv(Path(__file__).resolve().parents[2] / ".env")


@asynccontextmanager
async def lifespan(_: FastAPI):
    # The calculator imports sympy in its own process: start it before the first request.
    Thread(target=warm_calculator, daemon=True).start()
    yield


app = FastAPI(lifespan=lifespan)
PNG_PREFIX = "data:image/png;base64,"
PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"
DISCONNECT_POLL = 0.25


class SelectionRequest(BaseModel):
    prompt: str = Field(min_length=1, max_length=4000)
    image: str = Field(max_length=13 * 1024 * 1024)
    guide: SelectionGuide | None = None
    can_write: bool = False
    source: SelectionSource | None = None


def validate_png(image: str):
    if not image.startswith(PNG_PREFIX):
        raise ValueError("Unsupported image format")
    data = b64decode(image[len(PNG_PREFIX):], validate=True)
    if not data.startswith(PNG_SIGNATURE):
        raise ValueError("Invalid PNG")


def _wait_seconds(error: RateLimitError) -> float | None:
    """The wait the provider asks for, from Retry-After, its reset header or its message."""
    headers = error.response.headers if error.response is not None else {}
    retry = headers.get("retry-after")
    if retry:
        try:
            return float(retry)
        except ValueError:
            pass
    reset = headers.get("x-ratelimit-reset")
    if reset and reset.isdigit():
        # OpenRouter sends the reset time in milliseconds since the epoch.
        return max(0.0, int(reset) / 1000 - time.time())
    match = re.search(r"try again in\s+(?:(\d+)h)?\s*(?:(\d+)m(?!s))?\s*(?:([\d.]+)s)?", str(error), re.IGNORECASE)
    if match and any(match.groups()):
        hours, minutes, seconds = (float(part or 0) for part in match.groups())
        return hours * 3600 + minutes * 60 + seconds
    return None


def _duration(seconds: float) -> str:
    if seconds < 90:
        return f"{max(1, math.ceil(seconds))} secondi"
    if seconds < 90 * 60:
        return f"circa {math.ceil(seconds / 60)} minuti"
    return f"circa {math.ceil(seconds / 3600)} ore"


def rate_limit_message(error: RateLimitError) -> tuple[str, float | None]:
    """Tell a daily quota apart from a per-minute limit, with the wait the provider asks for."""
    text = str(error).casefold()
    wait = _wait_seconds(error)
    daily = bool(re.search(r"per[ -]day|\b(?:tpd|rpd)\b|daily|giornalier", text))
    if daily:
        message = "Hai esaurito il limite giornaliero del fornitore AI."
        message += f" Si libera tra {_duration(wait)}." if wait else " Riprova domani o cambia fornitore."
        return message, wait
    if wait:
        return f"Limite di richieste al minuto raggiunto. Riprova tra {_duration(wait)}.", wait
    return "Limite di richieste raggiunto. Riprova tra poco.", None


async def _until_disconnect(request: Request):
    while not await request.is_disconnected():
        await asyncio.sleep(DISCONNECT_POLL)


@app.post("/api/ai/selection")
async def explain_selection(body: SelectionRequest, request: Request) -> SelectionAnswer:
    prompt = body.prompt.strip()
    if not prompt:
        raise HTTPException(422, "Scrivi un messaggio per l'assistente.")

    try:
        validate_png(body.image)
        if body.guide:
            validate_png(body.guide.image)
    except ValueError as error:
        raise HTTPException(422, "Lo screenshot deve essere un'immagine PNG.") from error

    # Cancel the provider call as soon as the client gives up on the request.
    work = asyncio.ensure_future(answer_selection(prompt, body.image, body.guide, body.can_write, body.source))
    watcher = asyncio.ensure_future(_until_disconnect(request))
    try:
        await asyncio.wait({work, watcher}, return_when=asyncio.FIRST_COMPLETED)
    finally:
        watcher.cancel()
    if not work.done():
        work.cancel()
        try:
            await work
        except (asyncio.CancelledError, Exception):
            pass
        raise HTTPException(499, "Richiesta annullata dal client.")

    try:
        reply = work.result()
    except AgentConfigurationError as error:
        raise HTTPException(503, str(error)) from error
    except RateLimitError as error:
        message, wait = rate_limit_message(error)
        headers = {"Retry-After": str(math.ceil(wait))} if wait else None
        raise HTTPException(429, message, headers=headers) from error
    except APIError as error:
        raise HTTPException(502, "Il fornitore AI non ha risposto correttamente.") from error

    if not reply.response and not reply.annotations and not reply.writes:
        raise HTTPException(502, "Il modello ha restituito una risposta vuota.")
    return reply
