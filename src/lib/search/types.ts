export interface Chunk {
  id: number;
  title: string;
  url: string;
  kind: "project" | "post";
  section: string;
  text: string;
}

export interface LexicalIndex {
  k1: number;
  b: number;
  avgLen: number;
  lengths: number[];
  postings: Record<string, Array<[number, number]>>;
}

export interface Hit {
  chunk: Chunk;
  score: number;
}

/** What produced the results currently on screen. Surfaced in the UI, because
 *  showing "semantic" while serving lexical results is a lie the visitor has
 *  no way to detect. */
export type SearchMode = "lexical" | "semantic";

export type SemanticState =
  | { status: "unavailable" }
  | { status: "idle" }
  | { status: "loading"; note: string }
  | { status: "ready"; buildMs: number; chunks: number }
  | { status: "error"; message: string };
