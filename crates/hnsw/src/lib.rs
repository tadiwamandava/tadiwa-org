//! HNSW over int8-quantised vectors, compiled to WebAssembly.
//!
//! This crate is the search half of tadiwa.org: the browser fetches one binary
//! blob of quantised document vectors, hands it to `Index::build`, and every
//! query after that is a graph walk inside this module. Nothing leaves the tab.
//!
//! WHY A GRAPH AT THIS SCALE. With ~100–300 chunks a brute-force scan is
//! already sub-millisecond, so the honest justification for HNSW here is not
//! raw speed — it is that the structure is the point, and the page reports the
//! real numbers either way. `brute_force` is kept and exposed precisely so the
//! /lab/search page can measure recall against ground truth instead of
//! asserting it. An index that cannot be checked is a claim, not evidence.
//!
//! The module split:
//!   `hnsw`  — graph construction, the neighbour-selection heuristic, search
//!   `quant` — the on-disk vector format and its dequantiser
//!   here    — nothing but marshalling across the JS boundary

mod hnsw;
mod quant;

pub use hnsw::{Candidate, Hnsw, Scratch};
pub use quant::{QuantError, Quantized};

use wasm_bindgen::prelude::*;

/// Index parameters. `M = 16` and `ef_construction = 200` are the paper's
/// general-purpose defaults and are not worth tuning at this corpus size; the
/// seed is fixed so a rebuild produces a byte-identical graph, which is what
/// makes the recall number on /lab/search reproducible rather than anecdotal.
const DEFAULT_M: usize = 16;
const DEFAULT_EF_CONSTRUCTION: usize = 200;
const DEFAULT_SEED: u64 = 0x5EED_1D0C_5EED_1D0C;

#[wasm_bindgen]
pub struct Index {
    inner: Hnsw,
    scratch: Scratch,
    /// Reused across queries so a search does not allocate.
    query_buf: Vec<f32>,
}

#[wasm_bindgen]
impl Index {
    /// Builds the graph from a `vectors.bin` payload (see `quant`).
    ///
    /// Insertion is the expensive half of HNSW and it happens here, on the main
    /// thread, once — which is why the caller is expected to do this off the
    /// critical path, after the user has actually engaged with search.
    #[wasm_bindgen(constructor)]
    pub fn build(bytes: &[u8]) -> Result<Index, JsError> {
        let q = Quantized::parse(bytes).map_err(|e| JsError::new(&e.to_string()))?;

        let mut inner = Hnsw::new(q.dim, DEFAULT_M, DEFAULT_EF_CONSTRUCTION, DEFAULT_SEED);
        let mut scratch = Scratch::default();
        let mut row = vec![0.0f32; q.dim];

        // Sequential ids: row i of the payload becomes node i, so the JS side
        // can index its chunk metadata array directly by the id we return.
        for i in 0..q.count {
            q.row_into(i, &mut row);
            inner.insert(&row, &mut scratch);
        }

        Ok(Index {
            inner,
            scratch,
            query_buf: vec![0.0; q.dim],
        })
    }

    /// Returns `[id0, score0, id1, score1, …]`, best first.
    ///
    /// Interleaved in one Float32Array rather than an array of objects: this
    /// crosses the JS/WASM boundary as a single memory view with no per-result
    /// allocation, and the caller unpacks it in a loop.
    pub fn search(&mut self, query: &[f32], k: usize, ef_search: usize) -> Vec<f32> {
        if query.len() != self.inner.dim() {
            return Vec::new();
        }
        self.query_buf.copy_from_slice(query);
        let hits = self
            .inner
            .search(&self.query_buf, k, ef_search, &mut self.scratch);
        flatten(&hits)
    }

    /// Ground truth for the recall measurement on /lab/search.
    pub fn brute_force(&self, query: &[f32], k: usize) -> Vec<f32> {
        if query.len() != self.inner.dim() {
            return Vec::new();
        }
        flatten(&self.inner.brute_force(query, k))
    }

    // ---- introspection, all of it for /lab/search -------------------------

    #[wasm_bindgen(getter)]
    pub fn len(&self) -> usize {
        self.inner.len()
    }
    #[wasm_bindgen(getter)]
    pub fn dim(&self) -> usize {
        self.inner.dim()
    }
    #[wasm_bindgen(getter)]
    pub fn m(&self) -> usize {
        self.inner.m()
    }
    #[wasm_bindgen(getter, js_name = efConstruction)]
    pub fn ef_construction(&self) -> usize {
        self.inner.ef_construction()
    }
    #[wasm_bindgen(getter, js_name = maxLevel)]
    pub fn max_level(&self) -> usize {
        self.inner.max_level()
    }
    #[wasm_bindgen(getter, js_name = entryPoint)]
    pub fn entry_point(&self) -> Option<u32> {
        self.inner.entry_point()
    }

    /// Node count per layer, index 0 = base layer.
    #[wasm_bindgen(js_name = layerSizes)]
    pub fn layer_sizes(&self) -> Vec<u32> {
        self.inner.layer_sizes()
    }
    /// Flat `[from, to, from, to, …]` edge list for one layer.
    #[wasm_bindgen(js_name = layerEdges)]
    pub fn layer_edges(&self, layer: usize) -> Vec<u32> {
        self.inner.layer_edges(layer)
    }
    #[wasm_bindgen(js_name = layerMembers)]
    pub fn layer_members(&self, layer: usize) -> Vec<u32> {
        self.inner.layer_members(layer)
    }
    #[wasm_bindgen(js_name = layerDegrees)]
    pub fn layer_degrees(&self, layer: usize) -> Vec<u32> {
        self.inner.layer_degrees(layer)
    }

    // ---- telemetry from the LAST search ------------------------------------
    // The page shows these next to the brute-force count, so "the graph saved
    // work" is a measurement rather than an assertion.

    #[wasm_bindgen(getter, js_name = lastDistanceComputations)]
    pub fn last_distance_computations(&self) -> u32 {
        self.scratch.distance_computations
    }
    #[wasm_bindgen(getter, js_name = lastHops)]
    pub fn last_hops(&self) -> u32 {
        self.scratch.hops
    }
    /// Flat `[layer, node, layer, node, …]` — where each layer's descent landed.
    #[wasm_bindgen(js_name = lastPath)]
    pub fn last_path(&self) -> Vec<u32> {
        let mut out = Vec::with_capacity(self.scratch.path.len() * 2);
        for &(layer, node) in &self.scratch.path {
            out.push(layer as u32);
            out.push(node);
        }
        out
    }
}

/// Emits SIMILARITY, not distance.
///
/// The graph works in cosine distance because that is what the priority queues
/// need to order on, but a search UI ranks by "how good is this match", and
/// handing JavaScript a number that gets *smaller* as results get better is an
/// invitation to sort it the wrong way once. Converting here, at the single
/// boundary, means the mistake cannot be made downstream.
fn flatten(hits: &[Candidate]) -> Vec<f32> {
    let mut out = Vec::with_capacity(hits.len() * 2);
    for c in hits {
        out.push(c.id as f32);
        out.push(1.0 - c.dist);
    }
    out
}

// ===========================================================================
// Tests
//
// The load-bearing one is `recall_at_10_beats_ninety_percent`. HNSW is an
// APPROXIMATE index: it is allowed to miss, so "it returned ten things" proves
// nothing and "it compiled" proves less. The only meaningful assertion is
// against brute-force ground truth on the same vectors, which is why
// `brute_force` is part of the crate rather than a test helper.
//
// These run natively via the `rlib` crate type — full speed, no browser.
// ===========================================================================

#[cfg(test)]
mod tests {
    use super::hnsw::{Hnsw, Scratch, SplitMix64};

    /// Deterministic gaussian cloud. Gaussian rather than uniform because
    /// uniform-random vectors in high dimensions are all nearly equidistant,
    /// which makes recall look great for the wrong reason.
    fn corpus(n: usize, dim: usize, seed: u64) -> Vec<Vec<f32>> {
        let mut rng = SplitMix64::new(seed);
        (0..n)
            .map(|_| (0..dim).map(|_| rng.next_gaussian()).collect())
            .collect()
    }

    fn build(vectors: &[Vec<f32>], dim: usize) -> Hnsw {
        let mut index = Hnsw::new(dim, 16, 200, 0x1234_5678_9ABC_DEF0);
        let mut scratch = Scratch::default();
        for v in vectors {
            index.insert(v, &mut scratch);
        }
        index
    }

    #[test]
    fn empty_index_returns_nothing() {
        let index = Hnsw::new(8, 16, 200, 1);
        let mut scratch = Scratch::default();
        assert!(index.search(&[0.0; 8], 5, 32, &mut scratch).is_empty());
    }

    #[test]
    fn wrong_dimension_returns_nothing() {
        let vectors = corpus(32, 8, 7);
        let index = build(&vectors, 8);
        let mut scratch = Scratch::default();
        assert!(index.search(&[0.0; 5], 3, 32, &mut scratch).is_empty());
    }

    #[test]
    fn results_are_sorted_and_unique() {
        let dim = 32;
        let vectors = corpus(400, dim, 99);
        let index = build(&vectors, dim);
        let mut scratch = Scratch::default();

        let hits = index.search(&vectors[7], 10, 64, &mut scratch);
        assert_eq!(hits.len(), 10);

        for pair in hits.windows(2) {
            assert!(
                pair[0].dist <= pair[1].dist,
                "results must come back nearest-first"
            );
        }

        let mut ids: Vec<u32> = hits.iter().map(|c| c.id).collect();
        ids.sort_unstable();
        let before = ids.len();
        ids.dedup();
        assert_eq!(before, ids.len(), "a node was returned twice");
    }

    #[test]
    fn finds_the_query_itself() {
        let dim = 48;
        let vectors = corpus(300, dim, 5);
        let index = build(&vectors, dim);
        let mut scratch = Scratch::default();

        // Querying with a vector that IS in the index must return it first.
        // This is the cheapest possible check that the graph is connected at
        // all — it fails loudly if the visited set is being reset wrongly
        // between layers, because the descent then loses its own entry point.
        for &probe in &[0usize, 41, 150, 299] {
            let hits = index.search(&vectors[probe], 1, 64, &mut scratch);
            assert_eq!(hits[0].id as usize, probe, "self-query missed for {probe}");
            assert!(hits[0].dist < 1e-4, "self-distance should be ~0");
        }
    }

    #[test]
    fn recall_at_10_beats_ninety_percent() {
        let dim = 64;
        let n = 600;
        let vectors = corpus(n, dim, 2024);
        let index = build(&vectors, dim);
        let mut scratch = Scratch::default();

        let queries = corpus(60, dim, 777);
        let mut found = 0usize;
        let mut total = 0usize;

        for q in &queries {
            let truth: Vec<u32> = index.brute_force(q, 10).iter().map(|c| c.id).collect();
            let got: Vec<u32> = index
                .search(q, 10, 64, &mut scratch)
                .iter()
                .map(|c| c.id)
                .collect();
            total += truth.len();
            found += truth.iter().filter(|id| got.contains(id)).count();
        }

        let recall = found as f64 / total as f64;
        assert!(
            recall >= 0.90,
            "recall@10 was {recall:.3} over {total} ground-truth neighbours — \
             the graph is losing candidates"
        );
    }

    #[test]
    fn higher_ef_search_does_not_reduce_recall() {
        // ef_search is the accuracy/latency dial. If turning it UP makes results
        // worse, the candidate queue or the visited set is being mismanaged.
        let dim = 64;
        let vectors = corpus(500, dim, 31);
        let index = build(&vectors, dim);
        let mut scratch = Scratch::default();
        let queries = corpus(40, dim, 32);

        let recall_at = |ef: usize, scratch: &mut Scratch| {
            let (mut found, mut total) = (0usize, 0usize);
            for q in &queries {
                let truth: Vec<u32> = index.brute_force(q, 10).iter().map(|c| c.id).collect();
                let got: Vec<u32> = index.search(q, 10, ef, scratch).iter().map(|c| c.id).collect();
                total += truth.len();
                found += truth.iter().filter(|id| got.contains(id)).count();
            }
            found as f64 / total as f64
        };

        let low = recall_at(16, &mut scratch);
        let high = recall_at(128, &mut scratch);
        assert!(
            high >= low - 1e-9,
            "recall fell from {low:.3} to {high:.3} when ef_search went 16 -> 128"
        );
    }

    #[test]
    fn same_seed_builds_the_same_graph() {
        let dim = 32;
        let vectors = corpus(200, dim, 11);
        let a = build(&vectors, dim);
        let b = build(&vectors, dim);
        assert_eq!(a.layer_sizes(), b.layer_sizes());
        assert_eq!(a.entry_point(), b.entry_point());
        assert_eq!(a.max_level(), b.max_level());
    }

    #[test]
    fn every_node_appears_in_the_base_layer() {
        let dim = 16;
        let vectors = corpus(250, dim, 4);
        let index = build(&vectors, dim);
        assert_eq!(index.layer_sizes()[0] as usize, vectors.len());
        // Layers must shrink going up, or the level distribution is broken.
        for pair in index.layer_sizes().windows(2) {
            assert!(pair[1] <= pair[0], "layer sizes must be non-increasing");
        }
    }

    #[test]
    fn scratch_telemetry_beats_a_full_scan() {
        let dim = 64;
        let vectors = corpus(600, dim, 8);
        let index = build(&vectors, dim);
        let mut scratch = Scratch::default();
        index.search(&vectors[3], 10, 64, &mut scratch);
        assert!(
            (scratch.distance_computations as usize) < vectors.len(),
            "the graph evaluated {} distances for {} nodes — it is not saving work",
            scratch.distance_computations,
            vectors.len()
        );
    }

    #[test]
    fn quantised_payload_round_trips() {
        use super::quant::{Quantized, HEADER_BYTES, MAGIC};
        let (count, dim) = (3usize, 4usize);
        let mut bytes = Vec::new();
        bytes.extend_from_slice(&MAGIC.to_le_bytes());
        bytes.extend_from_slice(&(count as u32).to_le_bytes());
        bytes.extend_from_slice(&(dim as u32).to_le_bytes());
        bytes.extend_from_slice(&0u32.to_le_bytes());
        for _ in 0..count {
            bytes.extend_from_slice(&0.5f32.to_le_bytes());
        }
        for i in 0..count {
            for j in 0..dim {
                bytes.push(((i * dim + j) as i8) as u8);
            }
        }
        assert_eq!(bytes.len(), HEADER_BYTES + count * 4 + count * dim);

        let q = Quantized::parse(&bytes).expect("should parse");
        assert_eq!((q.count, q.dim), (count, dim));
        let mut row = vec![0.0; dim];
        q.row_into(1, &mut row);
        assert_eq!(row, vec![2.0, 2.5, 3.0, 3.5]);

        // A truncated payload must be rejected, not silently misread.
        assert!(Quantized::parse(&bytes[..bytes.len() - 1]).is_err());
        let mut bad = bytes.clone();
        bad[0] ^= 0xFF;
        assert!(Quantized::parse(&bad).is_err());
    }
}
