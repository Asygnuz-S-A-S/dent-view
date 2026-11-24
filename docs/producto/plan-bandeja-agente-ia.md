# Plan: bandeja omnicanal nativa + agente de IA por centro (2026-11-24)

Resumen del análisis (analista; fuentes públicas citadas en el informe original; lo no verificado está marcado abajo).

## Decisión
Construir NATIVO en dent-view (no embeber Chatwoot). Chatwoot (MIT, salvo carpeta `enterprise/`) solo se usa como referencia funcional; no se copia código (Ruby/Vue) ni se lee Captain. Otras plataformas de agentes (Dify, n8n, Typebot, Botpress) tienen licencias que impiden copiar: solo inspiración de comportamiento.

## Condiciones de plataforma
- WhatsApp prohíbe asistentes de IA de propósito general (cláusula 4.7 de los términos de WhatsApp Business Platform); un bot del propio negocio (FAQ, agendar, escalar a humano) está permitido. El agente debe negarse a lo que no sea tema del centro y siempre ofrecer escalamiento a humano.
- WhatsApp prohíbe pedir documento de identidad completo y restringe información de salud: el agente NUNCA pide cédula ni síntomas por chat; envía enlaces seguros (autoagendamiento, valoración virtual, resultados con código).
- "Conectar con ChatGPT/Claude" = usar sus API (Anthropic Messages, OpenAI), no cuentas de consumo.

## Arquitectura
- Pipeline: webhook público por canal (cuerpo crudo, firma X-Hub-Signature-256 en tiempo constante) → EventoCanal idempotente (unique tipoCanal+idExterno) → 200 inmediato → worker con cola SKIP LOCKED → Conversacion/MensajeChat → agente (un solo hilo por conversación con advisory lock; espera 3–4 s para agrupar mensajes) → adaptador de canal. Tiempo real: SSE + LISTEN/NOTIFY de Postgres (sin Redis; `pg` ya instalado).
- Modelos nuevos: CanalCentro (credenciales cifradas), EventoCanal, ContactoChat, IdentidadCanal (BSUID/teléfono/correo/visitante), Conversacion, MensajeChat (NO `Mensaje`: ya existe), RespuestaGuardada, AgenteIA, VersionAgente (inmutable al publicar), ArticuloConocimiento, FragmentoConocimiento (pgvector, fase 2), MemoriaContacto (fase 2), EjecucionAgente (trazas y costo), CasoPrueba (evals).
- Agente: abstracción ProveedorLLM (Anthropic + OpenAI); Haiku 5.5 por defecto, Sonnet 5.5 para casos complejos (enrutamiento en código), Opus 5.5 solo para el asistente de configuración; NO usar Fable 5 en chat. Llave de plataforma en v1 con presupuesto mensual y topes por conversación; BYOK en fase 3. v1 sin vectores: catálogo+FAQ+políticas dentro del prompt cacheado.
- Herramientas v1: consultar_catalogo, consultar_horario, consultar_disponibilidad (si hay agenda pública), solicitar_cita (enlace o tarea CRM), crear_o_actualizar_lead, escalar_a_humano, registrar_nota. Por defecto SIN acceso a historia clínica, informes ni estudios.
- Reglas fijas en código: no diagnostica ni receta; avisa que es asistente virtual; escala si piden humano o hay palabras de urgencia; no da precios fuera del catálogo; guardas post-generación (montos vs catálogo) que dejan la respuesta como borrador. Modos por canal e intención: BORRADOR | APROBACION | AUTONOMO (iniciar en APROBACION).
- Asistente de configuración: propone cambios (FAQ, reglas, skills, tono) como borrador de versión, se prueba contra evals y exige confirmación del admin.
- Canales: WhatsApp Cloud API (modo APP_PROPIA del centro para el piloto; Tech Provider con Embedded Signup v4 en fase 3), chat web propio (iframe /widget + origen permitido + CSP propia), fase 2 Messenger/Instagram (App Review, etiqueta HUMAN_AGENT), correo entrante (Resend Inbound), Telegram solo a demanda.
- Caddy: excepción de tamaño (webhooks Meta hasta 3 MB; hoy /api/* limita a 2 MB) y CSP propia para /widget/*.
- Roles: gestión y especialista asignado; nunca doctor_remitente; configuración solo admin.

## Fases
F0 prerrequisitos (verificación de negocio ante Meta, WABA del piloto, DPA y aviso de privacidad). F1 piloto (XL, 6–8 semanas con 4–5 agentes): WhatsApp APP_PROPIA + chat web + bandeja + agente FAQ/catálogo/captar lead/solicitar cita/escalar en modo APROBACION + playground/evals + trazas y presupuesto + SSE. F2 (L): Messenger/IG/correo, documentos con pgvector, memoria, plantillas WhatsApp en secuencias CRM, link de pago y estado de orden por chat, CSAT, reportes, asistente de configuración. F3 (L): Tech Provider, asignación automática/SLA/macros, BYOK, OpenAI completo.
Criterios de salida a autónomo: ≥95 % de evals y ≥90 % de borradores aprobados sin editar.

## Costos (estimación, supuestos explícitos en el informe)
~US$29 por 1.000 conversaciones con mezcla 80/20 Haiku/Sonnet; Meta ~US$6–13 según plantillas; total ~US$35–45/mes por centro piloto. Meta se factura al centro en su WABA. Reventa sugerida: complemento IA US$49–79/mes con 1.000 conversaciones incluidas.

## Pruebas sin cuentas de Meta
Simulador de canales firmado; Graph API falsa en perfil `simulador`; ProveedorLLM de guion determinista; evals con LLM real opcionales (PRUEBAS_LLM_REALES=1).

## Legal (abogado)
Ley 1581 (datos sensibles, transmisión a Meta/Anthropic/OpenAI, Circular SIC 003/2025 cláusulas modelo; no se verificó si EE. UU. sigue como país adecuado); no usar Fable 5/5.1 (exigen retención 30 días); con OpenAI usar store:false; el chat no es historia clínica (retención sugerida 24 meses; trazas 90 días redactadas); Ley 2300/2023 solo para contactos proactivos.

## No verificado
LICENSE originales de Botpress/Dify/Typebot; retención estándar de la API de Anthropic sin ZDR; precios con caché de OpenAI; quién factura Meta bajo Tech Provider; streaming SSE en Caddy; imagen pgvector/pgvector:pg17 y su glibc; latencias reales; costos son estimaciones.

## Preguntas abiertas
1) ¿Asygnuz será Tech Provider (iniciar verificación ya)? 2) ¿Llave de plataforma o BYOK? 3) ¿Claude por defecto y OpenAI en fase 2? ¿enviar el nombre del contacto al LLM o solo marcadores? 4) ¿Centro piloto y tipo? 5) ¿Autoagendamiento antes de F1? 6) Retención de chats y trazas.
