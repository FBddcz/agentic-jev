# Scene studio

Open **Shopping → Scene studio**. The default is **Photo try-on**; see [worker setup and limitations](TRY_ON.md). No mannequin is rendered in the interface.

**Living room → My room** accepts the user's own room photo, previews it locally, and offers a download of the normalized photo. This is explicitly labeled as the original image: no room-image editing model is connected, and no renovation is claimed. Switching between My room and Reference scenes preserves the selected photo until leaving the studio.

**Reference scenes** opens a photographed 360-degree environment: [Kiara Interior](https://polyhaven.com/a/kiara_interior), by Greg Zaal, CC0. Drag to look around. This panorama is a fixed photograph: furniture cannot be moved inside it. Choosing **Editable concept**, a palette card or a successful **Recommend & style room** switches to a separate Three.js concept scene. This does not renovate the photograph or reconstruct the user's home.

Five room concepts contain palettes, style tags and illustrative budgets. The engine filters by budget, ranks by `0.7 relevance + 0.3 preference fit`, then applies the best affordable result. Local mode matches bilingual tags with zero model calls. Connected models use the search-domain scoring boundary. Errors and budgets with no eligible concepts preserve the current view. The API retains outfit palette records for extensions; they are not real garments.

The inspector separates request round-trip time, server decision time, model wait and first rendered frame after assets are ready. These are actual run measurements, not general Jev benchmarks. Concepts are not measured room plans, physical product simulations or construction quotations.

The renderer loads on demand and requires WebGL. Concept views support orbit, zoom, reset and PNG export. The panorama supports look-around and reset, not spatial movement or reconstruction. Credits are in [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md).

Implementation: `src/SceneStudio.tsx`, `src/SceneCanvas.tsx`, `src/scene-data.ts`, `server/scene.ts`; API: `POST /api/scene/recommend`. Tests validate budgets, preset identity and failure behavior.
