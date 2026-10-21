export interface Note { text: string; url?: string }
export interface GNode {
  id: string; name: string; type: string; title: string; variants: string[];
  isCandidate: boolean; isTarget: boolean; race?: string; campaignUrl?: string; endorsementsPage?: string;
  typeNote?: string; bc: number; bcFull: number; community: number; loose?: boolean; blocScore?: number; analysisEndorser?: boolean;
  outDeg: number; inDeg: number; leaf: boolean; x: number; y: number; memberOf?: string; status?: string; notes?: Note[];
}
export interface GSrc { u: number; ty?: string; pg?: string; snap?: string; at?: string; pr?: 1; sh?: 1 }
export interface GEdge {
  id: string; s: string; t: string; rel: string; rank: string; rankNote?: string; formality: string; title: string;
  kind: 'endorsement' | 'member'; src: GSrc[]; date: string; asw: string; conf?: string; confNote?: string;
}
export interface Ambig { t: string; o: string; p: number; pmin: number }
export interface Community {
  id: number; size: number; targets: string[]; anchors: string[]; weakest: { a: string; b: string; p: number; pPooled: number };
  borderline: boolean; ambiguous: Ambig[]; batchesExact: number;
  nEndorsersOfTargets: number; typeCounts: Record<string, number>;
}
export interface Loose { id: string; best: number; partners: { t: string; p: number; pmin: number }[] }
export interface Tie { a: string; b: string; max: number; maxA: string; maxB: string; mean: number }
export interface Bridge {
  id: string; bc: number; pc: number; reach: number; deg: number; targets: string[]; nLoose: number; tie: boolean;
  rankReach: number; rankBc: number | null; rankReachConf?: number; reachConf?: number; rankBcConf?: number | null; bcLooWorstConf?: number | null; topReach: number; topBc: number; looWorst?: number | null; bcLooOut?: { t: string; rank: number | null }[]; bcLooWorst?: number | null;
  bcLooEdge?: string[]; robustReach: boolean; robustBc: boolean;
}
export interface Overlap { a: string; b: string; n: number; j: number; oc: number; shared: string[] }
export interface SlateOverlap {
  slate: string; council: { t: string; j: number; n: number }[]; topKShare: Record<string, number>; top1Share: number; top2Share: number;
  resamples: number; nSlateEndorsers: number;
}
export interface Summary {
  generated: string; nEdges: number; nEndorsementEdges: number; nMemberEdges: number; nNodes: number; nEndorsers: number; nSingle: number;
  nCandidates: number; nCore: number; nCoreEdges: number; runs: number; batches: number; nRuns: number; border: number;
  batchPartitions: string[][][]; batchesAgree: number; bootGroups: Record<string, number>;
  nCommunitiesDistribution: Record<string, number>; relCounts: Record<string, number>; typeCounts: Record<string, number>;
  endorserTypeCounts: Record<string, number>; sourceTypeCounts: Record<string, number>; edgeSourceTypeCounts: Record<string, number>;
  accessDates: string[]; nPamphletRefsExcluded: number | null; nPamphletPeople: number | null; rankCounts: Record<string, number>;
  nZeroEndorsersDropped: number | null; nUnverifiedLeads?: number;
  cleanFiles: Record<string, string>; downloads?: [string, string][];
  nMulti: number; nCrossers: number; robustThreshold: number; nBlocs: number; nLoose: number;
  bootstrap: { resamples: number; runsPerResample: number; bcResamples: number; dropShare: number; topK: number; robustShare: number };
  typeOverrides: { id: string; was: string; now: string; why: string }[];
  palette: { colors: string[]; minDeltaE: Record<string, number> };
  validation?: { passed: number; total: number };
}
export interface Data {
  urls: string[]; urlLabels: string[]; slateOverlap: SlateOverlap | null; summary: Summary; communities: Community[]; loose: Loose[]; ties: Tie[];
  candBc: { id: string; bc: number }[];
  races: { race: string; candidates: string[] }[]; nodes: GNode[]; edges: GEdge[]; bridges: Bridge[]; overlap: Overlap[];
  pairTogether: Record<string, number>; coTargets: string[];
}
