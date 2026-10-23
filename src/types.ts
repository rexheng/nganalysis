export interface Note { text: string; url?: string }
export interface GNode {
  id: string; name: string; type: string; title: string; variants: string[];
  isCandidate: boolean; isTarget: boolean; race?: string; campaignUrl?: string; endorsementsPage?: string;
  typeNote?: string; community: number; loose?: boolean; blocScore?: number; analysisEndorser?: boolean;
  outDeg: number; inDeg: number; leaf: boolean; x: number; y: number; memberOf?: string; status?: string; notes?: Note[];
}
export interface GSrc { u: number; ty?: string; pg?: string; snap?: string; at?: string; pr?: 1; sh?: 1 }
export interface GEdge {
  id: string; s: string; t: string; rel: string; rank: string; rankNote?: string; formality: string; title: string;
  kind: 'endorsement' | 'member'; src: GSrc[]; date: string; asw: string;
}
export interface Ambig { t: string; o: string; p: number }
export interface Community {
  id: number; size: number; targets: string[]; anchors: string[]; weakest: { a: string; b: string; p: number }; mean: number;
  borderline: boolean; ambiguous: Ambig[];
  nEndorsersOfTargets: number; typeCounts: Record<string, number>;
  intact?: number; intactShare?: number; intactLo?: number; intactHi?: number; boots?: number; split?: number; joiners?: { t: string; n: number }[];
}
export interface Loose { id: string; best: number; partners: { t: string; p: number }[]; groupedIn: { members: string[]; where: string[] }[]; nearBloc?: number; nearMin?: number }
export interface Variant { members: string[]; where: string[]; meanAll: number }
export interface Tie { a: string; b: string; max: number; maxA: string; maxB: string; mean: number }
export interface Ref { n: number; u: number; title: string; url: string; at: string[] }
export interface Overlap { a: string; b: string; n: number; j: number; oc: number; shared: string[] }
export interface SlateOverlap {
  slate: string; council: { t: string; j: number; n: number; base?: number; nList: number }[]; nOthersMulti?: number;
  leadBoot?: { a: string; b: string; resamples: number; aLeads: number; tie: number; aMajority: number; bMajority: number }; topKShare: Record<string, number>; top1Share: number; top2Share: number;
  resamples: number; nSlateEndorsers: number;
}
export interface Summary {
  generated: string; nEdges: number; nEndorsementEdges: number; nMemberEdges: number; nNodes: number; nEndorsers: number; nSingle: number;
  nCandidates: number; nCore: number; nCoreEdges: number; runs: number; pools: number; nRuns: number; border: number; linkage: string;
  poolsAgree: Record<string, boolean>; variantPartitions: Record<string, string[][]>; bootGroups: Record<string, number>; bootFate?: Record<string, number>[]; bootIntactAll?: number; poolsMinAgree?: boolean; minRefused?: { set: string[]; v: number } | null;
  refusedMerges: Record<string, ({ set: string[]; v: number } | null)[]>; zeroDropped?: { pamphletOnly: number; candidates: number; other: number };
  nCommunitiesDistribution: Record<string, number>; relCounts: Record<string, number>; typeCounts: Record<string, number>;
  endorserTypeCounts: Record<string, number>; sourceTypeCounts: Record<string, number>; edgeSourceTypeCounts: Record<string, number>;
  accessDates: string[]; nPamphletRefsExcluded: number | null; nPamphletPeople: number | null; rankCounts: Record<string, number>;
  nZeroEndorsersDropped: number | null; nUnverifiedLeads?: number;
  cleanFiles: Record<string, string>; downloads?: [string, string][];
  robustThreshold: number; nBlocs: number; nLoose: number;
  bootstrap: { resamples: number; runsPerResample: number; dropShare: number }; nProbableMoved?: number;
  typeOverrides: { id: string; was: string; now: string; why: string }[];
  palette: { colors: string[]; minDeltaE: Record<string, number> };
  validation?: { passed: number; total: number };
}
export interface Data {
  urls: string[]; urlLabels: string[]; refs: Ref[]; photos?: Record<string, string>; slateOverlap: SlateOverlap | null; summary: Summary; communities: Community[]; loose: Loose[]; ties: Tie[];
  races: { race: string; candidates: string[] }[]; nodes: GNode[]; edges: GEdge[]; overlap: Overlap[];
  pairTogether: Record<string, number>; coTargets: string[];
  variants: Variant[]; borderlinePairs: { a: string; b: string; p: number }[];
}
