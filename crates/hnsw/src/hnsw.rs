//! Hierarchical Navigable Small World graphs, the algorithm, with no
//! WebAssembly in it.
//!
//! Reference: Malkov & Yashunin, "Efficient and robust approximate nearest
//! neighbor search using Hierarchical Navigable Small World graphs" (TPAMI
//! 2018). Algorithm numbers in the comments below (ALG 1..5) are that paper's.
//!
//! WHY A GRAPH AND NOT A SCAN. This site's corpus is ~100 chunks. A brute-force
//! cosine scan over 100 vectors of 384 dimensions is 38,400 multiply-adds and
//! finishes in well under a millisecond, HNSW is, for this corpus, strictly
//! slower than the thing it replaces, because building the graph costs more
//! than one scan and the walk still touches a good fraction of the nodes.
//!
//! That is stated plainly here rather than hidden, because the honest reason
//! this exists is that the STRUCTURE is the artefact: the index is the thing
//! being demonstrated on /lab/search, and a demonstration that only works at a
//! scale you cannot ship to a browser demonstrates nothing. The recall-vs-
//! `ef_search` curve, the degree distribution and the layer pyramid are all
//! real and all measurable at this size; they are the same curves you would
//! get at ten million vectors, just cheaper to plot. `brute_force` below is
//! kept as a first-class method for exactly this reason, the page reports
//! both, and the comparison is the point.
//!
//! WHAT IS ACTUALLY IMPLEMENTED HERE, versus the shortcuts a toy takes:
//!   * a real layer hierarchy with the paper's exponentially-decaying level
//!     assignment (`level = floor(-ln(U(0,1]) * mL)`), not a flat graph;
//!   * ALG 4's *neighbour-selection heuristic*, not "keep the M closest".
//!     This is the single most important detail. Keeping the M closest
//!     produces a graph whose edges all point into the same dense cluster, so
//!     greedy descent gets stuck in it; the heuristic keeps a candidate only
//!     when it is closer to the new node than to any neighbour already
//!     selected, which is what manufactures the long-range links that make the
//!     graph navigable at all;
//!   * bidirectional links with the same heuristic re-applied when a
//!     neighbour's list overflows `M_max`, so the degree bound is enforced by
//!     pruning rather than by refusing edges;
//!   * `ef_construction` / `ef_search` as genuinely separate knobs.
//!
//! DETERMINISM. Level assignment is the only randomness in HNSW, and it is
//! driven here by a seeded SplitMix64 rather than by the system RNG. Two
//! consequences worth having: the recall number quoted on /lab/search is
//! reproducible rather than a sample of a distribution, and a failing test is
//! a failing test rather than a flake.

use std::cmp::Ordering;
use std::collections::BinaryHeap;

/// Upper bound on layer index. With the default `mL` the probability of
/// drawing a level this high is ~1e-11; the cap exists so a pathological seed
/// cannot allocate an unbounded number of (empty) layers.
const MAX_LEVEL: usize = 16;

// ---------------------------------------------------------------------------
// SplitMix64, 8 lines, no dependency, and famously well-distributed for a
// generator this small. HNSW only needs one uniform per insert, so the quality
// bar is "does not correlate with insertion order", which this clears.
// ---------------------------------------------------------------------------

pub struct SplitMix64(u64);

impl SplitMix64 {
    pub fn new(seed: u64) -> Self {
        SplitMix64(seed)
    }

    fn next_u64(&mut self) -> u64 {
        self.0 = self.0.wrapping_add(0x9E37_79B9_7F4A_7C15);
        let mut z = self.0;
        z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
        z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
        z ^ (z >> 31)
    }

    /// Uniform in (0, 1]. Zero is excluded because the level formula takes its
    /// logarithm, `ln(0)` would hand back an infinite level.
    fn next_f64(&mut self) -> f64 {
        // 53 bits is exactly f64's mantissa, so every representable value in
        // the range is reachable and none is reachable twice.
        let bits = self.next_u64() >> 11;
        (bits as f64 + 1.0) / 9_007_199_254_740_993.0
    }

    /// Box–Muller. Used only to synthesise perturbed queries for the recall
    /// measurement, never during indexing.
    pub fn next_gaussian(&mut self) -> f32 {
        let u1 = self.next_f64();
        let u2 = self.next_f64();
        ((-2.0 * u1.ln()).sqrt() * (std::f64::consts::TAU * u2).cos()) as f32
    }
}

// ---------------------------------------------------------------------------
// Ordered candidates
//
// f32 is not Ord, and the priority queues here need a total order. `total_cmp`
// gives one without the `unwrap()` that a `partial_cmp` would need, distances
// are finite by construction, but "finite by construction" is exactly the kind
// of invariant that stops being true six months later.
// ---------------------------------------------------------------------------

#[derive(Copy, Clone, Debug)]
pub struct Candidate {
    pub dist: f32,
    pub id: u32,
}

impl PartialEq for Candidate {
    fn eq(&self, other: &Self) -> bool {
        self.cmp(other) == Ordering::Equal
    }
}
impl Eq for Candidate {}
impl Ord for Candidate {
    fn cmp(&self, other: &Self) -> Ordering {
        // Ties broken by id so that equal-distance results come back in a
        // stable order, otherwise recall numbers wobble between runs on a
        // corpus with duplicate text.
        self.dist
            .total_cmp(&other.dist)
            .then_with(|| self.id.cmp(&other.id))
    }
}
impl PartialOrd for Candidate {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

/// `BinaryHeap` is a max-heap. Wrapping in `Nearest` inverts it into the
/// min-heap the candidate queue needs, without pulling in `std::cmp::Reverse`
/// noise at every use site.
#[derive(Copy, Clone, Debug, PartialEq, Eq)]
struct Nearest(Candidate);

impl Ord for Nearest {
    fn cmp(&self, other: &Self) -> Ordering {
        other.0.cmp(&self.0)
    }
}
impl PartialOrd for Nearest {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

// ---------------------------------------------------------------------------
// Visited set
//
// A `HashSet<u32>` per query allocates and hashes; at ef=64 over a 100-node
// graph the hashing genuinely dominates the arithmetic. A stamp array is O(1)
// to test, O(1) to mark, and O(1) to *reset*, bumping the epoch invalidates
// every entry at once. The only cost is one u32 per node, held for the life of
// the index.
// ---------------------------------------------------------------------------

#[derive(Default)]
pub struct Scratch {
    stamps: Vec<u32>,
    epoch: u32,
    /// Distance evaluations since the last `reset`. Reported to the UI so the
    /// page can show what the graph actually saved over a full scan.
    pub distance_computations: u32,
    /// Nodes popped from the candidate queue, i.e. graph hops.
    pub hops: u32,
    /// (layer, node) pairs marking where each layer's greedy descent landed.
    pub path: Vec<(u8, u32)>,
}

impl Scratch {
    /// Starts a whole query (or insert): zeroes the telemetry and invalidates
    /// the visited marks.
    fn reset(&mut self, n: usize) {
        self.distance_computations = 0;
        self.hops = 0;
        self.path.clear();
        self.new_epoch(n);
    }

    /// Invalidates the visited marks WITHOUT touching the counters.
    ///
    /// Called at the top of every `search_layer`, because the visited set is
    /// per-layer, not per-query: layer 1 and layer 0 are different graphs over
    /// overlapping node sets, and a node explored during the descent must
    /// still be explorable when layer 0's sweep reaches it. Sharing one
    /// visited set across layers silently truncates the layer-0 search to
    /// whatever the descent had not already touched, which shows up as a
    /// recall ceiling that no amount of `ef_search` can lift, and is a
    /// genuinely nasty bug to find from the outside.
    ///
    /// The counters deliberately do NOT reset here: the number a visitor cares
    /// about is distance computations for the whole query, across every layer.
    fn new_epoch(&mut self, n: usize) {
        if self.stamps.len() < n {
            self.stamps.resize(n, 0);
        }
        // Wrapping past u32::MAX would make stale stamps look current, so on
        // overflow clear the array once and start again. Happens after four
        // billion layer searches; correctness should not depend on nobody
        // getting there.
        let (next, overflowed) = self.epoch.overflowing_add(1);
        if overflowed {
            self.stamps.iter_mut().for_each(|s| *s = 0);
            self.epoch = 1;
        } else {
            self.epoch = next;
        }
    }

    #[inline]
    fn visit(&mut self, id: u32) -> bool {
        let slot = &mut self.stamps[id as usize];
        if *slot == self.epoch {
            false
        } else {
            *slot = self.epoch;
            true
        }
    }
}

// ---------------------------------------------------------------------------
// The index
// ---------------------------------------------------------------------------

struct Node {
    level: usize,
    /// `links[l]` is the adjacency list at layer `l`, for `l` in `0..=level`.
    /// Indexed by layer rather than a `Vec<Vec<Vec<_>>>` keyed on layer first,
    /// because upper layers are almost entirely empty and the layer-first
    /// layout pays for an empty `Vec` per absent node.
    links: Vec<Vec<u32>>,
}

pub struct Hnsw {
    dim: usize,
    /// Degree bound above layer 0.
    m: usize,
    /// Degree bound at layer 0. Doubled per §4.1 of the paper: layer 0 holds
    /// every node and carries the final refinement, so it can afford, and
    /// needs, a denser graph than the sparse upper layers.
    m0: usize,
    ef_construction: usize,
    /// Level-decay constant. `1/ln(M)` is the paper's choice: it makes the
    /// expected number of nodes per layer fall by a factor of M each step, so
    /// the layer pyramid mirrors the branching factor and the descent through
    /// the hierarchy costs O(log N).
    ml: f64,
    /// Flat `n * dim`, L2-normalised at insert time. One allocation instead of
    /// n, and the row for a node is a contiguous slice, which is what lets the
    /// dot product below auto-vectorise.
    vectors: Vec<f32>,
    nodes: Vec<Node>,
    entry: Option<u32>,
    max_level: usize,
    rng: SplitMix64,
}

impl Hnsw {
    pub fn new(dim: usize, m: usize, ef_construction: usize, seed: u64) -> Self {
        let m = m.max(2);
        Hnsw {
            dim,
            m,
            m0: m * 2,
            ef_construction: ef_construction.max(m),
            ml: 1.0 / (m as f64).ln(),
            vectors: Vec::new(),
            nodes: Vec::new(),
            entry: None,
            max_level: 0,
            rng: SplitMix64::new(seed),
        }
    }

    pub fn len(&self) -> usize {
        self.nodes.len()
    }
    pub fn is_empty(&self) -> bool {
        self.nodes.is_empty()
    }
    pub fn dim(&self) -> usize {
        self.dim
    }
    pub fn m(&self) -> usize {
        self.m
    }
    pub fn ef_construction(&self) -> usize {
        self.ef_construction
    }
    pub fn max_level(&self) -> usize {
        self.max_level
    }
    pub fn entry_point(&self) -> Option<u32> {
        self.entry
    }

    #[inline]
    fn row(&self, id: u32) -> &[f32] {
        let start = id as usize * self.dim;
        &self.vectors[start..start + self.dim]
    }

    /// Cosine *distance* on unit vectors: `1 - dot`. Kept as distance rather
    /// than similarity so that "smaller is better" holds everywhere in the
    /// file and the heaps do not need two conventions.
    #[inline]
    fn distance(&self, q: &[f32], id: u32) -> f32 {
        let mut acc = 0.0f32;
        for (a, b) in q.iter().zip(self.row(id)) {
            acc += a * b;
        }
        1.0 - acc
    }

    /// Distance between two stored points, for the neighbour heuristic.
    #[inline]
    fn distance_between(&self, a: u32, b: u32) -> f32 {
        let mut acc = 0.0f32;
        for (x, y) in self.row(a).iter().zip(self.row(b)) {
            acc += x * y;
        }
        1.0 - acc
    }

    // -- insertion (ALG 1) --------------------------------------------------

    /// Adds one point. The vector is normalised on the way in, so every
    /// distance downstream is a plain dot product with no per-query division.
    pub fn insert(&mut self, vector: &[f32], scratch: &mut Scratch) -> u32 {
        assert_eq!(vector.len(), self.dim, "vector dimension mismatch");

        let id = self.nodes.len() as u32;
        let mut norm = 0.0f32;
        for v in vector {
            norm += v * v;
        }
        // A zero vector has no direction, so cosine is undefined for it. Rather
        // than emit NaNs that poison every comparison it touches, leave it at
        // the origin, it will simply never be anyone's nearest neighbour.
        let inv = if norm > 0.0 { norm.sqrt().recip() } else { 0.0 };
        self.vectors.extend(vector.iter().map(|v| v * inv));

        // ALG 1 line 4: the level draw.
        let level = ((-self.rng.next_f64().ln()) * self.ml).floor() as usize;
        let level = level.min(MAX_LEVEL);

        self.nodes.push(Node {
            level,
            links: (0..=level).map(|_| Vec::new()).collect(),
        });

        let Some(mut ep) = self.entry else {
            // First point: it is the whole graph.
            self.entry = Some(id);
            self.max_level = level;
            return id;
        };

        scratch.reset(self.nodes.len());
        let q = self.row(id).to_vec();

        // Phase 1 (ALG 1 lines 5-7): from the top down to just above the new
        // node's own level, greedily walk to the single nearest node. No
        // candidate list is kept, these layers exist only to get the entry
        // point into the right neighbourhood cheaply.
        let mut lc = self.max_level;
        while lc > level {
            ep = self.greedy_descend(&q, ep, lc, scratch);
            lc -= 1;
        }

        // Phase 2 (ALG 1 lines 8-17): from the new node's level down to 0,
        // run the full ef_construction search and wire the node in.
        let start = level.min(self.max_level);
        for lc in (0..=start).rev() {
            let found = self.search_layer(&q, &[ep], self.ef_construction, lc, scratch);
            let m_max = if lc == 0 { self.m0 } else { self.m };
            let selected = self.select_neighbours(id, &found, self.m);

            self.nodes[id as usize].links[lc].clone_from(&selected);

            // Backlinks. HNSW's graph is undirected, and this is where the
            // degree bound has to be defended: adding an edge can push an
            // existing node past m_max, and the fix is to re-run the SAME
            // heuristic over its enlarged neighbourhood rather than to drop
            // the new edge. Dropping it would let early-inserted nodes freeze
            // their neighbourhoods and leave later ones unreachable.
            for &neighbour in &selected {
                if self.nodes[neighbour as usize].links[lc].len() < m_max {
                    self.nodes[neighbour as usize].links[lc].push(id);
                    continue;
                }
                // Copied out before the heuristic runs: scoring the enlarged
                // neighbourhood needs `&self` for the distances, which cannot
                // coexist with a `&mut` into the very list being scored.
                let existing = self.nodes[neighbour as usize].links[lc].clone();
                let mut pool: Vec<Candidate> = existing
                    .iter()
                    .chain(std::iter::once(&id))
                    .map(|&other| Candidate {
                        dist: self.distance_between(neighbour, other),
                        id: other,
                    })
                    .collect();
                pool.sort_unstable();
                let pruned = self.select_neighbours(neighbour, &pool, m_max);
                self.nodes[neighbour as usize].links[lc] = pruned;
            }

            if let Some(best) = found.first() {
                ep = best.id;
            }
        }

        if level > self.max_level {
            self.max_level = level;
            self.entry = Some(id);
        }
        id
    }

    // -- search ------------------------------------------------------------

    /// ALG 2 with `ef = 1`, written out separately because the general form
    /// allocates two heaps and this is called `max_level` times per insert.
    fn greedy_descend(&self, q: &[f32], entry: u32, layer: usize, scratch: &mut Scratch) -> u32 {
        let mut best = entry;
        let mut best_dist = self.distance(q, entry);
        scratch.distance_computations += 1;
        loop {
            let mut improved = false;
            let node = &self.nodes[best as usize];
            if layer >= node.links.len() {
                break;
            }
            for &n in &node.links[layer] {
                let d = self.distance(q, n);
                scratch.distance_computations += 1;
                if d < best_dist {
                    best_dist = d;
                    best = n;
                    improved = true;
                }
            }
            scratch.hops += 1;
            if !improved {
                break;
            }
        }
        scratch.path.push((layer as u8, best));
        best
    }

    /// ALG 2: best-first search of one layer, returning up to `ef` results
    /// sorted nearest-first.
    ///
    /// The termination condition is the interesting line. The loop stops as
    /// soon as the closest *unexplored* candidate is further away than the
    /// worst result already held, at that point no unexplored branch can
    /// improve the result set, because edges only ever lead outward from a
    /// candidate. That is what makes this a bounded search rather than a walk
    /// of the whole component, and it is why `ef` is a quality knob and not
    /// just a result count.
    fn search_layer(
        &self,
        q: &[f32],
        entry_points: &[u32],
        ef: usize,
        layer: usize,
        scratch: &mut Scratch,
    ) -> Vec<Candidate> {
        scratch.new_epoch(self.nodes.len());
        let mut candidates: BinaryHeap<Nearest> = BinaryHeap::new();
        let mut results: BinaryHeap<Candidate> = BinaryHeap::new();

        for &ep in entry_points {
            if !scratch.visit(ep) {
                continue;
            }
            let d = self.distance(q, ep);
            scratch.distance_computations += 1;
            let c = Candidate { dist: d, id: ep };
            candidates.push(Nearest(c));
            results.push(c);
        }

        while let Some(Nearest(current)) = candidates.pop() {
            scratch.hops += 1;
            let worst = results.peek().map(|c| c.dist).unwrap_or(f32::INFINITY);
            if current.dist > worst && results.len() >= ef {
                break;
            }
            let node = &self.nodes[current.id as usize];
            if layer >= node.links.len() {
                continue;
            }
            for &n in &node.links[layer] {
                if !scratch.visit(n) {
                    continue;
                }
                let d = self.distance(q, n);
                scratch.distance_computations += 1;
                let worst = results.peek().map(|c| c.dist).unwrap_or(f32::INFINITY);
                if results.len() < ef || d < worst {
                    let c = Candidate { dist: d, id: n };
                    candidates.push(Nearest(c));
                    results.push(c);
                    if results.len() > ef {
                        results.pop();
                    }
                }
            }
        }

        let mut out = results.into_vec();
        out.sort_unstable();
        if let Some(best) = out.first() {
            scratch.path.push((layer as u8, best.id));
        }
        out
    }

    /// ALG 4, the neighbour-selection heuristic.
    ///
    /// `candidates` must be sorted nearest-first with respect to `base`.
    ///
    /// The rule: accept a candidate `e` only if it is closer to `base` than to
    /// every neighbour already accepted. Read geometrically, each accepted
    /// neighbour claims the cone of directions around itself, and a candidate
    /// sitting inside an existing cone is rejected as redundant, you can
    /// already reach that direction in one hop. What survives is a spread of
    /// directions rather than a huddle of the M nearest points, and it is that
    /// spread that gives greedy descent somewhere to go when the query sits
    /// outside the local cluster.
    ///
    /// `keepPrunedConnections` (ALG 4 line 16) is on: if the heuristic is
    /// strict enough to leave the list short, the closest rejects are added
    /// back. A node with two edges is a node the graph can strand.
    fn select_neighbours(&self, base: u32, candidates: &[Candidate], m: usize) -> Vec<u32> {
        let mut selected: Vec<u32> = Vec::with_capacity(m);
        let mut discarded: Vec<u32> = Vec::new();

        for cand in candidates {
            if cand.id == base {
                continue;
            }
            if selected.len() >= m {
                break;
            }
            let keep = selected
                .iter()
                .all(|&s| self.distance_between(cand.id, s) >= cand.dist);
            if keep {
                selected.push(cand.id);
            } else {
                discarded.push(cand.id);
            }
        }

        let mut i = 0;
        while selected.len() < m && i < discarded.len() {
            selected.push(discarded[i]);
            i += 1;
        }
        selected
    }

    /// ALG 5, the public query. Descends the hierarchy with `ef = 1`, then
    /// runs one wide `ef_search` sweep at layer 0.
    pub fn search(
        &self,
        query: &[f32],
        k: usize,
        ef_search: usize,
        scratch: &mut Scratch,
    ) -> Vec<Candidate> {
        scratch.reset(self.nodes.len());
        let Some(entry) = self.entry else {
            return Vec::new();
        };
        if query.len() != self.dim {
            return Vec::new();
        }

        // Normalise the query rather than requiring the caller to. The cost is
        // one pass over 384 floats; the alternative is a class of silent
        // ranking bugs that only show up as "search feels slightly wrong".
        let mut norm = 0.0f32;
        for v in query {
            norm += v * v;
        }
        if norm <= 0.0 {
            return Vec::new();
        }
        let inv = norm.sqrt().recip();
        let q: Vec<f32> = query.iter().map(|v| v * inv).collect();

        let mut ep = entry;
        let mut lc = self.max_level;
        while lc > 0 {
            ep = self.greedy_descend(&q, ep, lc, scratch);
            lc -= 1;
        }

        // ef must be at least k or the result set cannot hold the answer.
        let ef = ef_search.max(k).max(1);
        let mut found = self.search_layer(&q, &[ep], ef, 0, scratch);
        found.truncate(k);
        found
    }

    /// Exhaustive cosine scan. This is the ground truth the recall numbers are
    /// measured against, and, at this corpus size, a legitimate answer in its
    /// own right. Keeping it in the same crate means /lab/search compares the
    /// graph against a reference that shares its arithmetic, so any difference
    /// is the graph's approximation and not a float discrepancy across a
    /// language boundary.
    pub fn brute_force(&self, query: &[f32], k: usize) -> Vec<Candidate> {
        if query.len() != self.dim || self.nodes.is_empty() {
            return Vec::new();
        }
        let mut norm = 0.0f32;
        for v in query {
            norm += v * v;
        }
        if norm <= 0.0 {
            return Vec::new();
        }
        let inv = norm.sqrt().recip();
        let q: Vec<f32> = query.iter().map(|v| v * inv).collect();

        let mut all: Vec<Candidate> = (0..self.nodes.len() as u32)
            .map(|id| Candidate {
                dist: self.distance(&q, id),
                id,
            })
            .collect();
        all.sort_unstable();
        all.truncate(k);
        all
    }

    // -- introspection, for the page that draws this ------------------------

    /// Node count per layer, index 0 = layer 0. The shape of this array is the
    /// pyramid: each step up should be roughly 1/M of the one below it.
    pub fn layer_sizes(&self) -> Vec<u32> {
        let mut out = vec![0u32; self.max_level + 1];
        for node in &self.nodes {
            for l in 0..=node.level {
                out[l] += 1;
            }
        }
        out
    }

    /// Undirected edges at a layer, flattened as `[a, b, a, b, ...]` with
    /// `a < b` so each edge appears once.
    pub fn layer_edges(&self, layer: usize) -> Vec<u32> {
        let mut out = Vec::new();
        for (i, node) in self.nodes.iter().enumerate() {
            if layer >= node.links.len() {
                continue;
            }
            let a = i as u32;
            for &b in &node.links[layer] {
                if a < b {
                    out.push(a);
                    out.push(b);
                }
            }
        }
        out
    }

    /// Ids present at `layer`, ascending.
    pub fn layer_members(&self, layer: usize) -> Vec<u32> {
        self.nodes
            .iter()
            .enumerate()
            .filter(|(_, n)| n.level >= layer)
            .map(|(i, _)| i as u32)
            .collect()
    }

    /// Out-degree of every node present at `layer`, ascending by id.
    pub fn layer_degrees(&self, layer: usize) -> Vec<u32> {
        self.nodes
            .iter()
            .filter(|n| n.level >= layer)
            .map(|n| n.links[layer].len() as u32)
            .collect()
    }
}
