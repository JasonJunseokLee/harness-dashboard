import Dagre from "@dagrejs/dagre";
import { Node, Edge } from "reactflow";

/**
 * dagre를 사용해 Node 배열에 position을 계산해서 반환합니다.
 * direction: 'LR' (좌→우) | 'TB' (위→아래)
 * nodeWidth/nodeHeight: 각 노드의 기본 크기 (노드별로 data.width/height 설정 시 우선)
 */
export function applyDagreLayout(
  nodes: Node[],
  edges: Edge[],
  options: {
    direction?: "LR" | "TB";
    nodesep?: number;
    ranksep?: number;
  } = {}
): Node[] {
  const { direction = "LR", nodesep = 40, ranksep = 120 } = options;

  const g = new Dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: direction, nodesep, ranksep, marginx: 24, marginy: 24 });

  nodes.forEach((n) => {
    // 각 노드의 style.width/height 또는 기본값 사용
    const w = (n.style?.width as number) ?? 200;
    const h = (n.style?.height as number) ?? 80;
    g.setNode(n.id, { width: w, height: h });
  });

  edges.forEach((e) => g.setEdge(e.source, e.target));

  Dagre.layout(g);

  return nodes.map((n) => {
    const { x, y, width, height } = g.node(n.id);
    return {
      ...n,
      position: {
        x: x - (width ?? 200) / 2,
        y: y - (height ?? 80) / 2,
      },
    };
  });
}
