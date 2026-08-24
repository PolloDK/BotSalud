# backend/services/ai_service.py
import json
from openai import OpenAI
from config import settings

client = OpenAI(api_key=settings.openai_api_key)

SYSTEM_PROMPT = """Eres un asistente de salud personal experto en nutrición, entrenamiento y composición corporal.
Tu usuario está en proceso de recomposición corporal. Responde siempre en español, de forma concisa y práctica.
Usa los datos de salud del usuario para dar respuestas precisas y personalizadas.
No inventes datos — si no tienes la información, dilo."""

def answer_question(question: str, snapshots: list, history: list, objective: str) -> str:
    data_summary = json.dumps(snapshots[-7:], ensure_ascii=False, default=str)
    messages = [
        {"role": "system", "content": f"{SYSTEM_PROMPT}\n\nObjetivo del usuario: {objective}\n\nDatos recientes (últimos 7 días):\n{data_summary}"},
        *history,
        {"role": "user", "content": question}
    ]
    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=messages,
        max_tokens=500,
        temperature=0.7
    )
    return response.choices[0].message.content

def generate_report(snapshots: list, objective: str, target_weight: float | None, target_date: str | None) -> str:
    data_summary = json.dumps(snapshots, ensure_ascii=False, default=str)
    prompt = f"""Genera un reporte semanal de salud completo y motivador para el usuario.

Objetivo: {objective}
Peso objetivo: {target_weight} kg para {target_date}

Datos de la semana:
{data_summary}

El reporte debe incluir (en este orden):
1. 📊 Progreso de peso y composición corporal (vs objetivo y vs semana anterior)
2. 💪 Resumen de entrenamiento (sesiones, volumen, consistencia)
3. 🥗 Nutrición (calorías y macros promedio, días dentro del objetivo, déficit acumulado)
4. 🚶 Actividad general (pasos, sueño, minutos activos)
5. 🎯 Proyección: a este ritmo, ¿llegas al objetivo en la fecha?
6. ✅ 3 recomendaciones concretas para la próxima semana

Usa emojis, sé directo y motivador. Si faltan datos de alguna sección, omítela con gracia."""

    response = client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": prompt}
        ],
        max_tokens=1200,
        temperature=0.7
    )
    return response.choices[0].message.content
