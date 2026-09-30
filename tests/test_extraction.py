import json

import pytest

import medsync_rag as rag


class RecordingLLM:
    """Stands in for ChatOpenAI: records constructor kwargs and invoked messages."""

    instances: list["RecordingLLM"] = []
    reply: str = "{}"
    error: Exception | None = None

    def __init__(self, **kwargs):
        self.kwargs = kwargs
        self.messages = None
        RecordingLLM.instances.append(self)

    def invoke(self, messages):
        self.messages = messages
        if RecordingLLM.error:
            raise RecordingLLM.error
        return type("Msg", (), {"content": RecordingLLM.reply})()


@pytest.fixture
def llm(monkeypatch):
    RecordingLLM.instances = []
    RecordingLLM.reply = "{}"
    RecordingLLM.error = None
    monkeypatch.setattr(rag, "ChatOpenAI", RecordingLLM)
    rag._classify_intent_cached.cache_clear()
    return RecordingLLM


REPORT_TEXT = "City Labs CBC\nPatient: Asha Rao\nHemoglobin 10.9 g/dL (12-15) LOW\n" * 3


def test_text_extraction_keeps_raw_text_locally_and_has_room_to_answer(llm):
    llm.reply = json.dumps(
        {
            "patient_name": "Asha Rao",
            "report_date": "2026-03-01",
            "report_type": "CBC",
            "diagnoses": [],
            "medications": [],
            "lab_results": [{"name": "Hemoglobin", "value": "10.9", "unit": "g/dL", "reference_range": "12-15", "flag": "LOW"}],
            "doctor_notes": "",
        }
    )

    result = rag._extract_structured_report_from_text(rag.MedSyncConfig(), REPORT_TEXT, source="cbc.pdf")

    assert result["patient_name"] == "Asha Rao"
    assert result["lab_results"][0]["value"] == "10.9"
    # raw_text comes from PyMuPDF, not from the model echoing it back.
    assert result["raw_text"] == REPORT_TEXT.strip()
    (instance,) = llm.instances
    assert instance.kwargs["max_tokens"] >= 2000
    system_prompt = instance.messages[0].content
    assert "raw_text" not in system_prompt


def test_text_extraction_failure_returns_empty_report(llm):
    llm.error = RuntimeError("API down")
    result = rag._extract_structured_report_from_text(rag.MedSyncConfig(), REPORT_TEXT, source="cbc.pdf")
    assert result == rag._default_structured_report()


def test_vision_extraction_uses_high_detail(llm):
    llm.reply = json.dumps({"patient_name": "Asha Rao"})

    result = rag._extract_structured_report_from_image_b64_with_vision(rag.MedSyncConfig(), "QUJD")

    assert result["patient_name"] == "Asha Rao"
    content = llm.instances[0].messages[0].content
    image_part = next(part for part in content if part["type"] == "image_url")
    assert image_part["image_url"]["detail"] == "high"


def test_classifier_failure_falls_back_to_retrieval(llm):
    llm.error = RuntimeError("API down")
    assert rag._classify_intent(rag.MedSyncConfig(), "what is my LDL?") == "RETRIEVAL"


def test_classifier_uses_configured_router_model(llm):
    llm.reply = "GENERAL_MEDICAL"
    cfg = rag.MedSyncConfig(router_model="router-x")

    assert rag._classify_intent(cfg, "what is a normal LDL?") == "GENERAL_MEDICAL"
    assert llm.instances[0].kwargs["model"] == "router-x"


def test_greeting_skips_the_classifier(llm):
    assert rag._classify_intent(rag.MedSyncConfig(), "hello") == "CONVERSATIONAL"
    assert llm.instances == []


def test_router_model_read_from_env(monkeypatch):
    monkeypatch.setenv("MEDSYNC_ROUTER_MODEL", "router-y")
    assert rag.load_config().router_model == "router-y"
