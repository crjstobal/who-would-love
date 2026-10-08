# Qloo Agentic Hackathon ("Agents, but with taste")

- URL: https://qloo.devpost.com/ (reglas: https://qloo.devpost.com/rules)
- Envíos abiertos desde: 2026-09-30 09:00 ET
- Cierre: **2026-10-30 23:45 EDT** = 2026-10-31 03:45 UTC (04:45 en España, 05:45 en Grecia)
- Juicio: 2026-11-02 a 2026-11-16. Ganadores: hacia el 2026-11-23.
- Bote: 25.000 USD (1.º 15.000, 2.º 6.000, 3.º 4.000). 566 inscritos a 2026-10-06.
- Elegibilidad: mayoría de edad; excluidos Brasil, Quebec, Rusia, Crimea, Cuba, Irán, Corea del
  Norte y países con sanciones OFAC. España/Grecia OK. Individuos, equipos u organizaciones.
- Se puede presentar más de un proyecto si son sustancialmente distintos.
- Proyecto previo permitido **solo si** se le integra Qloo durante el periodo de envío y se
  explica qué se actualizó.

## De qué va
Agentes con "gusto cultural": usar la API y el taste graph de Qloo (250M+ entidades: música,
cine/TV, restaurantes, moda, viajes...) para que el agente recomiende mejor que un LLM pelado.
Vale (a) herramienta agéntica, (b) app hecha con framework de agentes, o (c) meter Qloo en un
agente que ya existe. **Si funciona igual sin Qloo, está mal planteado.**

API key: https://docs.qloo.com/reference/qloo-llm-hackathon-developer-guide#getting-your-api-key
(guardarla en SSM como `/servikaki/secrets/qloo.env`, nunca en el repo).

## Entrega obligatoria
1. Demo **funcional y alojada fuera** (web pública, APK o TestFlight). Nada solo en local.
2. Repo público (GitHub/GitLab/Bitbucket) con todo el código e instrucciones.
3. Descripción en texto: qué hace el agente y qué lo hace "Qloo-powered".
4. Licencia open source visible en el About del repo (ponerla el primer día).
5. **No piden vídeo.**

## Juicio
Implementación técnica (uso no trivial de Qloo), diseño (producto completo), impacto
(problema real para público concreto), calidad de la idea (uso no obvio de Qloo).
Jurado: Jason Calacanis, CTO de Qloo, Nicole Seligman (board de OpenAI), Todd Boehly,
Cedric the Entertainer, Michael Abrams (Live Nation).

## Encaje con el resto
- Cierra el mismo día que el 07 (Nebius, 2026-10-30) y una semana después del 08.
- Reutilizable: el núcleo agéntico común (adaptador fino `adapters/qloo.py` o tool de Qloo
  dentro del agente existente). Candidato natural: Newsletter for One (meter Qloo para el
  gusto del lector) o cualquier agente ya hecho, vía opción (c).

## Pendiente
- Pedir API key y probar qué endpoints da (Insights, entidades, tags, audiencias).
- Decidir idea.

## Notas técnicas de la API (guía del hackathon, leída 2026-10-08)
- Pedir key con el formulario https://forms.gle/zz12orkLHTAneLGz6 (tarda unos días hábiles, mirar spam).
- Base URL **solo** `https://hackathon.api.qloo.com` (api.qloo.com da 401). Header `X-Api-Key`.
- Flujo: `/search` (nombre a ID de entidad) o `/v2/tags` (ID de tag) y luego `GET /v2/insights`
  con `filter.type` + `signal.interests.entities` / `signal.interests.tags` /
  `signal.demographics.audiences` / filtros de lugar.
- Tipos: artist, book, brand, destination, movie, person, place, podcast, tv_show, video_game.
- Nada de `/recs` ni `/recommendations` (legacy). Parámetros inválidos se ignoran en silencio
  (resultado vacío sin error).
- Cachear en servidor vale; **no** subir respuestas de Qloo al repo público.
- Soporte: Discord #api-help (https://discord.gg/rF9PKsD5Q7).

## Hackathon anterior (Qloo LLM Hackathon, 2025, 344 proyectos)
Galería: https://qloo-hackathon.devpost.com/project-gallery. Arriba del todo: GeoTaste (consultor
de negocio por ubicación), Resonance AI (mensajes de campaña política adaptados a la cultura
local), Zesty (anti-recomendador que te saca de tu burbuja), Alloy (compatibilidad cultural
para fusiones de empresas). Saturado: viajes, pelis por estado de ánimo, "tu ADN cultural".

## Precio de Qloo (2026-10-08)
Sin precio público: venta a empresas ("contact sales"). Capterra da "desde 1.390 USD por usuario
y mes". La key del hackathon es gratis y **se desactiva al acabar el juicio (2026-11-16)**: nada
que dependa de Qloo sigue funcionando después sin un contrato.

## Ideas en discusión (2026-10-08)
1. GiftyQuest (del 08) + Qloo: ideas de regalo basadas en gustos reales (marcas, libros,
   restaurantes, destinos) en vez de productos inventados.
2. Buscador de audiencias: pegas la URL de tu producto, la IA lo entiende, lo cruza con Qloo y
   devuelve a quién apuntar y dónde (intereses para Facebook Ads, etc.).

## Kit oficial (https://github.com/qloo/qloo-hackathon-kit), leído 2026-10-08
- Harness `@qloo/qloo-harness` 0.1.26 instalado global (Node 22.20). `QLOO_BASE_URL` y
  `QLOO_TRUSTED_BASE_URL` apuntando al hackathon añadidos a `~/.zshrc`.
- Tres vías: `qloo exec <workflow>` (JSON, sin modelo), `qloo api` (respuesta cruda) y
  `qloo mcp` (servidor MCP por stdio para que nuestro modelo llame a Qloo como herramientas).
- 9 workflows: recommend, rank, describe, where_popular, compare_audiences, entity_tags,
  audience_demographics, trends, find_tags. Respuesta con `status` ok / empty / needs_input /
  partial / degraded / error.
- En servidor la key va en la variable `QLOO_API_KEY` (la sacamos de SSM, no `qloo setup` en disco).
- **No vale serverless:** el MCP se arranca como proceso, así que hace falta VM o contenedor.
- Prohibido mandar a Qloo datos personales (emails, nombres, IDs). Los resultados describen
  grupos, no personas: el informe tiene que separar "dato de Qloo" de "nuestra interpretación".
- docs/SUBMISSION.md pide además: problema, qué workflows y por qué, un ejemplo
  petición-resultado, capturas sin datos personales, pasos para montarlo desde cero y
  limitaciones conocidas.

## Idea elegida (2026-10-08): informe de audiencia a partir de una URL
URL del producto + email → pago → agente (LLM) lee la página, la traduce a entidades y tags de
Qloo, pide a Qloo afinidades, demografía y dónde es popular, busca comunidades reales donde está
esa gente (Reddit, Facebook, podcasts, newsletters) → informe PDF por email.

## Decisiones 2026-10-08
- **Sin pago** en la demo (frena la prueba del jurado). Flujo: URL + alcance (esta página / web
  entera, se autodetecta por la ruta) + email → informe.
- Nombre provisional **Who Would Love** (whowouldlove.com libre el 2026-10-08, sin comprar).
- Bocetos: `mockups/home.html` y `mockups/report-sample.html` (datos inventados, marcados).
- Lectura de la web: **Firecrawl** (renderiza JS, mapa del sitio, markdown limpio) + **Claude
  Haiku 5.5** (salió el 2026-10-07; confirmar el ID exacto con la API de modelos) para entenderla.
- Secretos: **SSM `/servikaki/secrets/whowouldlove.env`** con `ANTHROPIC_API_KEY` (key y workspace
  propios del proyecto) y `FIRECRAWL_API_KEY`. Se suben con `scripts/put_secrets.py` (pide las
  keys ocultas, no escribe nada a disco). Nada de `.env` en la carpeta.
- Logo: corazón cuya mitad derecha es un "?" grueso en naranja, con el punto debajo
  (variantes en `mockups/logo-options.png`, elegida la tercera).
- Hosting previsto: Cloudflare Workers. Los Workers no pueden arrancar `qloo mcp` (es un
  proceso), así que Qloo se llama por su API REST directa desde el Worker, envuelta como
  herramientas del agente. Alternativa si hace falta el harness: Cloudflare Containers.
- 2026-10-08 (v3 de bocetos): estilo nuevo (Bricolage Grotesque + Geist, bloque oscuro con
  degradado animado), logo grande dibujándose de fondo, palabra rotatoria letra a letra, formulario
  en 3 pasos verticales con botón al final, "How it works" con visuales usando **Momentline** como
  ejemplo real (icono y capturas en `mockups/assets/`, sacados de su ficha de App Store), informe
  de ejemplo de Momentline con filtro por fuente (Qloo / web / nuestra interpretación).
