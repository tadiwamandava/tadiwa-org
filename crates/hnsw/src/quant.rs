//! The on-the-wire vector format.
//!
//! WHY QUANTISE AT ALL. MiniLM-L6 emits 384-dimensional float32 embeddings.
//! At ~110 chunks that is 110 x 384 x 4 = 169 kB of float, and float32 barely
//! compresses — the mantissa bits are noise to a gzip window, so the transfer
//! size is close to the raw size. Symmetric int8 quantisation cuts it to a
//! quarter (~42 kB) for a measurable but tiny ranking cost, because the
//! vectors are L2-normalised: every component lands in [-1, 1], the
//! distribution is tight and roughly symmetric about zero, and that is the
//! best case for a linear codebook.
//!
//! PER-VECTOR SCALE, not per-tensor. One global scale would be set by whichever
//! single chunk happens to have the most peaked embedding, and every other
//! vector would then use a fraction of the 8-bit range. A per-vector scale
//! costs 4 bytes per row — under 1% overhead — and keeps every row using all
//! 255 codes.
//!
//! The reconstruction error is not hand-waved: `scripts/build-embeddings.ts`
//! reports the mean cosine between each original float32 vector and its
//! dequantised form, and /lab/search shows recall measured against a brute
//! force scan over the SAME dequantised vectors, so the graph's approximation
//! error is reported separately from the codec's.
//!
//! FORMAT (`public/search/vectors.bin`, little-endian):
//!
//! ```text
//!   0  u32  magic  0x31515654  ("TVQ1")
//!   4  u32  count
//!   8  u32  dim
//!  12  u32  reserved (0)      -- also keeps the f32 block 4-byte aligned
//!  16  f32[count]  scale      -- dequantised value = code * scale
//!  ..  i8[count*dim] codes    -- row-major
//! ```
//!
//! The header is in the payload rather than in the sidecar JSON on purpose: a
//! file that cannot describe itself is a file that gets silently paired with
//! the wrong metadata after a rebuild.

pub const MAGIC: u32 = 0x3151_5654;
pub const HEADER_BYTES: usize = 16;

pub struct Quantized<'a> {
    pub count: usize,
    pub dim: usize,
    scales: &'a [u8],
    codes: &'a [u8],
}

#[derive(Debug)]
pub enum QuantError {
    TooShort,
    BadMagic(u32),
    LengthMismatch { expected: usize, actual: usize },
}

impl std::fmt::Display for QuantError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            QuantError::TooShort => write!(f, "vector payload is shorter than its 16-byte header"),
            QuantError::BadMagic(m) => write!(
                f,
                "bad magic 0x{m:08X} — expected 0x{MAGIC:08X}; is this vectors.bin?"
            ),
            QuantError::LengthMismatch { expected, actual } => write!(
                f,
                "vector payload is {actual} bytes, header describes {expected}"
            ),
        }
    }
}

fn read_u32(bytes: &[u8], at: usize) -> u32 {
    u32::from_le_bytes([bytes[at], bytes[at + 1], bytes[at + 2], bytes[at + 3]])
}

impl<'a> Quantized<'a> {
    pub fn parse(bytes: &'a [u8]) -> Result<Self, QuantError> {
        if bytes.len() < HEADER_BYTES {
            return Err(QuantError::TooShort);
        }
        let magic = read_u32(bytes, 0);
        if magic != MAGIC {
            return Err(QuantError::BadMagic(magic));
        }
        let count = read_u32(bytes, 4) as usize;
        let dim = read_u32(bytes, 8) as usize;

        let scale_bytes = count * 4;
        let code_bytes = count * dim;
        let expected = HEADER_BYTES + scale_bytes + code_bytes;
        if bytes.len() != expected {
            return Err(QuantError::LengthMismatch {
                expected,
                actual: bytes.len(),
            });
        }

        Ok(Quantized {
            count,
            dim,
            scales: &bytes[HEADER_BYTES..HEADER_BYTES + scale_bytes],
            codes: &bytes[HEADER_BYTES + scale_bytes..],
        })
    }

    /// Dequantises row `i` into `out`.
    ///
    /// Deliberately NOT re-normalised here — `Hnsw::insert` normalises on the
    /// way in, and doing it twice would hide a codec that had drifted the norm
    /// somewhere it should not be.
    pub fn row_into(&self, i: usize, out: &mut [f32]) {
        let scale = f32::from_le_bytes([
            self.scales[i * 4],
            self.scales[i * 4 + 1],
            self.scales[i * 4 + 2],
            self.scales[i * 4 + 3],
        ]);
        let start = i * self.dim;
        for (o, &c) in out.iter_mut().zip(&self.codes[start..start + self.dim]) {
            *o = (c as i8) as f32 * scale;
        }
    }
}
