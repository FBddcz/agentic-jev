# Search and decision workflow

AgenticJev retrieves real candidates, keeps a source snapshot, then scores that same snapshot with one or more decision engines. Retrieval keys and model keys serve different purposes.

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

Choose **Tech & open source**, **Papers**, or **Web** above the search box. **Sources & preferences** lets you mix sources, describe a more specific need, choose engines and change result limits. Papers searches Crossref and Europe PMC in parallel. English topic keywords usually work best. Free access does not imply unlimited capacity or free access to every paper's full text.

Tavily, Search1API and Brave keys can be entered under Search connections or provided with `TAVILY_API_KEY`, `SEARCH1API_API_KEY` and `BRAVE_SEARCH_API_KEY`. UI keys stay in server memory until cleared or the process restarts. Environment values are loaded on startup. Keys are excluded from browser storage and result exports. Saving a key does not make a test request.

A GPT or Claude connection currently enables candidate scoring, not web retrieval. OpenAI supports a separate hosted `web_search` tool with tool charges; that retrieval path is not implemented here. See [official OpenAI web-search documentation](https://developers.openai.com/api/docs/guides/tools-web-search). SearXNG, arXiv, OpenAlex and Semantic Scholar are possible future sources, not current integrations.

## What happens after Discover

1. Each source receives the search query and runs concurrently, with a 15-second deadline. Source errors remain visible. If all fail, the request fails; no local search substitutes are inserted.
2. URLs are limited to HTTP(S), stripped of common tracking parameters, and deduplicated. DOI links are canonicalized, including DOI case and `dx.doi.org` variants. Different DOI versions can remain separate records. Sources are interleaved before scoring.
3. A snapshot stores candidate order, text, source metadata, timestamps and a SHA-256 fingerprint. The server retains up to 20 snapshots, each valid for reranking for 30 minutes.
4. Each selected engine scores exactly that snapshot. Models execute sequentially; model times are not parallel performance measurements. Changing a query, source or retrieval limit requires a new search.
5. Feedback can rerank the existing snapshot without another retrieval. Exclusions remain explicit and lower-scored rows can be inspected.

The configurable source limit is 1–100. Tavily and Brave return at most 20 per request in this implementation. Upstream services can return fewer candidates, and some sources can fail while others succeed.

## Scores and evidence

The search score is `0.7 × relevance + 0.3 × preference fit`. The no-key baseline measures word/CJK-bigram overlap; likes affect preference similarity. It does not understand synonyms, negation or multilingual intent as a semantic model would. Jev, ordinary LLM JSON scores and MiniCPM logits retain their distinct evidence labels. No score is a verified fact, citation-quality rating or calibrated probability.

Each model gets the need, candidate titles and snippet excerpts, and selected feedback. Sources receive the query. Paper metadata includes available authors, year, venue, DOI and provider-reported open-access status. Crossref often lacks an abstract; the interface explicitly labels title-only judgments. Snippets are capped at 1,800 characters. Metadata and abstracts can be incomplete or inaccurate, and preprints are not equivalent to peer-reviewed papers. The app does not download or review full papers.

**Behind the decision** shows source timings, candidate counts, individual model timings, retained results and recent-run elapsed times. JSON export includes the snapshot, feedback, scores, raw model answers, errors and measured timings. Unknown request counts on failed model runs are `null`, not a false zero. Local scoring uses zero model requests.

This is a discovery and ranking interface. It does not verify stock or current prices, purchase tickets, execute browser tasks or render virtual try-ons.

## API and extension points

- `GET /api/status`: source and model connection availability.
- `POST /api/search/connect`: memory-only search connection.
- `POST /api/search/retrieve`: validate query/sources/limit, retrieve and store snapshot.
- `POST /api/search/rank`: score snapshot with selected engines and feedback.

Source adapters and normalized metadata live in `server/search.ts` and `src/search-types.ts`. UI and dashboard live in `src/SearchLab.tsx`. Scoring reuses the batched provider boundary, with search-specific questions rather than shopping rubrics. Tests cover malformed responses, credentials, DOI/URL deduplication, metadata, partial failures, snapshot integrity, feedback and model errors.

## Real marketplaces

**Shopping → Real stores** provides direct Amazon.com, Taobao/Tmall and JD search links without a search API key. These open the marketplace; the app does not read results from that page. For in-app recommendations, connect Tavily, Search1API or Brave. Requests add marketplace domain filters, and returned URLs must match product-detail patterns on the selected official domain. Returned titles and snippets are preserved; the app does not invent product images, prices, stock or affiliate links. Current platform coverage is Amazon.com (US), desktop Taobao/Tmall item links, and JD item pages. Search indexes can miss listings, and stores may require login or regional access. Official commerce APIs and browser-based product extraction are not implemented.

## Tavily free credits

[Tavily pricing](https://docs.tavily.com/documentation/api-credits), checked 2026-09-20: 1,000 credits per month on the free plan, no credit card required. Basic search costs one credit; advanced costs two. Register at [app.tavily.com](https://app.tavily.com/) and add your own key in **Web → Sources & preferences → Search connections → Tavily**. A model key is not a Tavily key.

The adapter fixes `search_depth: basic`, `auto_parameters: false`, `include_answer: false` and `include_raw_content: false`. Each retrieval makes one request per selected source; multiple sources can consume multiple quotas. Reranking a saved snapshot does not call Tavily again. Returned content is an excerpt, not a verified full webpage. A real Tavily key has not been used in this development session; contract and quota-error handling are tested.

The [Exa pricing page](https://exa.ai/pricing) advertises $20 sign-up credits plus $10 monthly; [Serper](https://serper.dev/) advertises 2,500 free queries. Both state no payment card is required (same check date). Serper's offer is a trial, not a stated monthly renewal. Neither is integrated here. SearXNG can be self-hosted, but hosting, maintenance and upstream rate limits remain. A crawler reads pages; it does not replace a search index.

Official commerce APIs have separate affiliate/developer eligibility and data-use rules. Amazon's [Creators API](https://affiliate-program.amazon.com/creatorsapi/docs/en-us/introduction) replaces PA-API 5. This app searches indexed product links, not official stock/price feeds, and does not claim unlimited free catalog access.
