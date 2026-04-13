"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import ReactFlow, {
  Node, Edge, Background, Controls, MiniMap,
  useNodesState, useEdgesState, BackgroundVariant,
  Handle, Position, MarkerType, NodeProps,
} from "reactflow";
import "reactflow/dist/style.css";
import { applyDagreLayout } from "@/app/lib/dagre-layout";
import TerminalStream from "@/app/components/TerminalStream";
import SparklesIcon from "@/app/components/SparklesIcon";
import { ToastStack, type ToastMsg } from "@/app/components/Toast";
import { useAI } from "@/app/context/AIContext";

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

type FlowData = {
  id: string;
  title: string;
  description: string;
  nodes: WFNode[];
  edges: WFEdge[];
};

type SuggestItem = {
  id: string;
  title: string;
  description: string;
  checked: boolean;
};

// ─── 노드 크기 ────────────────────────────────────────────────
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
  const canExpand = nodeType !== "start" && nodeType !== "end";

  return (
    <div style={{
      width: "100%", height: "100%",
      background: s.bg, border: `2px solid ${isSelected ? "#fff" : s.border}`,
      borderRadius: 10, overflow: "hidden",
      boxShadow: isSelected
        ? `0 0 0 3px #ffffff33, 0 0 20px ${s.border}44`
        : `0 0 16px ${s.border}33`,
      cursor: "pointer", display: "flex", flexDirection: "column",
    }}>
      <div style={{
        background: s.badge, padding: "4px 12px",
        display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0,
      }}>
        <span style={{ fontSize: 9, fontWeight: 700, color: "#fff", letterSpacing: 1, textTransform: "uppercase" }}>
          {s.badgeText}
        </span>
        {nodeType === "decision" && (
          <span style={{ fontSize: 9, color: "#fde68a88" }}>예 / 아니오</span>
        )}
      </div>
      <div style={{ padding: "10px 14px", flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", gap: 4 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: s.text, lineHeight: 1.3 }}>{data.label}</div>
        {data.description && (
          <div style={{ fontSize: 10, color: "#71717a", lineHeight: 1.5 }}>{data.description}</div>
        )}
      </div>
      <Handle type="target" position={Position.Left}
        style={{ background: s.border, width: 10, height: 10, border: "2px solid #09090b" }} />
      <Handle type="source" position={Position.Right}
        style={{ background: s.border, width: 10, height: 10, border: "2px solid #09090b" }} />
      {canExpand && (isSelected || isExpanding) && (
        <button
          onClick={(e) => { e.stopPropagation(); if (isExpanding) return; (data.onAIExpand as (id: string) => void)(id); }}
          disabled={isExpanding}
          className={isExpanding ? "ai-pulse" : ""}
          style={{
            position: "absolute", bottom: -11, left: "50%", transform: "translateX(-50%)",
            display: "flex", alignItems: "center", gap: 4,
            background: isExpanding ? "#1e293b" : "#0f172a",
            color: isExpanding ? "#a5b4fc" : s.border,
            border: `1px solid ${s.border}aa`, borderRadius: 999,
            padding: "2px 9px 2px 7px", fontSize: 9, fontWeight: 700, letterSpacing: 0.2,
            cursor: isExpanding ? "wait" : "pointer",
            boxShadow: "0 2px 8px #00000088, 0 0 0 2px #09090b", zIndex: 11, whiteSpace: "nowrap",
          }}
        >
          <SparklesIcon size={10} />
          <span>{isExpanding ? "확장 중…" : "AI 확장"}</span>
        </button>
      )}
    </div>
  );
}

const nodeTypes = { step: StepNode };

// ─── FlowData → React Flow 변환 ───────────────────────────────
function buildFlow(
  flowData: FlowData, selectedId: string | null,
  onAIExpand: (id: string) => void, expandingNodeId: string | null, aiBorn: Set<string>,
): { nodes: Node[]; edges: Edge[] } {
  const rfNodes: Node[] = flowData.nodes.map((n) => ({
    id: n.id, type: "step", position: { x: 0, y: 0 },
    data: {
      nodeType: n.type, label: n.label, description: n.description,
      selected: selectedId === n.id, onAIExpand, expanding: expandingNodeId === n.id,
    },
    className: aiBorn.has(n.id) ? "ai-node-fadein" : undefined,
    style: { width: NODE_W, height: NODE_H },
  }));

  const rfEdges: Edge[] = flowData.edges.map((e) => {
    const isYes = e.label === "예" || e.label === "Yes";
    const isNo = e.label === "아니오" || e.label === "No";
    return {
      id: e.id, source: e.source, target: e.target, label: e.label,
      labelStyle: { fill: isYes ? "#22c55e" : isNo ? "#ef4444" : "#a1a1aa", fontSize: 11, fontWeight: 700 },
      labelBgStyle: { fill: "#09090b", fillOpacity: 0.95 },
      labelBgPadding: [5, 8] as [number, number], labelBgBorderRadius: 6,
      style: { stroke: isYes ? "#22c55e66" : isNo ? "#ef444466" : "#3f3f46", strokeWidth: 2 },
      markerEnd: { type: MarkerType.ArrowClosed, color: isYes ? "#22c55e" : isNo ? "#ef4444" : "#52525b" },
      animated: isYes,
    };
  });

  const laid = applyDagreLayout(rfNodes, rfEdges, { direction: "LR", nodesep: 60, ranksep: 180 });
  return { nodes: laid, edges: rfEdges };
}

function genId(prefix: string) { return `${prefix}_${Date.now().toString(36)}`; }

// ─── 범례 ─────────────────────────────────────────────────────
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
        <span className="flex items-center gap-1.5"><span className="w-5 h-0.5 bg-green-500 inline-block rounded" />예</span>
        <span className="flex items-center gap-1.5"><span className="w-5 h-0.5 bg-red-500 inline-block rounded" />아니오</span>
      </div>
    </div>
  );
}

// ─── 메인 페이지 ──────────────────────────────────────────────
export default function WorkflowPage() {
  const router = useRouter();
  const { setPhase, setPresets, setCurrentContent, registerContentUpdater, unregisterContentUpdater } = useAI();

  // ── 멀티 플로우 상태 ─────────────────────────────────────────
  const [flows, setFlows] = useState<FlowData[]>([]);
  const [activeFlowId, setActiveFlowId] = useState<string | null>(null);
  const activeFlowRef = useRef<FlowData | null>(null);
  const activeFlow = flows.find((f) => f.id === activeFlowId) ?? null;
  useEffect(() => { activeFlowRef.current = activeFlow; }, [activeFlow]);

  // ── 생성 상태 ────────────────────────────────────────────────
  const [generatingFlowId, setGeneratingFlowId] = useState<string | null>(null);
  const [pendingFlowIds, setPendingFlowIds] = useState<string[]>([]);
  const [genStream, setGenStream] = useState("");
  const [genDone, setGenDone] = useState(false);
  const [error, setError] = useState("");

  // ── PRD 상태 ─────────────────────────────────────────────────
  const [hasPrd, setHasPrd] = useState(false);
  const [statusLoaded, setStatusLoaded] = useState(false);

  // ── AI 제안 상태 ─────────────────────────────────────────────
  const [suggesting, setSuggesting] = useState(false);
  const [showSuggestPanel, setShowSuggestPanel] = useState(false);
  const [suggestItems, setSuggestItems] = useState<SuggestItem[]>([]);

  // ── 커스텀 흐름 추가 입력 ────────────────────────────────────
  const [showAddFlow, setShowAddFlow] = useState(false);
  const [addFlowTitle, setAddFlowTitle] = useState("");

  // ── 선택된 노드 ──────────────────────────────────────────────
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // ── ReactFlow 상태 ───────────────────────────────────────────
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  // ── AI 확장 상태 ─────────────────────────────────────────────
  const [expandingNodeId, setExpandingNodeId] = useState<string | null>(null);
  const [aiBornNodes, setAiBornNodes] = useState<Set<string>>(() => new Set());
  const aiBornRef = useRef<Set<string>>(new Set());
  useEffect(() => { aiBornRef.current = aiBornNodes; }, [aiBornNodes]);

  // ── 자동 저장 타이머 ─────────────────────────────────────────
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── 토스트 ───────────────────────────────────────────────────
  const [toasts, setToasts] = useState<ToastMsg[]>([]);
  const pushToast = useCallback((kind: ToastMsg["kind"], text: string) => {
    const id = `t_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    setToasts((p) => [...p, { id, kind, text }]);
  }, []);
  const dismissToast = useCallback((id: string) => {
    setToasts((p) => p.filter((t) => t.id !== id));
  }, []);

  // handlersRef: expandWithAI를 forward ref로 전달 (stale closure 방지)
  const handlersRef = useRef<{ expandWithAI: (id: string) => void }>({ expandWithAI: () => {} });

  // ── Flow 동기화 ──────────────────────────────────────────────
  const syncFlow = useCallback(
    (d: FlowData, selId: string | null, expId: string | null = null) => {
      const { nodes: n, edges: e } = buildFlow(
        d, selId,
        (id) => handlersRef.current.expandWithAI(id),
        expId, aiBornRef.current,
      );
      setNodes(n);
      setEdges(e);
    },
    [setNodes, setEdges]
  );

  // ── 탭 전환 시 Flow 동기화 ────────────────────────────────────
  useEffect(() => {
    setSelectedId(null);
    const flow = flows.find((f) => f.id === activeFlowId);
    if (flow && flow.nodes.length > 0) syncFlow(flow, null, null);
    else { setNodes([]); setEdges([]); }
  }, [activeFlowId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── 선택 변경 시 동기화 ──────────────────────────────────────
  useEffect(() => {
    if (activeFlow && activeFlow.nodes.length > 0) syncFlow(activeFlow, selectedId, expandingNodeId);
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── 자동 저장 ────────────────────────────────────────────────
  const scheduleSave = useCallback((flowId: string, data: FlowData) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      fetch("/api/workflow", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flowId, data }),
      });
    }, 600);
  }, []);

  // ── 활성 흐름 데이터 업데이트 ────────────────────────────────
  const updateActiveFlow = useCallback(
    (updater: (prev: FlowData) => FlowData, keepSel?: string | null) => {
      const curId = activeFlowId;
      if (!curId) return;
      setFlows((prev) => {
        const idx = prev.findIndex((f) => f.id === curId);
        if (idx < 0) return prev;
        const next = updater(prev[idx]);
        const newFlows = [...prev];
        newFlows[idx] = next;
        syncFlow(next, keepSel !== undefined ? keepSel : selectedId);
        scheduleSave(curId, next);
        return newFlows;
      });
    },
    [activeFlowId, selectedId, syncFlow, scheduleSave]
  );

  // ── 초기 로드 ────────────────────────────────────────────────
  useEffect(() => {
    setPhase("workflow");
    setPresets(["단계 간소화", "병렬 처리 추가", "에러 처리 강화", "승인 단계 추가"]);
    Promise.all([
      fetch("/api/workflow").then((r) => r.json()),
      fetch("/api/status").then((r) => r.json()),
    ]).then(([wf, status]) => {
      setHasPrd(!!status.prd);
      setStatusLoaded(true);
      if (wf.exists && wf.flows?.length) {
        setFlows(wf.flows);
        const first = wf.flows[0];
        setActiveFlowId(first.id);
        if (first.nodes?.length > 0) syncFlow(first, null);
      }
    });
  }, [setPhase, setPresets, syncFlow]);

  // ── AI Context 등록 ──────────────────────────────────────────
  useEffect(() => {
    setCurrentContent(activeFlow);
    registerContentUpdater((updated) => {
      if (!activeFlowId) return;
      setFlows((prev) =>
        prev.map((f) => f.id === activeFlowId ? { ...f, ...(updated as FlowData) } : f)
      );
    });
    return () => unregisterContentUpdater();
  }, [activeFlow, activeFlowId, setCurrentContent, registerContentUpdater, unregisterContentUpdater]);

  // ── 단일 흐름 생성 (SSE) ─────────────────────────────────────
  const generateFlow = useCallback(
    async (flowId: string, title: string, description: string, instruction = "") => {
      setGeneratingFlowId(flowId);
      setGenStream("");
      setGenDone(false);
      setError("");
      setActiveFlowId(flowId);

      const res = await fetch("/api/workflow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flowId, title, description, instruction }),
      });

      if (!res.ok) {
        setError("PRD를 먼저 생성해주세요.");
        setGeneratingFlowId(null);
        return false;
      }

      const reader = res.body?.getReader();
      const dec = new TextDecoder();
      let success = false;

      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;
        for (const line of dec.decode(value).split("\n")) {
          if (!line.startsWith("data: ")) continue;
          const json = line.slice(6).trim();
          if (!json) continue;
          try {
            const event = JSON.parse(json);
            if (event.type === "text") setGenStream((p) => p + event.text);
            if (event.type === "done") {
              if (event.flow) {
                const updated = { ...event.flow, id: flowId } as FlowData;
                setFlows((prev) => {
                  const idx = prev.findIndex((f) => f.id === flowId);
                  if (idx >= 0) { const n = [...prev]; n[idx] = updated; return n; }
                  return [...prev, updated];
                });
                syncFlow(updated, null);
                setGenDone(true);
                success = true;
              } else {
                pushToast("error", event.error ?? "파싱 실패");
              }
            }
          } catch { /* 무시 */ }
        }
      }
      setGeneratingFlowId(null);
      return success;
    },
    [syncFlow, pushToast]
  );

  // ── 배치 큐 (순차 생성) ──────────────────────────────────────
  const batchQueueRef = useRef<{ id: string; title: string; description: string }[]>([]);
  const batchRunningRef = useRef(false);

  const runBatch = useCallback(async () => {
    if (batchRunningRef.current) return;
    batchRunningRef.current = true;
    while (batchQueueRef.current.length > 0) {
      const item = batchQueueRef.current.shift()!;
      setPendingFlowIds((p) => p.filter((id) => id !== item.id));
      await generateFlow(item.id, item.title, item.description);
    }
    batchRunningRef.current = false;
  }, [generateFlow]);

  // ── AI 흐름 제안 ─────────────────────────────────────────────
  const suggestFlows = async () => {
    setSuggesting(true);
    setShowSuggestPanel(true);
    setSuggestItems([]);

    const res = await fetch("/api/workflow/suggest-flows", { method: "POST" });
    if (!res.ok || !res.body) { setSuggesting(false); return; }

    const reader = res.body.getReader();
    const dec = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      for (const line of dec.decode(value).split("\n")) {
        if (!line.startsWith("data: ")) continue;
        const json = line.slice(6).trim();
        if (!json) continue;
        try {
          const event = JSON.parse(json);
          if (event.type === "done" && event.flows) {
            setSuggestItems(
              (event.flows as { title: string; description: string }[]).map((f, i) => ({
                id: `suggest_${i}_${Date.now().toString(36)}`,
                title: f.title,
                description: f.description,
                checked: true,
              }))
            );
          }
        } catch { /* 무시 */ }
      }
    }
    setSuggesting(false);
  };

  // ── 선택된 제안 흐름 생성 ────────────────────────────────────
  const startGeneratingSuggestions = () => {
    const selected = suggestItems.filter((s) => s.checked);
    if (!selected.length) return;

    const newFlows: FlowData[] = selected.map((s) => ({
      id: s.id, title: s.title, description: s.description, nodes: [], edges: [],
    }));
    setFlows((prev) => [...prev, ...newFlows]);
    setPendingFlowIds(selected.map((s) => s.id));
    setShowSuggestPanel(false);

    batchQueueRef.current = [
      ...batchQueueRef.current,
      ...selected.map((s) => ({ id: s.id, title: s.title, description: s.description })),
    ];
    runBatch();
  };

  // ── 커스텀 흐름 추가 ─────────────────────────────────────────
  const addCustomFlow = (generate = false) => {
    if (!addFlowTitle.trim()) return;
    const flowId = genId("flow");
    const newFlow: FlowData = { id: flowId, title: addFlowTitle.trim(), description: "", nodes: [], edges: [] };
    setFlows((prev) => [...prev, newFlow]);
    setActiveFlowId(flowId);
    setAddFlowTitle("");
    setShowAddFlow(false);
    if (generate) {
      batchQueueRef.current = [...batchQueueRef.current, { id: flowId, title: newFlow.title, description: "" }];
      runBatch();
    }
  };

  // ── 흐름 삭제 ────────────────────────────────────────────────
  const deleteFlow = (flowId: string) => {
    setFlows((prev) => {
      const remaining = prev.filter((f) => f.id !== flowId);
      if (activeFlowId === flowId) {
        setActiveFlowId(remaining[0]?.id ?? null);
      }
      return remaining;
    });
    fetch(`/api/workflow?flowId=${flowId}`, { method: "DELETE" });
  };

  // ── 노드 편집 ────────────────────────────────────────────────
  const selectedNode = activeFlow?.nodes.find((n) => n.id === selectedId) ?? null;

  const editNodeField = (field: keyof WFNode, value: string) => {
    if (!selectedId) return;
    updateActiveFlow((prev) => ({
      ...prev,
      nodes: prev.nodes.map((n) => n.id === selectedId ? { ...n, [field]: value } : n),
    }));
  };

  // ── 노드 추가 ────────────────────────────────────────────────
  const addNode = (type: WFNodeType) => {
    const newNode: WFNode = {
      id: genId("n"), type,
      label: type === "start" ? "시작" : type === "end" ? "종료"
           : type === "action" ? "새 액션" : type === "decision" ? "분기 조건?" : "시스템 처리",
      description: "",
    };
    updateActiveFlow((prev) => ({ ...prev, nodes: [...prev.nodes, newNode] }), newNode.id);
    setSelectedId(newNode.id);
  };

  // ── 노드 삭제 ────────────────────────────────────────────────
  const deleteNode = (id: string) => {
    updateActiveFlow((prev) => ({
      ...prev,
      nodes: prev.nodes.filter((n) => n.id !== id),
      edges: prev.edges.filter((e) => e.source !== id && e.target !== id),
    }), null);
    setSelectedId(null);
  };

  // ── AI 노드 확장 ─────────────────────────────────────────────
  const expandWithAI = useCallback(
    async (sourceId: string) => {
      const cur = activeFlowRef.current;
      if (!cur) return;
      const sourceNode = cur.nodes.find((n) => n.id === sourceId);
      if (!sourceNode || sourceNode.type === "start" || sourceNode.type === "end") return;

      setExpandingNodeId(sourceId);
      syncFlow(cur, selectedId, sourceId);

      try {
        const res = await fetch("/api/workflow/expand-node", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            nodeId: sourceId,
            sourceNode: { type: sourceNode.type, label: sourceNode.label, description: sourceNode.description },
            workflowTitle: cur.title,
            workflowDescription: cur.description,
            existingNodeCount: cur.nodes.length,
          }),
        });

        if (!res.ok) {
          pushToast("error", `생성 실패 (${res.status})`);
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
                if (event.newNodes) result = { nodes: event.newNodes, edges: event.newEdges ?? [] };
                else if (event.error) pushToast("error", event.error);
              }
            } catch { /* 무시 */ }
          }
        }

        if (!result?.nodes?.length) {
          pushToast("error", "AI 응답이 비어있습니다");
          setExpandingNodeId(null);
          syncFlow(cur, selectedId, null);
          return;
        }

        const idMap = new Map<string, string>();
        const stamp = Date.now().toString(36);
        const stampedNodes: WFNode[] = result.nodes.map((n, i) => {
          const newId = `ai_${stamp}_${i}`;
          idMap.set(n.id, newId);
          return { ...n, id: newId };
        });
        const stampedEdges: WFEdge[] = (result.edges ?? []).map((e, i) => ({
          id: `ai_e_${stamp}_${i}`,
          source: idMap.get(e.source) ?? sourceId,
          target: idMap.get(e.target) ?? e.target,
          label: e.label,
        }));

        const firstNewId = stampedNodes[0].id;
        if (!stampedEdges.some((e) => e.target === firstNewId)) {
          stampedEdges.unshift({ id: `ai_e_${stamp}_link`, source: sourceId, target: firstNewId });
        }

        const newIds = stampedNodes.map((n) => n.id);
        setAiBornNodes((prev) => {
          const next = new Set(prev);
          newIds.forEach((id) => next.add(id));
          aiBornRef.current = next;
          return next;
        });

        updateActiveFlow((prev) => ({
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
        const cur2 = activeFlowRef.current;
        if (cur2) syncFlow(cur2, selectedId, null);
      }
    },
    [selectedId, syncFlow, updateActiveFlow, pushToast]
  );

  useEffect(() => { handlersRef.current = { expandWithAI }; }, [expandWithAI]);

  const isGenerating = !!generatingFlowId;
  const activeIsGenerating = generatingFlowId === activeFlowId;

  // ─── 렌더링 ────────────────────────────────────────────────
  return (
    <div className="flex h-screen bg-zinc-950 text-zinc-100">
      <ToastStack toasts={toasts} onDismiss={dismissToast} />

      {/* ── 캔버스 영역 ─────────────────────────────────────── */}
      <div className="flex flex-col flex-1 min-w-0">

        {/* 헤더 */}
        <div className="shrink-0 flex items-center justify-between px-6 py-4 border-b border-zinc-800">
          <h1 className="text-xl font-bold">유저 워크플로우</h1>
          <div className="flex items-center gap-2">
            <button
              onClick={suggestFlows}
              disabled={suggesting || !hasPrd}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-700 hover:bg-indigo-600 disabled:opacity-50 text-white rounded-lg text-xs font-medium transition-colors"
            >
              <SparklesIcon size={11} />
              {suggesting ? "분석 중…" : "AI 흐름 제안"}
            </button>
            {activeFlow && activeFlow.nodes.length > 0 && !isGenerating && (
              <button
                onClick={() => generateFlow(activeFlow.id, activeFlow.title, activeFlow.description)}
                className="px-3 py-1.5 border border-zinc-700 hover:border-zinc-500 text-zinc-400 rounded-lg text-xs transition-colors"
              >
                재생성
              </button>
            )}
            {!hasPrd && statusLoaded && (
              <button
                onClick={() => router.push("/prd")}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors"
              >
                PRD 먼저 생성하기
              </button>
            )}
          </div>
        </div>

        {/* 탭 바 */}
        <div className="shrink-0 flex items-center gap-0.5 px-3 py-2 border-b border-zinc-800 bg-zinc-900/30 overflow-x-auto">
          {flows.map((flow) => {
            const isActive = flow.id === activeFlowId;
            const isGen = generatingFlowId === flow.id;
            const isPending = pendingFlowIds.includes(flow.id);
            return (
              <div
                key={flow.id}
                onClick={() => !isActive && setActiveFlowId(flow.id)}
                className={`group flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs cursor-pointer border transition-colors shrink-0 ${
                  isActive
                    ? "bg-zinc-800 border-zinc-700 text-zinc-100"
                    : "border-transparent text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50"
                }`}
              >
                {/* 상태 표시 점 */}
                {isGen ? (
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse shrink-0" />
                ) : isPending ? (
                  <span className="w-1.5 h-1.5 rounded-full bg-zinc-600 shrink-0" />
                ) : flow.nodes.length > 0 ? (
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />
                ) : (
                  <span className="w-1.5 h-1.5 rounded-full bg-zinc-700 shrink-0" />
                )}
                <span className="max-w-[130px] truncate">{flow.title}</span>
                {isGen && <span className="text-[9px] text-blue-400 shrink-0">생성 중</span>}
                {isPending && !isGen && <span className="text-[9px] text-zinc-600 shrink-0">대기</span>}
                {/* 닫기 버튼 */}
                <button
                  onClick={(e) => { e.stopPropagation(); deleteFlow(flow.id); }}
                  className="w-3.5 h-3.5 flex items-center justify-center rounded text-zinc-600 hover:text-zinc-300 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 ml-0.5"
                >
                  ×
                </button>
              </div>
            );
          })}

          {/* + 버튼 / 인라인 입력 */}
          {showAddFlow ? (
            <div className="flex items-center gap-1.5 px-2 shrink-0">
              <input
                value={addFlowTitle}
                onChange={(e) => setAddFlowTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") addCustomFlow(true);
                  if (e.key === "Escape") { setShowAddFlow(false); setAddFlowTitle(""); }
                }}
                placeholder="흐름 제목 입력"
                autoFocus
                className="w-32 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
              />
              <button
                onClick={() => addCustomFlow(true)}
                className="px-2 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs transition-colors"
              >
                생성
              </button>
              <button
                onClick={() => addCustomFlow(false)}
                className="px-2 py-1 border border-zinc-700 text-zinc-400 rounded text-xs"
              >
                빈 탭
              </button>
              <button
                onClick={() => { setShowAddFlow(false); setAddFlowTitle(""); }}
                className="text-zinc-600 hover:text-zinc-400 text-xs"
              >
                취소
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowAddFlow(true)}
              className="flex items-center justify-center w-7 h-7 rounded-lg text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800 transition-colors shrink-0 text-sm"
            >
              +
            </button>
          )}

          {/* 배치 대기 카운트 */}
          {pendingFlowIds.length > 0 && (
            <div className="ml-auto flex items-center gap-1.5 text-[10px] text-zinc-500 shrink-0 pr-1">
              <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
              {pendingFlowIds.length}개 대기 중
            </div>
          )}
        </div>

        {/* AI 제안 패널 */}
        {showSuggestPanel && (
          <div className="shrink-0 px-6 py-4 bg-indigo-950/30 border-b border-indigo-800/40">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold text-indigo-200 flex items-center gap-2">
                <SparklesIcon size={12} />
                AI 흐름 제안
                {suggesting && <span className="text-xs text-indigo-400 font-normal">기능명세서 분석 중…</span>}
              </p>
              <button onClick={() => setShowSuggestPanel(false)} className="text-zinc-600 hover:text-zinc-400 text-xs">
                닫기
              </button>
            </div>

            {!suggesting && suggestItems.length > 0 && (
              <>
                <div className="grid grid-cols-2 gap-2 mb-3">
                  {suggestItems.map((item) => (
                    <label key={item.id} className="flex items-start gap-2.5 cursor-pointer group p-2 rounded-lg hover:bg-indigo-900/20 transition-colors">
                      <input
                        type="checkbox"
                        checked={item.checked}
                        onChange={(e) =>
                          setSuggestItems((prev) =>
                            prev.map((s) => s.id === item.id ? { ...s, checked: e.target.checked } : s)
                          )
                        }
                        className="mt-0.5 shrink-0 accent-indigo-500"
                      />
                      <div>
                        <p className="text-xs font-medium text-zinc-200 group-hover:text-white transition-colors">{item.title}</p>
                        <p className="text-[10px] text-zinc-500 mt-0.5 leading-relaxed">{item.description}</p>
                      </div>
                    </label>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={startGeneratingSuggestions}
                    disabled={!suggestItems.some((s) => s.checked)}
                    className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg text-xs font-medium transition-colors"
                  >
                    선택 흐름 생성 ({suggestItems.filter((s) => s.checked).length}개)
                  </button>
                  <button
                    onClick={() => setSuggestItems((p) => p.map((s) => ({ ...s, checked: true })))}
                    className="px-3 py-1.5 border border-zinc-700 text-zinc-400 rounded-lg text-xs transition-colors"
                  >
                    전체 선택
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* 범례 */}
        {activeFlow && activeFlow.nodes.length > 0 && <Legend />}

        {/* 생성 중 터미널 (활성 탭 생성 중일 때) */}
        {activeIsGenerating && (
          <div className="shrink-0 px-6 py-4 bg-zinc-900 border-b border-zinc-800">
            <p className="text-xs text-zinc-500 mb-2">{activeFlow?.title} 생성 중…</p>
            <TerminalStream active={true} done={genDone} streamText={genStream} />
          </div>
        )}

        {error && (
          <div className="shrink-0 px-6 py-3 bg-red-950 border-b border-red-900 text-red-300 text-sm">
            {error}
          </div>
        )}

        {/* 캔버스 */}
        {activeFlow && activeFlow.nodes.length > 0 ? (
          <div className="flex-1">
            <ReactFlow
              nodes={nodes} edges={edges} nodeTypes={nodeTypes}
              onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
              onNodeClick={(_, node) => setSelectedId((prev) => prev === node.id ? null : node.id)}
              onPaneClick={() => setSelectedId(null)}
              fitView fitViewOptions={{ padding: 0.2 }} proOptions={{ hideAttribution: true }}
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
          !isGenerating && (
            <div className="flex-1 flex flex-col items-center justify-center gap-4 text-zinc-600">
              <p className="text-5xl">🔀</p>
              {!statusLoaded ? (
                <p className="text-sm">로딩 중…</p>
              ) : !hasPrd ? (
                <p className="text-sm">PRD를 먼저 생성해야 합니다</p>
              ) : flows.length === 0 ? (
                <div className="text-center space-y-3">
                  <p className="text-sm">아직 생성된 흐름이 없습니다</p>
                  <button
                    onClick={suggestFlows}
                    disabled={suggesting}
                    className="flex items-center gap-2 mx-auto px-4 py-2 bg-indigo-700 hover:bg-indigo-600 text-white rounded-lg text-sm font-medium transition-colors"
                  >
                    <SparklesIcon size={13} />
                    AI로 흐름 제안받기
                  </button>
                </div>
              ) : activeFlow ? (
                <div className="text-center space-y-2">
                  <p className="text-sm text-zinc-500">{activeFlow.title}</p>
                  <button
                    onClick={() => generateFlow(activeFlow.id, activeFlow.title, activeFlow.description)}
                    className="mx-auto px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors"
                  >
                    이 흐름 생성하기
                  </button>
                </div>
              ) : null}
            </div>
          )
        )}
      </div>

      {/* ── 우측 편집 패널 ──────────────────────────────────── */}
      {activeFlow && (
        <div className="w-72 shrink-0 border-l border-zinc-800 bg-zinc-900 flex flex-col overflow-y-auto">
          <div className="px-5 py-4 border-b border-zinc-800">
            <span className="text-sm font-semibold text-zinc-200">편집 패널</span>
            {activeFlow.nodes.length > 0 && (
              <p className="text-xs text-zinc-600 mt-0.5">
                {activeFlow.nodes.length}개 노드 · {activeFlow.edges.length}개 연결
              </p>
            )}
          </div>

          {selectedNode ? (
            <div className="flex-1 px-5 py-4 space-y-5">
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
              <div>
                <label className="text-xs text-zinc-500 block mb-1">타입 변경</label>
                <select value={selectedNode.type} onChange={(e) => editNodeField("type", e.target.value)}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none">
                  <option value="start">시작</option>
                  <option value="end">종료</option>
                  <option value="action">액션</option>
                  <option value="decision">분기</option>
                  <option value="system">시스템</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-zinc-500 block mb-1">라벨 (10자 이내)</label>
                <input value={selectedNode.label} onChange={(e) => editNodeField("label", e.target.value)}
                  maxLength={15}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-zinc-500" />
              </div>
              <div>
                <label className="text-xs text-zinc-500 block mb-1">설명 (40자 이내)</label>
                <textarea value={selectedNode.description} onChange={(e) => editNodeField("description", e.target.value)}
                  maxLength={60} rows={3}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 resize-none focus:outline-none focus:border-zinc-500" />
              </div>
              {selectedNode.type !== "start" && selectedNode.type !== "end" && (
                <button onClick={() => expandWithAI(selectedNode.id)}
                  disabled={expandingNodeId === selectedNode.id}
                  className={`w-full py-2 border rounded-lg text-sm transition-colors flex items-center justify-center gap-2 ${
                    expandingNodeId === selectedNode.id
                      ? "border-indigo-700 bg-indigo-950 text-indigo-300 ai-pulse cursor-wait"
                      : "border-indigo-800 bg-indigo-950/40 text-indigo-300 hover:border-indigo-500 hover:text-indigo-200"
                  }`}>
                  <SparklesIcon size={13} />
                  <span>{expandingNodeId === selectedNode.id ? "AI 확장 중…" : "AI로 다음 흐름 확장"}</span>
                </button>
              )}
              <button onClick={() => deleteNode(selectedNode.id)}
                className="w-full py-2 border border-red-900 hover:border-red-700 text-red-500 hover:text-red-400 rounded-lg text-sm transition-colors">
                이 노드 삭제
              </button>
              <div className="text-xs text-zinc-700 pt-1">* 노드 간 연결은 캔버스에서 핸들을 드래그하세요</div>
            </div>
          ) : (
            <div className="flex-1 px-5 py-4 space-y-4">
              <p className="text-xs text-zinc-500">노드를 클릭하면 편집 가능합니다.</p>
              <div>
                <p className="text-xs text-zinc-500 mb-2">새 노드 추가</p>
                <div className="space-y-2">
                  {(Object.entries(STYLES) as [WFNodeType, typeof STYLES[WFNodeType]][]).map(([type, s]) => (
                    <button key={type} onClick={() => addNode(type)}
                      className="w-full flex items-center gap-3 px-3 py-2 rounded-lg border border-zinc-700 hover:border-zinc-500 transition-colors text-left">
                      <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
                        style={{ background: s.bg, border: `1.5px solid ${s.border}` }} />
                      <span className="text-xs" style={{ color: s.border }}>{s.badgeText}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="pt-2 border-t border-zinc-800 space-y-3">
                <p className="text-xs text-zinc-500">흐름 정보</p>
                <div>
                  <label className="text-xs text-zinc-600 block mb-1">제목</label>
                  <input value={activeFlow.title}
                    onChange={(e) => updateActiveFlow((prev) => ({ ...prev, title: e.target.value }))}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-zinc-500" />
                </div>
                <div>
                  <label className="text-xs text-zinc-600 block mb-1">시나리오 설명</label>
                  <textarea value={activeFlow.description}
                    onChange={(e) => updateActiveFlow((prev) => ({ ...prev, description: e.target.value }))}
                    rows={2}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 resize-none focus:outline-none focus:border-zinc-500" />
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
