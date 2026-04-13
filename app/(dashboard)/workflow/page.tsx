"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import InstructionInput from "@/app/components/InstructionInput";
import ReactFlow, {
  Node,
  Edge,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  BackgroundVariant,
  Handle,
  Position,
  MarkerType,
  NodeProps,
} from "reactflow";
import "reactflow/dist/style.css";
import { applyDagreLayout } from "@/app/lib/dagre-layout";
import TerminalStream from "@/app/components/TerminalStream";
import SparklesIcon from "@/app/components/SparklesIcon";
import { ToastStack, type ToastMsg } from "@/app/components/Toast";

// ─── 타입 ─────────────────────────────────────────────────────
type WFNodeType = "start" | "end" | "action" | "decision" | "system";

type WFNode = {
  id: string;
  type: WFNodeType;
  label: string;
  description: string;
};

type WFEdge = {
  id: string;
  source: string;
  target: string;
  label?: string;
};

type WorkflowData = {
  title: string;
  description: string;
  nodes: WFNode[];
  edges: WFEdge[];
};

// ─── 노드 크기 (dagre 입력용) ─────────────────────────────────
const NODE_W = 240;
const NODE_H = 96;

// ─── 노드 타입별 스타일 ────────────────────────────────────────
const STYLES: Record<WFNodeType, { bg: string; border: string; text: string; badge: string; badgeText: string }> = {
  start:    { bg: "#052e16", border: "#22c55e", text: "#dcfce7", badge: "#16a34a", badgeText: "시작" },
  end:      { bg: "#1c1917", border: "#78716c", text: "#d6d3d1", badge: "#57534e", badgeText: "종료" },
  action:   { bg: "#0c1a2e", border: "#3b82f6", text: "#bfdbfe", badge: "#1d4ed8", badgeText: "액션" },
  decision: { bg: "#1c0f00", border: "#f59e0b", text: "#fde68a", badge: "#b45309", badgeText: "분기" },
  system:   { bg: "#120c24", border: "#8b5cf6", text: "#ddd6fe", badge: "#6d28d9", badgeText: "시스템" },
};

// ─── 커스텀 노드 컴포넌트 ─────────────────────────────────────
function StepNode({ id, data }: NodeProps) {
  const nodeType = (data.nodeType as WFNodeType) ?? "action";
  const s = STYLES[nodeType];
  const isSelected = !!data.selected;
  const isExpanding = !!data.expanding;
  // start/end 노드는 확장 비활성 (의미 없음)
  const canExpand = nodeType !== "start" && nodeType !== "end";

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        background: s.bg,
        border: `2px solid ${isSelected ? "#fff" : s.border}`,
        borderRadius: 10,
        overflow: "hidden",
        boxShadow: isSelected
          ? `0 0 0 3px #ffffff33, 0 0 20px ${s.border}44`
          : `0 0 16px ${s.border}33`,
        cursor: "pointer",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* 타입 배지 */}
      <div
        style={{
          background: s.badge,
          padding: "4px 12px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: 9, fontWeight: 700, color: "#fff", letterSpacing: 1, textTransform: "uppercase" }}>
          {s.badgeText}
        </span>
        {nodeType === "decision" && (
          <span style={{ fontSize: 9, color: "#fde68a88" }}>예 / 아니오</span>
        )}
      </div>

      {/* 내용 */}
      <div style={{ padding: "10px 14px", flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", gap: 4 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: s.text, lineHeight: 1.3 }}>
          {data.label}
        </div>
        {data.description && (
          <div style={{ fontSize: 10, color: "#71717a", lineHeight: 1.5 }}>
            {data.description}
          </div>
        )}
      </div>

      {/* 핸들 */}
      <Handle
        type="target"
        position={Position.Left}
        style={{ background: s.border, width: 10, height: 10, border: "2px solid #09090b" }}
      />
      <Handle
        type="source"
        position={Position.Right}
        style={{ background: s.border, width: 10, height: 10, border: "2px solid #09090b" }}
      />

      {/* AI 확장 버튼 (선택 또는 호버 시 노출) */}
      {canExpand && (isSelected || isExpanding) && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (isExpanding) return;
            (data.onAIExpand as (id: string) => void)(id);
          }}
          disabled={isExpanding}
          title="이 단계 다음 흐름을 AI로 확장"
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
            color: isExpanding ? "#a5b4fc" : s.border,
            border: `1px solid ${s.border}aa`,
            borderRadius: 999,
            padding: "2px 9px 2px 7px",
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: 0.2,
            cursor: isExpanding ? "wait" : "pointer",
            boxShadow: "0 2px 8px #00000088, 0 0 0 2px #09090b",
            zIndex: 11,
            whiteSpace: "nowrap",
          }}
        >
          <SparklesIcon size={10} />
          <span>{isExpanding ? "확장 중…" : "AI 확장"}</span>
        </button>
      )}
    </div>
  );
}

// ─── nodeTypes 외부 정의 ──────────────────────────────────────
const nodeTypes = { step: StepNode };

// ─── WF 데이터 → React Flow 변환 (dagre 레이아웃) ─────────────
function buildFlow(
  wfData: WorkflowData,
  selectedId: string | null,
  onAIExpand: (id: string) => void,
  expandingNodeId: string | null,
  aiBorn: Set<string>,
): { nodes: Node[]; edges: Edge[] } {
  const rfNodes: Node[] = wfData.nodes.map((n) => {
    const isAIBorn = aiBorn.has(n.id);
    return {
      id: n.id,
      type: "step",
      position: { x: 0, y: 0 },
      data: {
        nodeType: n.type,
        label: n.label,
        description: n.description,
        selected: selectedId === n.id,
        onAIExpand,
        expanding: expandingNodeId === n.id,
      },
      className: isAIBorn ? "ai-node-fadein" : undefined,
      style: { width: NODE_W, height: NODE_H },
    };
  });

  const rfEdges: Edge[] = wfData.edges.map((e) => {
    const isYes = e.label === "예" || e.label === "Yes";
    const isNo = e.label === "아니오" || e.label === "No";
    return {
      id: e.id,
      source: e.source,
      target: e.target,
      label: e.label,
      labelStyle: { fill: isYes ? "#22c55e" : isNo ? "#ef4444" : "#a1a1aa", fontSize: 11, fontWeight: 700 },
      labelBgStyle: { fill: "#09090b", fillOpacity: 0.95 },
      labelBgPadding: [5, 8] as [number, number],
      labelBgBorderRadius: 6,
      style: { stroke: isYes ? "#22c55e66" : isNo ? "#ef444466" : "#3f3f46", strokeWidth: 2 },
      markerEnd: { type: MarkerType.ArrowClosed, color: isYes ? "#22c55e" : isNo ? "#ef4444" : "#52525b" },
      animated: isYes,
    };
  });

  const laid = applyDagreLayout(rfNodes, rfEdges, {
    direction: "LR",
    nodesep: 60,
    ranksep: 180,
  });

  return { nodes: laid, edges: rfEdges };
}

// ─── ID 생성 헬퍼 ─────────────────────────────────────────────
function genId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}`;
}

// ─── 범례 컴포넌트 ────────────────────────────────────────────
function Legend() {
  return (
    <div className="shrink-0 flex items-center gap-5 px-6 py-2 border-b border-zinc-800 bg-zinc-900/40">
      {(Object.entries(STYLES) as [WFNodeType, typeof STYLES[WFNodeType]][]).map(([type, s]) => (
        <div key={type} className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm" style={{ background: s.bg, border: `1.5px solid ${s.border}` }} />
          <span className="text-xs text-zinc-500">{s.badgeText}</span>
        </div>
      ))}
      <div className="ml-auto flex items-center gap-4 text-xs text-zinc-600">
        <span className="flex items-center gap-1.5">
          <span className="w-5 h-0.5 bg-green-500 inline-block rounded" />예
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-5 h-0.5 bg-red-500 inline-block rounded" />아니오
        </span>
      </div>
    </div>
  );
}

// ─── 메인 페이지 ──────────────────────────────────────────────
export default function WorkflowPage() {
  const router = useRouter();
  const [workflowData, setWorkflowData] = useState<WorkflowData | null>(null);
  const [generating, setGenerating] = useState(false);
  const [genDone, setGenDone] = useState(false);
  const [streamText, setStreamText] = useState("");
  const [error, setError] = useState("");
  const [hasPrd, setHasPrd] = useState(false);
  const [statusLoaded, setStatusLoaded] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  // 지시사항 + 이전 버전
  const [instruction, setInstruction] = useState("");
  const instructionRef = useRef("");
  const [prevWorkflow, setPrevWorkflow] = useState<WorkflowData | null>(null);
  useEffect(() => { instructionRef.current = instruction; }, [instruction]);

  // 자동 저장 타이머
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── AI 확장 상태 ──────────────────────────────────────────────
  const [expandingNodeId, setExpandingNodeId] = useState<string | null>(null);
  const [aiBornNodes, setAiBornNodes] = useState<Set<string>>(() => new Set());
  const aiBornRef = useRef<Set<string>>(new Set());
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

  // ── 핸들러 forward ref ────────────────────────────────────────
  const handlersRef = useRef<{ expandWithAI: (id: string) => void }>({
    expandWithAI: () => {},
  });

  // ── Flow 동기화 ─────────────────────────────────────────────
  const syncFlow = useCallback(
    (d: WorkflowData, selId: string | null, expId: string | null = null) => {
      const { nodes: n, edges: e } = buildFlow(
        d,
        selId,
        (id) => handlersRef.current.expandWithAI(id),
        expId,
        aiBornRef.current,
      );
      setNodes(n);
      setEdges(e);
    },
    [setNodes, setEdges]
  );

  // ── 자동 저장 ───────────────────────────────────────────────
  const scheduleSave = useCallback((d: WorkflowData) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      fetch("/api/workflow", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(d),
      });
    }, 600);
  }, []);

  // ── 데이터 변경 헬퍼 ────────────────────────────────────────
  const updateData = useCallback((updater: (prev: WorkflowData) => WorkflowData, keepSel?: string | null) => {
    setWorkflowData((prev) => {
      if (!prev) return prev;
      const next = updater(prev);
      const sel = keepSel !== undefined ? keepSel : selectedId;
      syncFlow(next, sel);
      scheduleSave(next);
      return next;
    });
  }, [selectedId, syncFlow, scheduleSave]);

  // ── 초기 로드 ───────────────────────────────────────────────
  useEffect(() => {
    Promise.all([
      fetch("/api/workflow").then((r) => r.json()),
      fetch("/api/workflow?prev=true").then((r) => r.json()),
      fetch("/api/status").then((r) => r.json()),
    ]).then(([wf, prev, status]) => {
      setHasPrd(!!status.prd);
      setStatusLoaded(true);
      if (wf.exists && wf.data?.nodes) {
        setWorkflowData(wf.data);
        syncFlow(wf.data, null);
      }
      if (prev.exists && prev.data?.nodes) setPrevWorkflow(prev.data);
    });
  }, []);

  // 선택 변경 시 Flow 재동기화
  useEffect(() => {
    if (workflowData) syncFlow(workflowData, selectedId, expandingNodeId);
  }, [selectedId]);

  // ── AI 생성 ─────────────────────────────────────────────────
  const generate = useCallback(async () => {
    // 현재 워크플로우를 이전 버전으로 보관
    setWorkflowData((cur) => { if (cur) setPrevWorkflow(cur); return cur; });

    setGenerating(true);
    setGenDone(false);
    setStreamText("");
    setError("");
    setWorkflowData(null);
    setSelectedId(null);
    setNodes([]);
    setEdges([]);

    const res = await fetch("/api/workflow", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ instruction: instructionRef.current }),
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
          if (event.workflow) {
            setWorkflowData(event.workflow);
            syncFlow(event.workflow, null);
            setGenDone(true);
          } else {
            setError(event.error ?? "파싱 실패");
          }
        }
      }
    }
    setGenerating(false);
  }, [syncFlow]);

  // ── 노드 편집 ───────────────────────────────────────────────
  const selectedNode = workflowData?.nodes.find((n) => n.id === selectedId) ?? null;

  const editNodeField = (field: keyof WFNode, value: string) => {
    if (!selectedId) return;
    updateData((prev) => ({
      ...prev,
      nodes: prev.nodes.map((n) => n.id === selectedId ? { ...n, [field]: value } : n),
    }));
  };

  // ── 노드 추가 ───────────────────────────────────────────────
  const addNode = (type: WFNodeType) => {
    const newNode: WFNode = {
      id: genId("n"),
      type,
      label: type === "start" ? "시작" : type === "end" ? "종료"
           : type === "action" ? "새 액션" : type === "decision" ? "분기 조건?"
           : "시스템 처리",
      description: "",
    };
    updateData((prev) => ({
      ...prev,
      nodes: [...prev.nodes, newNode],
    }), newNode.id);
    setSelectedId(newNode.id);
  };

  // ── 노드 삭제 (연결된 엣지 포함) ─────────────────────────────
  const deleteNode = (id: string) => {
    updateData((prev) => ({
      ...prev,
      nodes: prev.nodes.filter((n) => n.id !== id),
      edges: prev.edges.filter((e) => e.source !== id && e.target !== id),
    }), null);
    setSelectedId(null);
  };

  // ── AI 확장: 선택된 노드 이후의 흐름을 생성해 트리에 합치기 ──
  const expandWithAI = useCallback(
    async (sourceId: string) => {
      const cur = workflowData;
      if (!cur) return;
      const sourceNode = cur.nodes.find((n) => n.id === sourceId);
      if (!sourceNode) return;
      if (sourceNode.type === "start" || sourceNode.type === "end") return;

      setExpandingNodeId(sourceId);
      syncFlow(cur, selectedId, sourceId);

      try {
        const res = await fetch("/api/workflow/expand-node", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            nodeId: sourceId,
            sourceNode: {
              type: sourceNode.type,
              label: sourceNode.label,
              description: sourceNode.description,
            },
            workflowTitle: cur.title,
            workflowDescription: cur.description,
            existingNodeCount: cur.nodes.length,
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

        const reader = res.body?.getReader();
        const dec = new TextDecoder();
        let result: { nodes?: WFNode[]; edges?: WFEdge[] } | null = null;

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
                  result = { nodes: event.newNodes, edges: event.newEdges ?? [] };
                } else if (event.error) {
                  pushToast("error", event.error);
                }
              }
            } catch {
              /* 무시 */
            }
          }
        }

        if (!result?.nodes || result.nodes.length === 0) {
          pushToast("error", "AI 응답이 비어있습니다");
          setExpandingNodeId(null);
          syncFlow(cur, selectedId, null);
          return;
        }

        // 신규 노드 ID 충돌 방지 — id 재발급 + 엣지 매핑
        const idMap = new Map<string, string>();
        const stamp = Date.now().toString(36);
        const stampedNodes: WFNode[] = result.nodes.map((n, i) => {
          const newId = `ai_${stamp}_${i}`;
          idMap.set(n.id, newId);
          return { ...n, id: newId };
        });

        const stampedEdges: WFEdge[] = (result.edges ?? []).map((e, i) => {
          // source가 AI가 만든 신규 ID면 매핑, 아니면 sourceId(부모)로 연결
          const src = idMap.get(e.source) ?? sourceId;
          const tgt = idMap.get(e.target) ?? e.target;
          return {
            id: `ai_e_${stamp}_${i}`,
            source: src,
            target: tgt,
            label: e.label,
          };
        });

        // 첫 노드는 sourceId에서 자동 연결 (AI가 빠뜨릴 경우 보강)
        const firstNewId = stampedNodes[0].id;
        const hasIncoming = stampedEdges.some((e) => e.target === firstNewId);
        if (!hasIncoming) {
          stampedEdges.unshift({
            id: `ai_e_${stamp}_link`,
            source: sourceId,
            target: firstNewId,
          });
        }

        // 페이드인 마킹
        const newIds = stampedNodes.map((n) => n.id);
        setAiBornNodes((prev) => {
          const next = new Set(prev);
          newIds.forEach((id) => next.add(id));
          aiBornRef.current = next;
          return next;
        });

        updateData((prev) => ({
          ...prev,
          nodes: [...prev.nodes, ...stampedNodes],
          edges: [...prev.edges, ...stampedEdges],
        }));

        setExpandingNodeId(null);
        pushToast("success", `${stampedNodes.length}개 노드를 추가했습니다`);

        setTimeout(() => {
          setAiBornNodes((prev) => {
            const next = new Set(prev);
            newIds.forEach((id) => next.delete(id));
            aiBornRef.current = next;
            return next;
          });
        }, 900);
      } catch (err) {
        pushToast("error", `네트워크 오류: ${err instanceof Error ? err.message : "알 수 없음"}`);
        setExpandingNodeId(null);
        if (workflowData) syncFlow(workflowData, selectedId, null);
      }
    },
    [workflowData, selectedId, syncFlow, updateData, pushToast]
  );

  useEffect(() => {
    handlersRef.current = { expandWithAI };
  }, [expandWithAI]);

  return (
    <div className="flex h-screen bg-zinc-950 text-zinc-100">
      <ToastStack toasts={toasts} onDismiss={dismissToast} />
      {/* ── 캔버스 영역 ─────────────────────────────────────── */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* 헤더 */}
        <div className="shrink-0 flex items-center justify-between px-6 py-4 border-b border-zinc-800">
          <div>
            <h1 className="text-xl font-bold">유저 워크플로우</h1>
            {workflowData && (
              <p className="text-zinc-500 text-xs mt-0.5">
                {workflowData.title} — {workflowData.nodes.length}개 노드 · {workflowData.edges.length}개 연결
                <span className="ml-2 text-zinc-700">— 노드 클릭 시 편집 패널 열림</span>
              </p>
            )}
          </div>
          <div className="flex gap-2">
            {prevWorkflow && !generating && (
              <button
                onClick={() => {
                  if (workflowData) setPrevWorkflow(workflowData);
                  setWorkflowData(prevWorkflow);
                  syncFlow(prevWorkflow, null);
                }}
                className="px-3 py-1.5 border border-zinc-700 hover:border-amber-600 text-zinc-500 hover:text-amber-300 rounded-lg text-xs transition-colors"
              >
                ↩ 이전 버전
              </button>
            )}
            {workflowData && (
              <button onClick={generate} disabled={generating}
                className="px-3 py-1.5 border border-zinc-700 hover:border-zinc-500 text-zinc-400 rounded-lg text-xs transition-colors">
                재생성
              </button>
            )}
            {!workflowData && !generating && statusLoaded && (
              <button onClick={hasPrd ? generate : () => router.push("/prd")}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors">
                {hasPrd ? "워크플로우 생성하기" : "PRD 먼저 생성하기"}
              </button>
            )}
          </div>
        </div>

        {/* 지시사항 입력창 */}
        <div className="shrink-0 px-6 pt-3 pb-0">
          <InstructionInput
            value={instruction}
            onChange={setInstruction}
            disabled={generating}
            placeholder="예: 결제 실패 분기를 추가해줘. 관리자 승인 단계를 넣어줘. 노드를 12개 이하로 줄여줘."
          />
        </div>

        {/* 범례 */}
        {workflowData && <Legend />}

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

        {error && (
          <div className="shrink-0 px-6 py-3 bg-red-950 border-b border-red-900 text-red-300 text-sm">{error}</div>
        )}

        {/* 캔버스 */}
        {workflowData ? (
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
              <MiniMap
                style={{ background: "#18181b" }}
                nodeColor={(n) => STYLES[(n.data as { nodeType: WFNodeType }).nodeType]?.border ?? "#3b82f6"}
                maskColor="#09090b88"
              />
            </ReactFlow>
          </div>
        ) : (
          !generating && (
            <div className="flex-1 flex flex-col items-center justify-center gap-4 text-zinc-600">
              <p className="text-5xl">🔀</p>
              {!statusLoaded
                ? <p className="text-sm">로딩 중...</p>
                : hasPrd
                  ? <p className="text-sm">워크플로우 생성하기 버튼을 눌러 플로우차트를 만드세요</p>
                  : <p className="text-sm">PRD를 먼저 생성해야 합니다</p>
              }
            </div>
          )
        )}
      </div>

      {/* ── 우측 편집 패널 ──────────────────────────────────── */}
      {workflowData && (
        <div className="w-72 shrink-0 border-l border-zinc-800 bg-zinc-900 flex flex-col overflow-y-auto">
          <div className="px-5 py-4 border-b border-zinc-800">
            <span className="text-sm font-semibold text-zinc-200">편집 패널</span>
          </div>

          {/* 선택된 노드 편집 */}
          {selectedNode ? (
            <div className="flex-1 px-5 py-4 space-y-5">
              {/* 타입 표시 */}
              <div>
                <span className="text-xs text-zinc-500">타입</span>
                <div className="mt-1 flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-sm"
                    style={{ background: STYLES[selectedNode.type].bg, border: `1.5px solid ${STYLES[selectedNode.type].border}` }} />
                  <span className="text-xs font-bold uppercase tracking-wide"
                    style={{ color: STYLES[selectedNode.type].border }}>
                    {STYLES[selectedNode.type].badgeText}
                  </span>
                </div>
              </div>

              {/* 타입 변경 */}
              <div>
                <label className="text-xs text-zinc-500 block mb-1">타입 변경</label>
                <select
                  value={selectedNode.type}
                  onChange={(e) => editNodeField("type", e.target.value)}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none"
                >
                  <option value="start">시작</option>
                  <option value="end">종료</option>
                  <option value="action">액션</option>
                  <option value="decision">분기</option>
                  <option value="system">시스템</option>
                </select>
              </div>

              {/* 라벨 */}
              <div>
                <label className="text-xs text-zinc-500 block mb-1">라벨 (10자 이내)</label>
                <input
                  value={selectedNode.label}
                  onChange={(e) => editNodeField("label", e.target.value)}
                  maxLength={15}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-zinc-500"
                />
              </div>

              {/* 설명 */}
              <div>
                <label className="text-xs text-zinc-500 block mb-1">설명 (40자 이내)</label>
                <textarea
                  value={selectedNode.description}
                  onChange={(e) => editNodeField("description", e.target.value)}
                  maxLength={60}
                  rows={3}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 resize-none focus:outline-none focus:border-zinc-500"
                />
              </div>

              {/* AI 확장 (start/end 제외) */}
              {selectedNode.type !== "start" && selectedNode.type !== "end" && (
                <button
                  onClick={() => expandWithAI(selectedNode.id)}
                  disabled={expandingNodeId === selectedNode.id}
                  className={`w-full py-2 border rounded-lg text-sm transition-colors flex items-center justify-center gap-2 ${
                    expandingNodeId === selectedNode.id
                      ? "border-indigo-700 bg-indigo-950 text-indigo-300 ai-pulse cursor-wait"
                      : "border-indigo-800 bg-indigo-950/40 text-indigo-300 hover:border-indigo-500 hover:text-indigo-200"
                  }`}
                >
                  <SparklesIcon size={13} />
                  <span>{expandingNodeId === selectedNode.id ? "AI 확장 중…" : "AI로 다음 흐름 확장"}</span>
                </button>
              )}

              {/* 삭제 */}
              <button
                onClick={() => deleteNode(selectedNode.id)}
                className="w-full py-2 border border-red-900 hover:border-red-700 text-red-500 hover:text-red-400 rounded-lg text-sm transition-colors"
              >
                이 노드 삭제
              </button>

              <div className="text-xs text-zinc-700 pt-1">
                * 노드 간 연결은 React Flow 캔버스에서 핸들을 드래그해 만드세요
              </div>
            </div>
          ) : (
            /* 노드 미선택 → 새 노드 추가 패널 */
            <div className="flex-1 px-5 py-4 space-y-4">
              <p className="text-xs text-zinc-500">노드를 클릭하면 편집 가능합니다.</p>
              <div>
                <p className="text-xs text-zinc-500 mb-2">새 노드 추가</p>
                <div className="space-y-2">
                  {(Object.entries(STYLES) as [WFNodeType, typeof STYLES[WFNodeType]][]).map(([type, s]) => (
                    <button
                      key={type}
                      onClick={() => addNode(type)}
                      className="w-full flex items-center gap-3 px-3 py-2 rounded-lg border border-zinc-700 hover:border-zinc-500 transition-colors text-left"
                    >
                      <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
                        style={{ background: s.bg, border: `1.5px solid ${s.border}` }} />
                      <span className="text-xs" style={{ color: s.border }}>{s.badgeText}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* 워크플로우 메타 편집 */}
              <div className="pt-2 border-t border-zinc-800 space-y-3">
                <p className="text-xs text-zinc-500">워크플로우 정보</p>
                <div>
                  <label className="text-xs text-zinc-600 block mb-1">제목</label>
                  <input
                    value={workflowData.title}
                    onChange={(e) => updateData((prev) => ({ ...prev, title: e.target.value }))}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-zinc-500"
                  />
                </div>
                <div>
                  <label className="text-xs text-zinc-600 block mb-1">설명</label>
                  <textarea
                    value={workflowData.description}
                    onChange={(e) => updateData((prev) => ({ ...prev, description: e.target.value }))}
                    rows={2}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 resize-none focus:outline-none focus:border-zinc-500"
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
