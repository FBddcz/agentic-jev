# Search and decision workflow

AgenticJev retrieves real candidates, preserves their source evidence, builds a shared shortlist, and scores it with one or more decision engines. Feedback reuses the retrieved snapshot; unchanged scoring contexts can reuse scores. Retrieval keys and model keys serve different purposes.

## Sources

| Source                | Scope                                                                        | Search key                        |
| --------------------- | ---------------------------------------------------------------------------- | --------------------------------- |
| GitHub REST           | Public repositories                                                          | None; anonymous rate limits apply |
| Hacker News / Algolia | Tech stories and linked pages                                                | None                              |
| Crossref REST         | Journal articles, proceedings articles and posted content across disciplines | None                              |
| Europe PMC REST       | Biomedical and life-science literature, including preprints                  | None                              |
| Tavily                | General web search, basic mode                                               | Required; monthly free credits    |
| Search1API            | General web search                                                           | Required                          |
| Brave Search          | General web search                                                           | Required                          |

Choose **Tech & open source**, **Papers**, or **Web** above the search box. **Sources & preferences** lets you mix sources, describe a more specific need, choose engines and change result limits. Under **Ranking scope**, choose **Fast shortlist (24)** or **All candidates**. Papers searches Crossref and Europe PMC in parallel. English topic keywords usually work best. Free access does not imply unlimited capacity or free access to every paper's full text.

Tavily, Search1API and Brave keys can be entered under Search connections or provided with `TAVILY_API_KEY`, `SEARCH1API_API_KEY` and `BRAVE_SEARCH_API_KEY`. UI keys stay in server memory until cleared or the process restarts. Environment values are loaded on startup. Keys are excluded from browser storage and result exports. Saving a key does not make a test request.

A GPT or Claude connection currently enables candidate scoring, not web retrieval. OpenAI supports a separate hosted `web_search` tool with tool charges; that retrieval path is not implemented here. See [official OpenAI web-search documentation](https://developers.openai.com/api/docs/guides/tools-web-search). SearXNG, arXiv, OpenAlex and Semantic Scholar are possible future sources, not current integrations.

## What happens after Discover

1. Selected sources receive the query and run concurrently, each with a 15-second deadline. Source errors remain visible. If all fail, the request fails; no local search substitutes are inserted.
2. HTTP(S) URLs are normalized and deduplicated. DOI links are canonicalized, including DOI case and `dx.doi.org` variants. Each candidate retains its upstream position per source; merged records retain all contributing source ranks. Different DOI versions can remain separate records.
3. The server stores candidate text, ranks, metadata, timestamps and a SHA-256 fingerprint in a snapshot. Up to 20 snapshots remain available for reranking for 30 minutes. A new query, source, retrieval limit or marketplace requires another search.
4. Before model scoring, excluded candidates are removed and a deterministic shortlist is selected from the remaining candidates. The default cap is 24. Every liked candidate is included, even if likes exceed the cap. Selecting all candidates removes the cap while respecting exclusions.
5. Every selected engine receives the **same ordered shortlist** and feedback context. Engines and provider batches execute sequentially. Unselected candidates remain inspectable under **Explore the remaining candidates** and are explicitly marked as unscored. **Like & include next round** brings a result into the next shortlist.
6. Changing only **Keep threshold** immediately filters existing scores in the browser. Changing intent, feedback or shortlist size requires reranking, but not retrieval. Exact-context score caching can avoid another model request.

The retrieval limit is **per source**, from 1 to 100; the merged snapshot can contain more than that number. Tavily and Brave return at most 20 per request in this implementation. Upstream services can return fewer candidates, and some sources can fail while others succeed.

## How the shortlist works

Each available source contributes a reciprocal-rank score:

```text
source contribution = 1 / (60 + upstream rank)
shortlist score = sum of source contributions + optional lexical contribution
```

Candidates with positive word/CJK-bigram overlap against the current intent form one additional ranked list. Its contribution is `1 / (60 + lexical rank)`. A candidate with no lexical overlap receives no lexical contribution. Ties use the merged candidate order, then candidate ID. Likes are included before filling the remaining places; excluded candidates do not consume places.

This is **reciprocal rank fusion (RRF) with a lexical list**, not embedding search or a learned reranker. It favors strong source placement, agreement between sources and exact wording. Source indexes are not necessarily independent, and a lexical shortlist can miss synonyms or cross-language matches. Choose all candidates when evaluating shortlist recall; changing the cap alone is not evidence of better recommendation quality.

The shortlist cap and provider batch size are separate settings. The default cloud/model boundary processes 24 candidates per batch: scoring 100 candidates requires five batches, while scoring 24 requires one. This is a request-count example, not a measured latency or quality improvement. A large number of liked items can expand the actual shortlist beyond its requested cap.

Excluded items are not scored, but their titles and snippets remain negative-feedback examples in the model prompt. This helps the model understand the user's rejection. Likes and exclusions therefore both change the scoring context.

## Reusing scores without losing provenance

The server uses an in-memory score cache with **10-minute TTL, 64 entries and a 10 MiB payload bound**. It evicts least-recently-used entries; access does not extend expiry. Restarting the server clears it. Only successful, complete validated results are cached; failures are not cached and missing scores are not filled in.

The key includes the full candidate context, ordered shortlist, lexical inputs, intent, all feedback, provider, configured model, endpoint and connection revision, prompt revision, and provider batch size. API credentials are not part of cache keys or exports. Saving, changing or removing a model connection invalidates that provider's cached scores. This is full-context reuse: a previous score for one URL is not reused under different needs or feedback.

The display threshold is excluded from the cache key because it changes visibility, not scoring. **Request fresh scores** bypasses cached scores while reusing the retrieved snapshot. This is useful for a fresh measurement or to see changes behind a model alias.

On a cache hit:

- Current request count is `0`; current token usage is `null` because no provider call occurred.
- Current elapsed time measures cache handling and row construction.
- Original scoring time, call count, token usage and scoring timestamp remain attached as provenance. The original model identity and raw evidence are retained.

A cached run's elapsed time must not be presented as fresh model-inference latency. The app has no measured Jev-versus-GPT speedup from this change.

## Scores and evidence

The search score is `0.7 × relevance + 0.3 × preference fit`. The no-key baseline measures word/CJK-bigram overlap; likes affect preference similarity. It does not understand synonyms, negation or multilingual intent as a semantic model would. Jev, ordinary LLM JSON scores and MiniCPM logits retain their distinct evidence labels. No score is a verified fact, citation-quality rating or calibrated probability.

Each model gets the need, candidate titles and snippet excerpts, and selected feedback. Sources receive the query. Paper metadata includes available authors, year, venue, DOI and provider-reported open-access status. Crossref often lacks an abstract; the interface explicitly labels title-only judgments. Snippets are capped at 1,800 characters. Metadata and abstracts can be incomplete or inaccurate, and preprints are not equivalent to peer-reviewed papers. The app does not download or review full papers.

**Behind the decision** shows source timings, retrieved/eligible/shortlisted counts, individual engine timings, cache provenance, displayed results and recent-run elapsed times. JSON export includes the full snapshot and source ranks, shortlist method and omitted/excluded IDs, feedback, scores, the current display threshold, raw model answers, errors and measured timings. Unscored candidates remain separate from scored candidates below the display threshold. Unknown request counts on failed model runs are `null`, not a false zero. Local scoring uses zero model requests.

This is a discovery and ranking interface. It does not verify stock or current prices, purchase tickets, execute browser tasks or render virtual try-ons.

## API and extension points

- `GET /api/status`: source and model connection availability.
- `POST /api/search/connect`: memory-only search connection.
- `POST /api/search/retrieve`: validate query/sources/limit, retrieve and store snapshot.
- `POST /api/search/rank`: select and score a shortlist from the stored snapshot with chosen engines and feedback. `shortlistSize` defaults to `24`, accepts an integer from `1` to `100`, or `null` for all nonexcluded candidates. `refreshScores: true` bypasses the score cache. The server uses its stored snapshot, not client-submitted candidate text.

Source adapters and normalized metadata live in `server/search.ts` and `src/search-types.ts`. UI and dashboard live in `src/SearchLab.tsx`. Scoring reuses the batched provider boundary, with search-specific questions rather than shopping rubrics. Tests cover malformed responses, credentials, DOI/URL deduplication, metadata, partial failures, snapshot integrity, shortlist parity and feedback, cache isolation/expiry/bounds, and model errors.

## Real marketplaces

**Shopping → Real stores** provides direct Amazon.com, Taobao/Tmall and JD search links without a search API key. These open the marketplace; the app does not read results from that page. For in-app recommendations, connect Tavily, Search1API or Brave. Requests add marketplace domain filters, and returned URLs must match product-detail patterns on the selected official domain. Returned titles and snippets are preserved; the app does not invent product images, prices, stock or affiliate links. Current platform coverage is Amazon.com (US), desktop Taobao/Tmall item links, and JD item pages. Search indexes can miss listings, and stores may require login or regional access. Official commerce APIs and browser-based product extraction are not implemented.

## Tavily free credits

[Tavily pricing](https://docs.tavily.com/documentation/api-credits), checked 2026-09-20: 1,000 credits per month on the free plan, no credit card required. Basic search costs one credit; advanced costs two. Register at [app.tavily.com](https://app.tavily.com/) and add your own key in **Web → Sources & preferences → Search connections → Tavily**. A model key is not a Tavily key.

The adapter fixes `search_depth: basic`, `auto_parameters: false`, `include_answer: false` and `include_raw_content: false`. Each retrieval makes one request per selected source; multiple sources can consume multiple quotas. Reranking a saved snapshot does not call Tavily again. Returned content is an excerpt, not a verified full webpage. A real Tavily key has not been used in this development session; contract and quota-error handling are tested.

The [Exa pricing page](https://exa.ai/pricing) advertises $20 sign-up credits plus $10 monthly; [Serper](https://serper.dev/) advertises 2,500 free queries. Both state no payment card is required (same check date). Serper's offer is a trial, not a stated monthly renewal. Neither is integrated here. SearXNG can be self-hosted, but hosting, maintenance and upstream rate limits remain. A crawler reads pages; it does not replace a search index.

Official commerce APIs have separate affiliate/developer eligibility and data-use rules. Amazon's [Creators API](https://affiliate-program.amazon.com/creatorsapi/docs/en-us/introduction) replaces PA-API 5. This app searches indexed product links, not official stock/price feeds, and does not claim unlimited free catalog access.
