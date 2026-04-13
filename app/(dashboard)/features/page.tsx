"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import ReactFlow, {
  Node, Edge, Background, Controls,
  useNodesState, useEdgesState, BackgroundVariant,
  Handle, Position, NodeProps, MarkerType, MiniMap,
} from "reactflow";
import "reactflow/dist/style.css";
import { applyDagreLayout } from "@/app/lib/dagre-layout";
import TerminalStream from "@/app/components/TerminalStream";
import SparklesIcon from "@/app/components/SparklesIcon";
import { ToastStack, type ToastMsg } from "@/app/components/Toast";
import { useAI } from "@/app/context/AIContext";

// ─── 타입 ─────────────────────────────────────────────────────
type TreeNodeType = "root" | "category" | "feature" | "subfeature";

type TreeNode = {
  id: string;
  type: TreeNodeType;
  label: string;
  parentId: string | null;
  description?: string;
  color?: string;
  priority?: "high" | "medium" | "low";
  roles?: string[];
};

type FeaturesData = { productName: string; treeNodes: TreeNode[] };

// AI로 갓 생성된 노드 ID 집합 — 페이드인 애니메이션 적용용
type AIBornSet = Set<string>;

// ─── 노드 크기 (dagre 레이아웃에 사용) ───────────────────────
const NODE_W: Record<TreeNodeType, number> = {
  root: 200, category: 220, feature: 200, subfeature: 190,
};
const NODE_H: Record<TreeNodeType, number> = {
  root: 62, category: 72, feature: 84, subfeature: 62,
};

// ─── 카테고리 색상 팔레트 ─────────────────────────────────────
const CAT_COLORS = ["#3b82f6","#8b5cf6","#10b981","#f59e0b","#ef4444","#06b6d4","#ec4899"];

const PRIORITY_COLOR: Record<string, string> = {
  high: "#ef4444", medium: "#f59e0b", low: "#6b7280",
};

// ─── 부모→색상 상속 헬퍼 ──────────────────────────────────────
function getNodeColor(node: TreeNode, allNodes: TreeNode[]): string {
  if (node.type === "category") return node.color ?? "#3b82f6";
  if (node.parentId) {
    const parent = allNodes.find((n) => n.id === node.parentId);
    if (parent) return getNodeColor(parent, allNodes);
  }
  return "#3b82f6";
}

// ─── 트리 → React Flow 변환 ───────────────────────────────────
function buildFlow(
  data: FeaturesData,
  selectedId: string | null,
  onAddChild: (parentId: string) => void,
  onDelete: (id: string) => void,
  onAIExpand: (parentId: string) => void,
  expandingNodeId: string | null,
  aiBorn: AIBornSet,
): { nodes: Node[]; edges: Edge[] } {
  const rfNodes: Node[] = data.treeNodes.map((tn) => {
    const color = getNodeColor(tn, data.treeNodes);
    const isAIBorn = aiBorn.has(tn.id);
    return {
      id: tn.id,
      type: "treeNode",
      position: { x: 0, y: 0 },
      data: {
        nodeType: tn.type,
        label: tn.label,
        description: tn.description ?? "",
        color,
        priority: tn.priority,
        roles: tn.roles ?? [],
        selected: selectedId === tn.id,
        onAddChild,
        onDelete,
        onAIExpand,
        expanding: expandingNodeId === tn.id,
        aiBorn: isAIBorn,
      },
      className: isAIBorn ? "ai-node-fadein" : undefined,
      style: { width: NODE_W[tn.type], height: NODE_H[tn.type] },
    };
  });

  const rfEdges: Edge[] = data.treeNodes
    .filter((n) => n.parentId !== null)
    .map((n) => {
      const color = getNodeColor(n, data.treeNodes);
      return {
        id: `e-${n.parentId}-${n.id}`,
        source: n.parentId!,
        target: n.id,
        style: { stroke: color + "55", strokeWidth: 1.5 },
        markerEnd: { type: MarkerType.ArrowClosed, color: color + "88" },
      };
    });

  const laid = applyDagreLayout(rfNodes, rfEdges, {
    direction: "LR",
    nodesep: 20,
    ranksep: 80,
  });

  return { nodes: laid, edges: rfEdges };
}

// ─── 커스텀 노드 컴포넌트 ─────────────────────────────────────
function TreeNodeComponent({ id, data }: NodeProps) {
  const type = data.nodeType as TreeNodeType;
  const color = data.color as string;
  const isSelected = !!data.selected;
  const isExpanding = !!data.expanding;
  // category → 새 feature 생성, feature → 새 subfeature 생성
  const canAIExpand = type === "category" || type === "feature" || type === "subfeature";
  const aiLabel =
    type === "category" ? "AI로 기능 생성"
    : type === "feature" ? "AI로 세부기능 생성"
    : "AI로 더 세분화";

  const TYPE_LABEL: Record<TreeNodeType, string> = {
    root: "PRODUCT", category: "CATEGORY", feature: "FEATURE", subfeature: "SUB",
  };

  const BG: Record<TreeNodeType, string> = {
    root: "#1e293b", category: color + "22", feature: "#18181b", subfeature: "#101010",
  };

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        background: BG[type],
        border: `2px solid ${isSelected ? "#fff" : color + (type === "subfeature" ? "66" : "bb")}`,
        borderRadius: 10,
        padding: "8px 12px",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        gap: 3,
        boxShadow: isSelected ? `0 0 0 3px #ffffff33` : `0 0 14px ${color}22`,
        cursor: "pointer",
        position: "relative",
        overflow: "visible",
      }}
    >
      <Handle type="target" position={Position.Left}
        style={{ background: color, width: 8, height: 8, border: "2px solid #09090b" }} />

      {/* 타입 배지 */}
      <div style={{ fontSize: 8, fontWeight: 800, color, letterSpacing: 1.5, opacity: 0.8 }}>
        {TYPE_LABEL[type]}
      </div>

      {/* 라벨 */}
      <div style={{
        fontSize: type === "root" ? 13 : type === "category" ? 12 : 11,
        fontWeight: 700,
        color: "#f1f5f9",
        lineHeight: 1.3,
      }}>
        {data.label}
      </div>

      {/* 설명 */}
      {data.description && type !== "root" && (
        <div style={{ fontSize: 9, color: "#71717a", lineHeight: 1.4 }}>
          {data.description}
        </div>
      )}

      {/* 우선순위 점 */}
      {data.priority && (
        <div style={{ position: "absolute", top: 8, right: 8, width: 7, height: 7,
          borderRadius: "50%", background: PRIORITY_COLOR[data.priority] ?? "#6b7280" }} />
      )}

      {/* 호버 액션 버튼 (하위 추가 / 삭제) */}
      {type !== "root" && isSelected && (
        <div style={{
          position: "absolute", top: -14, right: -2,
          display: "flex", gap: 3, zIndex: 10,
        }}>
          <button
            onClick={(e) => { e.stopPropagation(); (data.onAddChild as (id: string) => void)(id); }}
            title="하위 항목 추가"
            style={{
              background: "#22c55e", color: "#fff", border: "none",
              borderRadius: 4, width: 20, height: 20, fontSize: 12,
              cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >+</button>
          <button
            onClick={(e) => { e.stopPropagation(); (data.onDelete as (id: string) => void)(id); }}
            title="삭제"
            style={{
              background: "#ef4444", color: "#fff", border: "none",
              borderRadius: 4, width: 20, height: 20, fontSize: 12,
              cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >×</button>
        </div>
      )}

      {/* ── AI 확장 버튼 (category / feature 전용) ── */}
      {canAIExpand && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (isExpanding) return;
            (data.onAIExpand as (id: string) => void)(id);
          }}
          disabled={isExpanding}
          title={aiLabel}
          className={isExpanding ? "ai-pulse" : ""}
          style={{
            position: "absolute",
            bottom: -11,
            left: "50%",
            transform: "translateX(-50%)",
            display: "flex",
            alignItems: "center",
            gap: 4,
            background: isExpanding ? "#1e293b" : "#0f172a",
            color: isExpanding ? "#a5b4fc" : color,
            border: `1px solid ${color}88`,
            borderRadius: 999,
            padding: "2px 8px 2px 6px",
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: 0.2,
            cursor: isExpanding ? "wait" : "pointer",
            boxShadow: `0 2px 8px #00000088, 0 0 0 2px #09090b`,
            zIndex: 11,
            whiteSpace: "nowrap",
          }}
        >
          <SparklesIcon size={10} />
          <span>{isExpanding ? "생성 중…" : aiLabel}</span>
        </button>
      )}

      <Handle type="source" position={Position.Right}
        style={{ background: color, width: 8, height: 8, border: "2px solid #09090b" }} />
    </div>
  );
}

// ─── nodeTypes 외부 정의 ──────────────────────────────────────
const nodeTypes = { treeNode: TreeNodeComponent };

// ─── ID 생성 헬퍼 ─────────────────────────────────────────────
function genId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}`;
}

// ─── 자식+후손 모두 삭제 ──────────────────────────────────────
function removeSubtree(nodes: TreeNode[], targetId: string): TreeNode[] {
  const toRemove = new Set<string>([targetId]);
  let changed = true;
  while (changed) {
    changed = false;
    nodes.forEach((n) => {
      if (n.parentId && toRemove.has(n.parentId) && !toRemove.has(n.id)) {
        toRemove.add(n.id);
        changed = true;
      }
    });
  }
  return nodes.filter((n) => !toRemove.has(n.id));
}

// ─── 메인 페이지 ──────────────────────────────────────────────
export default function FeaturesPage() {
  const router = useRouter();
  const { setPhase, setPresets, setCurrentContent, registerContentUpdater, unregisterContentUpdater } = useAI();

  // 원본 트리 데이터
  const [data, setData] = useState<FeaturesData | null>(null);
  // 선택된 노드 ID
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // 생성 중 상태
  const [generating, setGenerating] = useState(false);
  const [genDone, setGenDone] = useState(false);
  const [streamText, setStreamText] = useState("");
  const [error, setError] = useState("");
  const [hasPrd, setHasPrd] = useState(false);

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);


  // ── AI 확장 상태 ──────────────────────────────────────────────
  const [expandingNodeId, setExpandingNodeId] = useState<string | null>(null);
  const [aiBornNodes, setAiBornNodes] = useState<AIBornSet>(() => new Set());
  const aiBornRef = useRef<AIBornSet>(new Set());
  useEffect(() => { aiBornRef.current = aiBornNodes; }, [aiBornNodes]);

  // ── 토스트 ────────────────────────────────────────────────────
  const [toasts, setToasts] = useState<ToastMsg[]>([]);
  const pushToast = useCallback((kind: ToastMsg["kind"], text: string) => {
    const id = `t_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    setToasts((p) => [...p, { id, kind, text }]);
  }, []);
  const dismissToast = useCallback((id: string) => {
    setToasts((p) => p.filter((t) => t.id !== id));
  }, []);


  // 자동 저장 타이머
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── 핸들러 참조 (forward decl: useCallback 순환 회피) ───────
  const handlersRef = useRef<{
    addChild: (id: string) => void;
    deleteNode: (id: string) => void;
    expandWithAI: (id: string) => void;
  }>({ addChild: () => {}, deleteNode: () => {}, expandWithAI: () => {} });

  // ── 트리 → Flow 동기화 ──────────────────────────────────────
  const syncFlow = useCallback(
    (d: FeaturesData, selId: string | null, expId: string | null = null) => {
      const { nodes: n, edges: e } = buildFlow(
        d,
        selId,
        (pid) => handlersRef.current.addChild(pid),
        (pid) => handlersRef.current.deleteNode(pid),
        (pid) => handlersRef.current.expandWithAI(pid),
        expId,
        aiBornRef.current,
      );
      setNodes(n);
      setEdges(e);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  // ── 자동 저장 ───────────────────────────────────────────────
  const scheduleSave = useCallback((d: FeaturesData) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      fetch("/api/features", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(d),
      });
    }, 600);
  }, []);

  // ── 데이터 변경 헬퍼 ────────────────────────────────────────
  const updateData = useCallback(
    (updater: (prev: FeaturesData) => FeaturesData) => {
      setData((prev) => {
        if (!prev) return prev;
        const next = updater(prev);
        syncFlow(next, selectedId);
        scheduleSave(next);
        return next;
      });
    },
    [selectedId, syncFlow, scheduleSave]
  );

  // ── 하위 항목 추가 ──────────────────────────────────────────
  const addChild = useCallback(
    (parentId: string) => {
      setData((prev) => {
        if (!prev) return prev;
        const parent = prev.treeNodes.find((n) => n.id === parentId);
        if (!parent) return prev;

        // 부모 타입에 따라 자식 타입 결정
        const childType: TreeNodeType =
          parent.type === "root" ? "category"
          : parent.type === "category" ? "feature"
          : "subfeature";

        // 카테고리일 경우 색상 배정
        const catCount = prev.treeNodes.filter((n) => n.type === "category").length;
        const color = childType === "category"
          ? CAT_COLORS[catCount % CAT_COLORS.length]
          : undefined;

        const newNode: TreeNode = {
          id: genId(childType[0]),
          type: childType,
          label: childType === "category" ? "새 카테고리"
               : childType === "feature" ? "새 기능"
               : "새 하위기능",
          parentId,
          description: "",
          ...(color ? { color } : {}),
          ...(childType === "feature" ? { priority: "medium", roles: [] } : {}),
        };

        const next = { ...prev, treeNodes: [...prev.treeNodes, newNode] };
        syncFlow(next, newNode.id);
        scheduleSave(next);
        setSelectedId(newNode.id);
        return next;
      });
    },
    [syncFlow, scheduleSave]
  );

  // ── 노드 삭제 (후손 포함) ────────────────────────────────────
  const deleteNode = useCallback(
    (id: string) => {
      updateData((prev) => ({
        ...prev,
        treeNodes: removeSubtree(prev.treeNodes, id),
      }));
      setSelectedId(null);
    },
    [updateData]
  );

  // ── AI로 하위 노드 확장 ─────────────────────────────────────
  const expandWithAI = useCallback(
    async (parentId: string) => {
      // 현재 상태에서 부모/조부모 찾기
      const cur = data;
      if (!cur) return;
      const parent = cur.treeNodes.find((n) => n.id === parentId);
      if (!parent) return;
      if (parent.type !== "category" && parent.type !== "feature" && parent.type !== "subfeature") return;

      // 부모의 부모 라벨 (조부모 컨텍스트)
      const grandparent = parent.parentId
        ? cur.treeNodes.find((n) => n.id === parent.parentId)
        : null;

      setExpandingNodeId(parentId);
      // expanding 상태가 노드에 반영되도록 즉시 syncFlow
      syncFlow(cur, selectedId, parentId);

      try {
        const res = await fetch("/api/features/expand-node", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            nodeId: parentId,
            parentContext: {
              type: parent.type,
              label: parent.label,
              description: parent.description ?? "",
              grandparentLabel: grandparent?.label ?? "",
            },
            productName: cur.productName,
          }),
        });

        if (!res.ok) {
          const errText =
            res.status === 404
              ? "API가 아직 준비되지 않았습니다 (skill-dev 작업 중)"
              : `생성 실패 (${res.status})`;
          pushToast("error", errText);
          setExpandingNodeId(null);
          syncFlow(cur, selectedId, null);
          return;
        }

        // SSE 스트리밍 파싱 (workflow/features POST와 동일 패턴)
        const reader = res.body?.getReader();
        const dec = new TextDecoder();
        let newNodes: TreeNode[] | null = null;

        while (reader) {
          const { done, value } = await reader.read();
          if (done) break;
          for (const line of dec.decode(value).split("\n")) {
            if (!line.startsWith("data: ")) continue;
            const json = line.slice(6).trim();
            if (!json) continue;
            try {
              const event = JSON.parse(json);
              if (event.type === "done") {
                if (event.newNodes && Array.isArray(event.newNodes)) {
                  newNodes = event.newNodes as TreeNode[];
                } else if (event.error) {
                  pushToast("error", event.error);
                }
              }
            } catch {
              /* 파싱 실패 무시 */
            }
          }
        }

        if (!newNodes || newNodes.length === 0) {
          pushToast("error", "AI 응답이 비어있습니다");
          setExpandingNodeId(null);
          syncFlow(cur, selectedId, null);
          return;
        }

        // 자식 타입 보정 + parentId 강제 + 신규 ID 부여
        const childType: TreeNodeType =
          parent.type === "category" ? "feature" : "subfeature";
        // subfeature → subfeature (무한 중첩 허용)
        const stamped: TreeNode[] = newNodes.map((n, i) => ({
          ...n,
          id: `ai_${childType[0]}_${Date.now().toString(36)}_${i}`,
          type: childType,
          parentId: parentId,
        }));

        // 트리에 추가 + ai-born 마킹 + 페이드인 후 마킹 해제
        const stampedIds = stamped.map((s) => s.id);
        setAiBornNodes((prev) => {
          const next = new Set(prev);
          stampedIds.forEach((id) => next.add(id));
          aiBornRef.current = next;
          return next;
        });

        updateData((prev) => ({
          ...prev,
          treeNodes: [...prev.treeNodes, ...stamped],
        }));

        setExpandingNodeId(null);
        pushToast("success", `${stamped.length}개의 ${childType === "feature" ? "기능" : "세부기능"}을 생성했습니다`);

        // 800ms 후 ai-born 마킹 제거 (애니메이션 종료 후)
        setTimeout(() => {
          setAiBornNodes((prev) => {
            const next = new Set(prev);
            stampedIds.forEach((id) => next.delete(id));
            aiBornRef.current = next;
            return next;
          });
        }, 900);
      } catch (err) {
        pushToast("error", `네트워크 오류: ${err instanceof Error ? err.message : "알 수 없음"}`);
        setExpandingNodeId(null);
        if (data) syncFlow(data, selectedId, null);
      }
    },
    [data, selectedId, syncFlow, updateData, pushToast]
  );

  // 핸들러 참조 동기화 (TreeNodeComponent → 최신 클로저 호출용)
  useEffect(() => {
    handlersRef.current = { addChild, deleteNode, expandWithAI };
  }, [addChild, deleteNode, expandWithAI]);

  // ── 초기 로드 ───────────────────────────────────────────────
  useEffect(() => {
    setPhase("features");
    setPresets(["MVP 기능만 남기기", "기능 설명 구체화", "의존성 관계 추가", "우선순위 재정렬"]);
    fetch("/api/features")
      .then((r) => r.json())
      .then((d) => {
        if (d.exists && d.data?.treeNodes) {
          setData(d.data);
          syncFlow(d.data, null);
        }
      });
    fetch("/api/prd")
      .then((r) => r.json())
      .then((d) => setHasPrd(d.exists));
  }, [setPhase, setPresets, syncFlow]);

  // 글로벌 AI Context에 Features 데이터 등록
  useEffect(() => {
    setCurrentContent(data);
    registerContentUpdater(setData);
    return () => unregisterContentUpdater();
  }, [data, setCurrentContent, registerContentUpdater, unregisterContentUpdater]);

  // 선택 변경 시 Flow 재동기화
  useEffect(() => {
    if (data) syncFlow(data, selectedId, expandingNodeId);
  }, [selectedId]);

  // ── AI 생성 ─────────────────────────────────────────────────
  const generate = useCallback(async () => {
    setGenerating(true);
    setGenDone(false);
    setStreamText("");
    setError("");
    setData(null);
    setSelectedId(null);
    setNodes([]);
    setEdges([]);

    const res = await fetch("/api/features", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ instruction: "" }),
    });
    if (!res.ok) { setError("PRD를 먼저 생성해주세요."); setGenerating(false); return; }

    const reader = res.body?.getReader();
    const dec = new TextDecoder();

    while (reader) {
      const { done, value } = await reader.read();
      if (done) break;
      for (const line of dec.decode(value).split("\n")) {
        if (!line.startsWith("data: ")) continue;
        const json = line.slice(6).trim();
        if (!json) continue;
        const event = JSON.parse(json);
        if (event.type === "text") setStreamText((p) => p + event.text);
        if (event.type === "done") {
          if (event.features) {
            setData(event.features);
            syncFlow(event.features, null);
            setGenDone(true);
          } else setError(event.error ?? "파싱 실패");
        }
      }
    }
    setGenerating(false);
  }, [syncFlow]);

  // ── 선택 노드 정보 ──────────────────────────────────────────
  const selectedNode = data?.treeNodes?.find((n) => n.id === selectedId) ?? null;

  // 편집 핸들러
  const editField = (field: keyof TreeNode, value: string | string[]) => {
    if (!selectedId) return;
    updateData((prev) => ({
      ...prev,
      treeNodes: prev.treeNodes.map((n) =>
        n.id === selectedId ? { ...n, [field]: value } : n
      ),
    }));
  };

  const totalNodes = data?.treeNodes?.length ?? 0;
  const totalFeatures = data?.treeNodes?.filter((n) => n.type === "feature").length ?? 0;

  return (
    <div className="flex h-screen bg-zinc-950 text-zinc-100">
      <ToastStack toasts={toasts} onDismiss={dismissToast} />
      {/* ── 캔버스 영역 ─────────────────────────────────────── */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* 헤더 */}
        <div className="shrink-0 flex items-center justify-between px-6 py-4 border-b border-zinc-800">
          <div>
            <h1 className="text-xl font-bold">기능 명세서</h1>
            {data && (
              <p className="text-zinc-500 text-xs mt-0.5">
                {totalNodes}개 노드 · 기능 {totalFeatures}개
                <span className="ml-2 text-zinc-700">— 노드 클릭 시 편집 패널 열림</span>
              </p>
            )}
          </div>
          <div className="flex gap-2">
            {data && (
              <button onClick={generate} disabled={generating}
                className="px-3 py-1.5 border border-zinc-700 hover:border-zinc-500 text-zinc-400 rounded-lg text-xs transition-colors">
                재생성
              </button>
            )}
            {/* 이전 버전 토글 */}
            {!data && !generating && (
              <button onClick={hasPrd ? generate : () => router.push("/prd")}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors">
                {hasPrd ? "기능 명세서 생성하기" : "PRD 먼저 생성하기"}
              </button>
            )}
            {data && !generating && (
              <button onClick={() => router.push("/workflow")}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors">
                워크플로우 →
              </button>
            )}
          </div>
        </div>

        {/* 생성 중 — 진행률 */}
        {(generating || genDone) && !error && (
          <div className="shrink-0 px-6 py-4 bg-zinc-900 border-b border-zinc-800">
            <TerminalStream
              active={generating || genDone}
              done={genDone}
              streamText={streamText}
            />
          </div>
        )}
        {error && <div className="shrink-0 px-6 py-3 bg-red-950 border-b border-red-900 text-red-300 text-sm">{error}</div>}

        {/* React Flow 캔버스 */}
        {data ? (
          <div className="flex-1">
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onNodeClick={(_, node) => setSelectedId((prev) => prev === node.id ? null : node.id)}
              onPaneClick={() => setSelectedId(null)}
              fitView
              fitViewOptions={{ padding: 0.2 }}
              proOptions={{ hideAttribution: true }}
            >
              <Background variant={BackgroundVariant.Dots} color="#27272a" gap={24} />
              <Controls />
              <MiniMap style={{ background: "#18181b" }} nodeColor="#3b82f6" maskColor="#09090b88" />
            </ReactFlow>
          </div>
        ) : (
          !generating && (
            <div className="flex-1 flex flex-col items-center justify-center gap-4 text-zinc-600">
              <p className="text-5xl">🗂</p>
              <p className="text-sm">{hasPrd ? "기능 명세서 생성하기 버튼을 눌러 캔버스를 만드세요" : "PRD를 먼저 생성해야 합니다"}</p>
            </div>
          )
        )}
      </div>

      {/* ── 우측 편집 패널 ──────────────────────────────────── */}
      {selectedNode && (
        <div className="w-72 shrink-0 border-l border-zinc-800 bg-zinc-900 flex flex-col overflow-y-auto">
          <div className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between">
            <span className="text-sm font-semibold text-zinc-200">노드 편집</span>
            <button onClick={() => setSelectedId(null)} className="text-zinc-600 hover:text-zinc-400 text-lg">×</button>
          </div>

          <div className="flex-1 px-5 py-4 space-y-5">
            {/* 타입 배지 */}
            <div>
              <span className="text-xs text-zinc-500">타입</span>
              <div className="mt-1 text-xs font-bold text-blue-400 uppercase tracking-wide">
                {selectedNode.type}
              </div>
            </div>

            {/* 라벨 */}
            <div>
              <label className="text-xs text-zinc-500 block mb-1">이름</label>
              <input
                value={selectedNode.label}
                onChange={(e) => editField("label", e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-zinc-500"
              />
            </div>

            {/* 설명 */}
            <div>
              <label className="text-xs text-zinc-500 block mb-1">설명</label>
              <textarea
                value={selectedNode.description ?? ""}
                onChange={(e) => editField("description", e.target.value)}
                rows={3}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 resize-none focus:outline-none focus:border-zinc-500"
              />
            </div>

            {/* 우선순위 (feature/subfeature) */}
            {(selectedNode.type === "feature" || selectedNode.type === "subfeature") && (
              <div>
                <label className="text-xs text-zinc-500 block mb-1">우선순위</label>
                <select
                  value={selectedNode.priority ?? "medium"}
                  onChange={(e) => editField("priority", e.target.value)}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none"
                >
                  <option value="high">높음</option>
                  <option value="medium">중간</option>
                  <option value="low">낮음</option>
                </select>
              </div>
            )}

            {/* 하위 추가 버튼 */}
            {selectedNode.type !== "subfeature" && (
              <button
                onClick={() => addChild(selectedNode.id)}
                className="w-full py-2 border border-dashed border-zinc-600 hover:border-zinc-400 text-zinc-400 hover:text-zinc-200 rounded-lg text-sm transition-colors"
              >
                + 하위 항목 추가
              </button>
            )}

            {/* 삭제 */}
            {selectedNode.type !== "root" && (
              <button
                onClick={() => deleteNode(selectedNode.id)}
                className="w-full py-2 border border-red-900 hover:border-red-700 text-red-500 hover:text-red-400 rounded-lg text-sm transition-colors"
              >
                이 노드 삭제 (하위 포함)
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
