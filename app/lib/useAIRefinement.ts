'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

// ─── 타입 정의 ──────────────────────────────────────────────
export interface UseAIRefinementOptions<T> {
  phase: string;                      // "prd", "sprint-plan", "ralph-loop", "claude-md"
  format: 'json' | 'markdown';        // 콘텐츠 형식
  currentContent: T;                  // 현재 콘텐츠 (JSON 객체 또는 마크다운 문자열)
  onContentChange: (next: T) => void; // 수정 반영 콜백
  serializer?: (content: T) => string;// stringify (기본: JSON.stringify)
  parser?: (text: string) => T;       // parse (기본: JSON.parse)
}

export interface UseAIRefinementReturn {
  isRefining: boolean;                // 수정 진행 중 여부
  refineProgress: string;             // 실시간 진행 상황 (스트리밍 텍스트)
  currentVersion: string;             // 현재 활성 버전 (v1, v2, ...)
  versionRefresh: number;             // 버전 목록 새로고침 트리거
  error: string | null;               // 에러 메시지
  handleRefine: (instruction: string) => Promise<void>;      // 수정 요청
  handleRestore: (version: string) => Promise<void>;         // 버전 복원
  handleSelectVersion: (version: string, content: string) => void; // 버전 선택
}

// ─── 공통 SSE 스트리밍 헬퍼 ────────────────────────────────
async function streamFromApi(
  url: string,
  onText: (t: string) => void,
  onDone: (event?: Record<string, unknown>) => void,
  instruction?: string,
  extraBody?: Record<string, unknown>,
) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ instruction: instruction ?? '', ...extraBody }),
  });
  if (!res.ok) {
    onDone({ type: 'error', text: 'API 호출 실패' });
    return;
  }

  const reader = res.body?.getReader();
  const dec = new TextDecoder();
  while (reader) {
    const { done, value } = await reader.read();
    if (done) break;
    for (const line of dec.decode(value).split('\n')) {
      if (!line.startsWith('data: ')) continue;
      const json = line.slice(6).trim();
      if (!json) continue;
      try {
        const event = JSON.parse(json);
        if (event.type === 'text') onText(event.text);
        if (event.type === 'done') onDone(event);
        // error 이벤트도 onDone으로 전달하여 UI에서 로딩 상태 해제
        if (event.type === 'error') onDone({ ...event, type: 'done' });
      } catch {
        // JSON 파싱 실패 무시
      }
    }
  }
}

// ─── useAIRefinement 훅 ──────────────────────────────────
export function useAIRefinement<T>(
  options: UseAIRefinementOptions<T>
): UseAIRefinementReturn {
  const {
    phase,
    format,
    currentContent,
    onContentChange,
    serializer = JSON.stringify,
    parser = JSON.parse,
  } = options;

  // ──── 상태 ────────────────────────────────────────────
  const [isRefining, setIsRefining] = useState(false);
  const [refineProgress, setRefineProgress] = useState('');
  const [currentVersion, setCurrentVersion] = useState('v1');
  const [versionRefresh, setVersionRefresh] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // 최신 콘텐츠를 ref로 관리하여 handleRefine의 불필요한 재생성 방지
  const contentRef = useRef(currentContent);
  const updateRef = (value: any) => { contentRef.current = value; };
  useEffect(() => updateRef(currentContent), [currentContent]);

  // ──── SSE 스트리밍으로 AI 수정 요청 ────────────────────
  const handleRefine = useCallback(
    async (instruction: string) => {
      setIsRefining(true);
      setRefineProgress('');
      setError(null);

      let fullContent = '';
      await streamFromApi(
        `/api/ai-results/${phase}/refine`,
        (text) => {
          fullContent += text;
          setRefineProgress((prev) => prev + text);
        },
        (event) => {
          // 스트림 완료 시
          if (event?.type === 'done') {
            // 수정된 내용을 상태에 반영
            try {
              if (format === 'json') {
                const parsed = parser(fullContent);
                onContentChange(parsed);
              } else {
                onContentChange(fullContent as unknown as T);
              }
            } catch (err) {
              setError(`파싱 실패: ${err instanceof Error ? err.message : '알 수 없음'}`);
              setIsRefining(false);
              setRefineProgress('');
              return;
            }

            // 버전 업데이트
            if (event.newVersion) {
              setCurrentVersion(event.newVersion as string);
              setVersionRefresh((prev) => prev + 1);
            }
          } else if (event?.type === 'error') {
            setError(event.text as string);
          }

          setIsRefining(false);
          setRefineProgress('');
        },
        instruction,
        { context: serializer(contentRef.current), format },
      );
    },
    [phase, format, serializer, onContentChange, parser]
    // currentContent는 ref로 관리하므로 dependency 제외
  );

  // ──── 버전 복원 ────────────────────────────────────────
  const handleRestore = useCallback(
    async (version: string) => {
      try {
        setError(null);
        const res = await fetch(`/api/ai-results/${phase}/restore`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ toVersion: version }),
        });
        if (!res.ok) throw new Error('복원 실패');
        const data = await res.json();

        // 복원된 내용 로드
        const vRes = await fetch(`/api/ai-results/${phase}/versions/${data.newVersion}`);
        if (!vRes.ok) throw new Error(`버전 조회 실패: ${vRes.status}`);
        const vData = await vRes.json();

        // 상태에 반영
        try {
          if (format === 'json') {
            const parsed = parser(vData.content);
            onContentChange(parsed);
          } else {
            onContentChange(vData.content as unknown as T);
          }
        } catch (err) {
          setError(`파싱 실패: ${err instanceof Error ? err.message : '알 수 없음'}`);
          return;
        }

        setCurrentVersion(data.newVersion);
        setVersionRefresh((prev) => prev + 1);
      } catch (err) {
        const msg = err instanceof Error ? err.message : '복원 실패';
        console.error('복원 실패:', err);
        setError(msg);
      }
    },
    [phase, format, onContentChange, parser]
  );

  // ──── 버전 선택 ────────────────────────────────────────
  const handleSelectVersion = useCallback(
    (version: string, content: string) => {
      try {
        setError(null);
        if (format === 'json') {
          const parsed = parser(content);
          onContentChange(parsed);
        } else {
          onContentChange(content as unknown as T);
        }
        setCurrentVersion(version);
      } catch (err) {
        setError(`파싱 실패: ${err instanceof Error ? err.message : '알 수 없음'}`);
      }
    },
    [format, onContentChange, parser]
  );

  return {
    isRefining,
    refineProgress,
    currentVersion,
    versionRefresh,
    error,
    handleRefine,
    handleRestore,
    handleSelectVersion,
  };
}
