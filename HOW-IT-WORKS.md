# How Your Living Portfolio Works — A Study Guide

*A plain-English tour of every part of the site and the system behind it. For each part:
**What** it is, **When** it runs, **How** it works, **Why** it's built that way — and the
one sentence you'd say about it in an interview. Read it in order the first time; after
that, jump to whatever you want to defend.*

The rule for using this: don't memorize sentences. For each part, get to where you could
draw it on a whiteboard and argue the trade-off. If a section doesn't click, that's the
one to re-read — and the one an interviewer would smell.

---

## 0. The big picture — where everything lives

**What:** Your portfolio is two separate applications on two separate clouds, tied together
by GitHub.

- **The site** (`living-portfolio`) — one `index.html` file of plain HTML/CSS/JavaScript,
  served by **Vercel**.
- **The API** (`samuel-ai-api`) — a Python **FastAPI** backend, hosted on **Render**, which
  talks to the **Anthropic** (Claude) API and a **Neon** Postgres database.

**When:** Every time someone opens the site, their browser loads the static files from Vercel;
every time they chat or submit the contact form, the browser calls the API on Render.

**How:** You `git push` to GitHub. That one push triggers **two independent deploys in
parallel** — Vercel rebuilds the site, Render rebuilds the API container. Neither knows the
other exists.

**Why:** Separating the static site from the API is standard, and it's *why several other
pieces exist*: because the browser (on the Vercel domain) calls an API on a different domain
(Render), you need CORS; because the API holds secrets the browser must never see, the key
lives only on Render. The split creates the security story.

> **In an interview:** "It's a static frontend on Vercel and a FastAPI backend on Render, one
> GitHub push deploying both. The two-origin split is deliberate — it's what forces the CORS
> boundary and keeps every secret server-side."

---

## 1. The frontend — no framework, on purpose

**What:** The whole site is one hand-written `index.html`: HTML for structure, CSS custom
properties for the design system, vanilla JavaScript for behavior. No React, no build step.

**When:** Loaded once, instantly, from Vercel's CDN.

**How:** CSS variables (`--accent`, `--bg`, …) act as a design token system; `IntersectionObserver`
reveals sections on scroll; the chat widget and the interactive diagrams are plain JS modules.
The only heavy library is **three.js**, and it's loaded *lazily* and only for the optional 3D
layers — which are **flagged off in production**, so a normal visitor downloads none of it.

**Why:** For a portfolio, "I can build the fundamentals React sits on top of" is a stronger
signal than "I reached for a framework." It also loads fast and has nothing to break.

> **In an interview:** "Vanilla HTML/CSS/JS with a CSS-variable design system — I wanted to
> show the fundamentals under React, not a dependency on it. The only library is three.js, lazy-
> loaded and off by default, so the baseline page ships zero framework."

---

## 2. The chat assistant (RAG) — the centerpiece

This is the most important part to understand, so it's broken into pieces. The whole thing
is **RAG**: *Retrieval-Augmented Generation.* Instead of the model answering from memory, you
**retrieve** the relevant facts from your documents first, then have the model **generate** an
answer using only those.

### 2a. Why RAG at all (the core idea)

**What:** The bot answers questions about you using **only your real documents**, cites its
sources, and refuses when the documents don't cover the question.

**Why (this is the whole argument — know it cold):** The old version put all your facts in one
big hand-written prompt. RAG beats that in three ways you *watched happen*:

1. **It doesn't hallucinate.** Ask "what's Samuel's favorite pizza?" and it refuses, because
   no document says. A big prompt would guess. → grounding beats invention.
2. **It can cite.** Because it pulled *specific chunks*, it can point to exactly which document
   each claim came from. A big prompt is one undifferentiated blob — nothing to cite.
3. **It's editable.** The knowledge is data (markdown files → a database), not code. Edit a
   file, re-ingest, and the live bot changes instantly — no redeploy.

> **In an interview:** "A static prompt can't cite, hallucinates when it's unsure, and needs a
> redeploy to change a fact. RAG gives me grounded, source-attributed answers over knowledge I
> can edit as data."

### 2b. The corpus — your knowledge as documents

**What:** A `/corpus` folder of markdown files (`profile.md`, `skills.md`, one per project).
These are the *only* things the bot can say.

**When:** Read at **ingestion** time (not per request).

**How:** Each file is plain markdown you can edit in seconds.

**Why:** Versioned, transparent, and re-ingestable. Crucially it's a **claims surface** — every
sentence in it is something the bot will state to a recruiter as fact, so it gets the same
honesty rule as everything else (shipped vs. in-progress kept explicit; nothing unverified —
that's why Sentry and Cloudflare came out).

> **In an interview:** "The corpus is markdown in the repo — one editable, versioned source of
> truth. I treat it as a claims surface: if the bot can say it, it has to be true and defensible."

### 2c. Chunking — cutting documents into pieces

**What:** Ingestion splits each document into overlapping ~1000-character **chunks**
(`CHUNK_SIZE = 1000`, `CHUNK_OVERLAP = 150`), cutting on whitespace so words aren't split.

**When:** During `python ingest.py`, before embedding.

**How:** A sliding window: take ~1000 chars, back up to the nearest space/newline, then start
the next chunk 150 chars before the last one ended (the overlap).

**Why:** You retrieve *chunks*, not whole documents, so the model gets just the relevant slice
instead of an entire file. The **overlap** keeps a sentence that straddles a cut from being lost
to both sides. 1000/150 is a simple, defensible default for a small corpus; you'd revisit it
(e.g., heading-aware splitting) as the corpus grows.

> **In an interview:** "Fixed-size character chunks with overlap. Overlap stops a boundary
> sentence from being orphaned. It's a deliberate simple baseline for a small corpus — the next
> step is structure-aware chunking if it grows."

### 2d. Embeddings — turning text into meaning-vectors

**What:** Each chunk (and each question) is turned into an **embedding**: a list of 1536 numbers
(a vector) that represents its *meaning*, using OpenAI's `text-embedding-3-small`.

**When:** Chunks are embedded once at ingestion; the question is embedded on every `/chat` call.

**How:** The embedding API maps text → a point in 1536-dimensional space where *similar meanings
land close together*. "What did he do before engineering?" and a chunk about his PM career end
up near each other even though they share few words.

**Why:** This is what lets you search by *meaning* instead of *keywords*. Anthropic doesn't offer
embeddings, which is why there's a second provider (OpenAI) — a real architecture fact worth
owning. Embedding the whole corpus costs about **$0.00004**; it's effectively free.

> **In an interview:** "Embeddings map text to a 1536-dim vector where semantic similarity is
> geometric distance. That's what makes retrieval meaning-based, not keyword-based. Anthropic
> has no embeddings API, so embeddings run on OpenAI."

### 2e. Vector search — finding the closest chunks

**What:** Given the question's vector, find the **top 5** most similar chunks
(`RETRIEVAL_K = 5`).

**When:** Every `/chat` request, right after embedding the question.

**How:** The chunks live in **Neon Postgres** with the **pgvector** extension. The similarity
measure is **cosine similarity** (the `<=>` operator = cosine *distance*; similarity = `1 −
distance`). An **HNSW index** (`vector_cosine_ops`) makes "find the nearest vectors" fast without
scanning every row.

**Why:** Postgres + pgvector over a dedicated vector DB (Pinecone, etc.) because you already need
a real database (for the contact form), Neon has a free serverless tier, and "I put vectors next
to my relational data in one Postgres" is a clean, honest story. HNSW is the modern default index
— it builds incrementally and needs no training.

> **In an interview:** "Cosine-similarity top-k over pgvector in Neon Postgres, with an HNSW
> index. I didn't need a separate vector database — one Postgres holds both the vectors and the
> app's relational data."

### 2f. Grounding — answering only from what was retrieved

**What:** The retrieved chunks are assembled into a numbered, source-tagged block and handed to
Claude with strict instructions: answer **only** from these sources, cite them with `[n]`, and
never present in-progress work as finished.

**When:** After retrieval, if the question is "grounded" (see next).

**How:** `build_system_prompt` combines a small **persona shell** (`about_me.py` — just voice and
tone now, no facts) with the numbered sources and the grounding rules. The facts come entirely
from the corpus, so there's exactly one claims surface — the model can't answer from a second,
uncited place.

**Why:** This is the difference between "an AI that talks about Samuel" and "an AI that reports
Samuel's documented facts." The separation (persona vs. knowledge) is what keeps citations honest.

> **In an interview:** "The system prompt is a thin persona plus the retrieved sources and a rule
> to answer only from them. Facts live in the corpus, not the prompt — one source of truth, which
> is what makes the citations trustworthy."

### 2g. The refusal — the 0.35 threshold

**What:** If the best retrieved chunk's similarity is **below 0.35** (`MIN_SIMILARITY`), the bot
refuses ("I don't have that in Samuel's documents") **without calling the model** — so a refusal
costs **$0**.

**When:** Right after retrieval, before any Claude call.

**How:** `is_grounded()` checks the top hit's cosine similarity against the threshold.

**Why (know the failure modes):** The threshold is the anti-hallucination gate.
- Set it **too high** (say 0.6) → real, answerable questions get refused. Your measured real
  questions scored **0.46–0.53**, so 0.6 would reject them. → **false refusals.**
- Set it **too low** (say 0.1) → junk retrievals pass, the model gets weakly-related text and
  answers anyway. → **hallucination.**
- **0.35** sits in the measured gap: real questions cluster at 0.46–0.53, the out-of-corpus
  "pizza" question scored **0.33**. Calibrating this properly with data is a Module 2 (evals) job.

> **In an interview:** "Below a cosine-similarity threshold I refuse instead of answering. Too
> high refuses real questions; too low invites hallucination. I set 0.35 in the measured gap
> between in-corpus (~0.5) and out-of-corpus (~0.33) scores — and calibrating it is exactly what
> evals are for."

### 2h. Conversation-aware retrieval — handling follow-ups

**What:** Retrieval uses the **last two user turns**, not just the latest message
(`conversation_query`, `max_user_turns = 2`).

**When:** Every `/chat` call, when building the search query.

**How:** It joins your recent user turns into the query text before embedding.

**Why:** A follow-up like "what's it built with?" has no topic on its own — the subject lives in
the previous turn ("tell me about Cadence"). Including it keeps the topic. The trade-off is mild
"topic bleed" if you hard-switch subjects; a fancier fix (an LLM rewriting the query) costs an
extra call, which isn't worth it here.

> **In an interview:** "I retrieve on the last couple of user turns so pronoun-y follow-ups keep
> their topic. It's a cheap alternative to LLM query-rewriting; the cost is slight topic bleed on
> a hard subject change."

### 2i. Citations you can touch

**What:** Each answer's `[n]` markers are clickable. Hovering (or tapping) one shows a popover
with the source's title and a snippet of the exact cited text; a source list also sits under
the answer.

**When:** Rendered in the widget whenever `/chat` returns a `citations` array.

**How — the subtle part:** The model numbers citations by *retrieval order* (it saw 5 chunks), but
the source chips are **deduplicated** (chunk 1 and chunk 4 might be the same file). So
`finalize_citations` **renumbers** the markers to a clean `1..N` that matches the deduped list —
like a reference list — then the widget links marker *n* to source *n*. The popover pattern (bring
the source to the marker) is how Perplexity/Claude/ChatGPT solve "you can't see the marker and the
source list at the same time in a small panel."

**Why:** Citations are the anti-"AI-slop" proof. Renumbering is required because raw model numbers
point at the *retrieved* order, not the *displayed* sources — show them raw and `[4]` points at a
chip that doesn't exist.

> **In an interview:** "Markers index the retrieved chunks, but I dedupe sources, so I renumber to
> a 1..N that matches the source list — otherwise a marker points at a citation that isn't shown.
> Each marker is a hover/tap popover that previews the source, so you never scroll to check a claim."

### 2j. Cost metering

**What:** Every answer reports real input/output token counts and the exact cost.

**When:** Computed on each `/chat` response from the model's own usage numbers.

**How:** Claude returns `usage.input_tokens` / `output_tokens`; you multiply by Haiku 4.5's price
(**$1.00 per million input tokens, $5.00 per million output**). A typical answer is ~$0.002.

**Why:** "I know my unit economics, measured not guessed" is a senior signal. Every number carries
its source — never an estimate.

> **In an interview:** "Cost is computed per answer from the API's real token counts times Haiku's
> published price — about $0.002 an answer, and $0 for a refusal since it skips the model."

### 2k. Plain-text enforcement

**What:** A small backstop (`to_plain_text`) strips any Markdown (`##`, `**`) the model emits.

**When:** After the model answers, before returning.

**Why:** The widget renders replies as plain text, so a stray `## Heading` would show the literal
hashes. The persona *asks* for plain text; this *guarantees* it. (Instruction-following is itself
something evals measure — the model doesn't always obey.)

> **In an interview:** "The prompt asks for plain text but models don't always comply, so there's
> a deterministic strip as a backstop. Whether the model follows instructions is itself an eval."

---

## 3. The FastAPI backend — a typed API

**What:** A Python web API with four endpoints: `GET /health`, `GET /version`, `POST /chat`,
`POST /inquiry`. Every request and response is a typed **Pydantic** model.

**When:** On every call from the browser.

**How:** FastAPI validates incoming JSON against the model *before your code runs* — a bad request
gets an automatic **422** with the exact field errors. It also auto-generates interactive docs at
**`/docs`** from those same types.

**Why:** Typed boundaries mean whole classes of bugs (missing field, wrong type) can't reach your
logic, and the docs are free and always accurate. In JS terms: it's like Zod validating every
request, but wired into the framework and the docs.

> **In an interview:** "FastAPI with Pydantic models on every boundary — validation happens before
> my handler, malformed input is an automatic 422, and the OpenAPI docs generate from the types."

---

## 4. CORS — the origin gate

**What:** The API only accepts browser requests from an approved list of origins.

**When:** On every request, before the handler.

**How:** `CORSMiddleware` compares the browser's `Origin` header against an allowlist
(`CORS_ORIGINS`, defaulting to just the production site). A non-matching origin gets no
access-control header, so the browser blocks the response.

**Why:** Because the site (Vercel) and API (Render) are different origins, the browser enforces
CORS — you have to opt specific origins in. It's *why* saving the page to your desktop and opening
it breaks the chat: `file://` isn't on the list. Configurable per environment so localhost works in
dev without loosening production.

> **In an interview:** "Two origins means CORS is mandatory. Production is locked to the site's
> domain via an allowlist; localhost is added through an env var only in dev. An unapproved origin
> gets no CORS header and the browser blocks it."

---

## 5. The contact form (`/inquiry`) — validation, anti-spam, storage

**What:** A typed contact endpoint that validates a message, silently drops bot spam, and stores
real submissions in Neon.

**When:** When someone submits the "work with me" form.

**How:**
- **Validation:** a Pydantic model with `EmailStr`; a bad email is a **422** before anything runs.
- **Honeypot:** a hidden `website` field invisible to humans. If it's filled, a bot did it — the
  API returns success **without storing**, so the bot can't tell it was caught.
- **Storage:** valid messages `INSERT` into Neon and return **201**.
- **Honest failure:** if the database isn't configured, it returns **503** rather than pretending
  it stored the message; and it never leaks the driver error (which can contain the DB host/user).

**Why:** It's a live, honest demo of the same "typed API" the site talks about — and the honeypot
is anti-spam without a CAPTCHA. The 503-not-fake-success choice is an honesty decision: never claim
to have stored something you didn't.

> **In an interview:** "Pydantic validates it, an invisible honeypot drops bots by returning
> success without storing, and a real message is written to Postgres. With no database configured
> it returns 503 rather than fake a success, and it never echoes the driver error to the client."

---

## 6. `/version` — knowing what's deployed

**What:** An endpoint returning the running commit SHA and when it started.

**How:** Reads Render's `RENDER_GIT_COMMIT` env var (falls back to local git in dev).

**Why:** It's how you *verify a deploy is actually live* rather than trusting a dashboard — you
used it to confirm the RAG build (`a43ef7c`) reached production. It's also the honest source for
the "build" line in the telemetry strip.

> **In an interview:** "`/version` exposes the deployed commit, so 'is my change live?' is a fact I
> can check, not a guess."

---

## 7. The telemetry strip

**What:** The thin live status bar at the top of the site.

**When:** On page load and periodically after.

**How:** It pings the API's health/version and shows real status (online, model, build).

**Why:** It signals "this is a real, running system," and it stays honest — it reflects the actual
API state, and never shows anything it can't verify.

---

## 8. The Architecture X-Ray

**What:** An interactive diagram that follows **one request through seven real layers**: Browser →
DNS + HTTPS → uvicorn → CORS gate → FastAPI + Pydantic → Claude API → Typed response. Each step
shows the actual code that runs it.

**When:** When a visitor clicks through it (2D by default; an optional 3D layer exists but is
flagged **off** in production).

**How:** Plain JS renders the steps and the real code snippet for each. The 3D version (three.js)
animates the same seven steps and is governed by a "truth in animation" rule — it only animates
behavior the system actually has.

**Why:** It shows the request *in time* — the sequence — and proves the architecture with real code,
not a stock diagram. It's the "I understand my own stack end to end" exhibit.

> **In an interview:** "It traces one request through the seven real layers with the actual code at
> each — it's the system explaining itself, in sequence."

---

## 9. The Deployment Topology

**What:** A diagram of **where the system lives**: six services (GitHub, Vercel, Render, your
browser, Anthropic, Neon) and the real connections between them — including one push fanning out to
two clouds in parallel.

**When:** Clicked through on the site (2D; optional 3D flagged off).

**How:** Five flows (deploy, page load, chat, where the key lives, inquiry) each highlight the real
edges involved.

**Why:** Where the X-Ray is *time* (one request, start to finish), this is *space* (what the pieces
are and where they run). The parallel deploy fan-out is the one thing a linear request trace can't
show. Together they're "I can explain my system both as a sequence and as a map."

> **In an interview:** "The X-Ray is the request in time; the topology is the system in space —
> including a single push deploying two independent clouds at once, which a request trace can't
> express."

---

## 10. Continuous deployment

**What:** Push to GitHub → both apps redeploy automatically.

**How:** Vercel watches the site repo, Render watches the API repo. A push to `main` triggers each.

**Why:** No manual deploy steps, and each half can ship or roll back independently. (Note: it's
*continuous deployment* — automated deploy on push. Automated **test-gating** in CI is a later
module; the site says "continuous deployment," not "CI/CD," on purpose — an honesty distinction.)

> **In an interview:** "Push-to-deploy on both clouds, independently. I call it continuous
> deployment, not CI/CD, because the test-gate in CI is a later module and I don't claim it yet."

---

## 11. The test suite

**What:** 28 pytest tests.

**How:** They cover the pure logic without needing the network or a paid API: chunking (size,
overlap, edges), the grounding/refusal decision, citation renumbering/dedup/snippets, the
plain-text strip, the conversation query, cost math, the 422/503 paths — and **honesty guards**
that fail the build if the corpus ever lists in-progress work as shipped.

**Why:** The honesty guards are the standout: they make "don't overclaim" a *test*, not a good
intention. And splitting the DB search from the embedding call is what let you test retrieval
before an embedding key existed — which is how you caught the vector-binding bug.

> **In an interview:** "28 tests, including honesty guards that fail if the corpus overclaims — I
> made 'don't lie' a regression test. Retrieval is split so the database path is testable without
> the paid embedding API."

---

## 12. The honesty system (the spine of the whole thing)

**What:** A single principle running through every part: **shipped work and in-progress work are
always explicit, and nothing is claimed that can't be defended.**

**Where it shows up:** the corpus is audited before ingestion; the bot refuses rather than guesses;
metrics carry their source; the roadmap marks RAG "Shipped" only once it's live; unverified tools
(Sentry, Cloudflare) were removed; "continuous deployment" isn't inflated to "CI/CD"; the honesty
guards enforce it in tests.

**Why:** This is the actual thesis of the portfolio. A flashy AI demo reads as "AI slop"; the same
demo with rigor and honesty reads as proof. The site's credibility *is* the product.

> **In an interview:** "The through-line is honesty as an engineering constraint — the corpus is a
> claims surface, the bot refuses when unsure, every metric names its source, and tests fail if a
> claim outruns reality. That rigor is what separates a real system from a demo."

---

## Glossary (say these correctly)

- **RAG** — Retrieval-Augmented Generation: retrieve relevant documents, then have the model answer
  using only them.
- **Embedding** — a list of numbers (a vector) representing a piece of text's *meaning*.
- **Vector / dimensions** — your embeddings are 1536-dimensional; each text is a point in that space.
- **Cosine similarity** — how aligned two vectors' directions are (0–1); closer meaning → higher score.
- **Chunk** — a small slice of a document (~1000 chars) that gets embedded and retrieved.
- **pgvector** — a Postgres extension adding a vector type and similarity search.
- **HNSW** — the index that makes nearest-vector search fast without scanning every row.
- **Grounding** — constraining the model to answer only from provided sources.
- **Hallucination** — the model confidently making something up; grounding + refusal is the defense.
- **Top-k** — retrieving the k best matches (here, k = 5).
- **Threshold** — the minimum similarity (0.35) below which the bot refuses.

---

## How to study this

1. Read start to finish once — don't stop to memorize.
2. Then pick **one** part and try to explain it out loud, from scratch, as if to an interviewer.
3. Where you stall, re-read that section — the stall is the gap.
4. The three that matter most for the teach-back: **2a (why RAG)**, **2g (the threshold)**, and
   **2i (citation renumbering)**. Get those three to where you could argue the trade-offs, and the
   gate is yours.

You built all of this. This guide just puts words to what you already made work.
