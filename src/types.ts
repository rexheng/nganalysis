export interface GNode {
  id: string; name: string; type: string; title: string; variants: string[];
  isCandidate: boolean; isTarget: boolean; race?: string; campaignUrl?: string; endorsementsPage?: string;
  candNotes?: string; typeNote?: string; bc: number; bcFull: number; community: number;
  outDeg: number; inDeg: number; leaf: boolean; commsTouched: number[]; x: number; y: number; memberOf?: string; status?: string;
}
export interface GSrc { u: number; ty?: string; pg?: string; snap?: string; at?: string; }
export interface GEdge {
  id: string; s: string; t: string; rel: string; rank: string; formality: string; title: string;
  kind: 'endorsement' | 'member'; src: GSrc[]; date: string; check: string; asw: string;
}
export interface Community { id: number; size: number; coreSize: number; targets: string[]; stability: number | null; typeCounts: Record<string, number>; }
export interface Bridge { id: string; bc: number; endorses: Record<string, string[]>; endorsedBy: Record<string, number>; nComms: number; }
export interface Overlap { a: string; b: string; n: number; j: number; shared: string[]; }
export interface Summary {
  generated: string; nEdges: number; nEndorsementEdges: number; nMemberEdges?: number; nNodes: number; nEndorsers: number; nSingle: number;
  nCandidates: number; nCore: number; nCoreEdges: number; modularity: number; bestSeed: number; seeds: number;
  nCommunitiesDistribution: Record<string, number>; relCounts: Record<string, number>; typeCounts: Record<string, number>;
  sourceTypeCounts: Record<string, number>; accessDates: string[]; nNeedsCheck: number; nPamphletRefsExcluded: number | null;
  cleanFiles: Record<string, string>; downloads?: [string, string][];
}
export interface Data {
  urls: string[]; summary: Summary; communities: Community[]; races: { race: string; candidates: string[] }[];
  nodes: GNode[]; edges: GEdge[]; bridges: Bridge[]; overlap: Overlap[]; pairTogether: Record<string, number>;
}
