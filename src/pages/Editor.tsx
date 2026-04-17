import { useState, useRef, useCallback, useEffect } from "react";

interface TextItem {
  id: string;
  text: string;
  x: number;
  y: number;
  fontSize: number;
  color: string;
}

type DefaultItem = Omit<TextItem, "id">;

interface Tab {
  id: string;
  name: string;
  imageSrc: string | null;
  imageDimensions: { width: number; height: number };
  textItems: TextItem[];
  savedDefaults: DefaultItem[];
}

const FONT_FAMILY = "'Pretendard', sans-serif";
const FONT_WEIGHT = "bold";
const TABS_KEY = "image-editor-tabs-v2";
const ACTIVE_TAB_KEY = "image-editor-active-tab";

function createTab(name: string): Tab {
  return {
    id: crypto.randomUUID(),
    name,
    imageSrc: null,
    imageDimensions: { width: 0, height: 0 },
    textItems: [],
    savedDefaults: [],
  };
}

function loadPersistedTabs(): { tabs: Tab[]; activeTabId: string } | null {
  try {
    const raw = localStorage.getItem(TABS_KEY);
    const activeTabId = localStorage.getItem(ACTIVE_TAB_KEY);
    if (raw) {
      const tabs = (JSON.parse(raw) as Tab[]).map((t) => ({
        ...t,
        savedDefaults: t.savedDefaults ?? [],
      }));
      if (tabs.length > 0) {
        return { tabs, activeTabId: activeTabId || tabs[0].id };
      }
    }
  } catch {}
  return null;
}

function persistTabs(tabs: Tab[], activeTabId: string) {
  try {
    localStorage.setItem(TABS_KEY, JSON.stringify(tabs));
    localStorage.setItem(ACTIVE_TAB_KEY, activeTabId);
  } catch {}
}

export default function Editor() {
  const [tabState, setTabState] = useState<{ tabs: Tab[]; activeTabId: string }>(() => {
    const persisted = loadPersistedTabs();
    if (persisted) return persisted;
    const tab = createTab("탭 1");
    return { tabs: [tab], activeTabId: tab.id };
  });

  const { tabs, activeTabId } = tabState;
  const activeTab = tabs.find((t) => t.id === activeTabId) ?? tabs[0];
  const imageSrc = activeTab?.imageSrc ?? null;
  const imageDimensions = activeTab?.imageDimensions ?? { width: 0, height: 0 };
  const textItems = activeTab?.textItems ?? [];

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [tabNameDraft, setTabNameDraft] = useState("");
  const [newText, setNewText] = useState("");
  const [fontSize, setFontSize] = useState(36);
  const [color, setColor] = useState("#ffffff");
  const [dragging, setDragging] = useState<{ id: string; offsetX: number; offsetY: number } | null>(null);
  const [snapLines, setSnapLines] = useState<{ x?: number; y?: number }>({});
  const [downloading, setDownloading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const savedDefaults = activeTab?.savedDefaults ?? [];
  const [savedFeedback, setSavedFeedback] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [positionLocked, setPositionLocked] = useState(true);

  const canvasRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const editingRef = useRef<HTMLDivElement | null>(null);
  const tabInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    persistTabs(tabs, activeTabId);
  }, [tabs, activeTabId]);

  useEffect(() => {
    if (editingId && editingRef.current) {
      const el = editingRef.current;
      el.focus();
      const range = document.createRange();
      const sel = window.getSelection();
      range.selectNodeContents(el);
      range.collapse(false);
      sel?.removeAllRanges();
      sel?.addRange(range);
    }
  }, [editingId]);

  useEffect(() => {
    if (editingTabId && tabInputRef.current) {
      tabInputRef.current.focus();
      tabInputRef.current.select();
    }
  }, [editingTabId]);

  const updateActiveTab = (fn: (tab: Tab) => Tab) => {
    setTabState((s) => ({
      ...s,
      tabs: s.tabs.map((t) => (t.id === s.activeTabId ? fn(t) : t)),
    }));
  };

  const setTextItems = (fn: (prev: TextItem[]) => TextItem[]) => {
    updateActiveTab((t) => ({ ...t, textItems: fn(t.textItems) }));
  };

  const applyDefaults = (defaults: DefaultItem[]): TextItem[] =>
    defaults.map((d) => ({ ...d, id: crypto.randomUUID() }));

  const addTab = () => {
    const tab = createTab(`탭 ${tabs.length + 1}`);
    setTabState((s) => ({ tabs: [...s.tabs, tab], activeTabId: tab.id }));
    setSelectedId(null);
    setEditingId(null);
  };

  const duplicateTab = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const source = tabs.find((t) => t.id === id);
    if (!source) return;
    const newTab: Tab = {
      ...source,
      id: crypto.randomUUID(),
      name: `${source.name} 복사`,
      textItems: source.textItems.map((item) => ({ ...item, id: crypto.randomUUID() })),
    };
    setTabState((s) => {
      const idx = s.tabs.findIndex((t) => t.id === id);
      const newTabs = [...s.tabs.slice(0, idx + 1), newTab, ...s.tabs.slice(idx + 1)];
      return { tabs: newTabs, activeTabId: newTab.id };
    });
    setSelectedId(null);
    setEditingId(null);
  };

  const closeTab = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (tabs.length === 1) return;
    setTabState((s) => {
      const idx = s.tabs.findIndex((t) => t.id === id);
      const newTabs = s.tabs.filter((t) => t.id !== id);
      const newActiveId =
        s.activeTabId === id
          ? newTabs[Math.max(0, idx - 1)].id
          : s.activeTabId;
      return { tabs: newTabs, activeTabId: newActiveId };
    });
    setSelectedId(null);
    setEditingId(null);
  };

  const switchTab = (id: string) => {
    if (editingTabId) return;
    setTabState((s) => ({ ...s, activeTabId: id }));
    setSelectedId(null);
    setEditingId(null);
  };

  const startRenamingTab = (tab: Tab, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingTabId(tab.id);
    setTabNameDraft(tab.name);
  };

  const commitTabRename = () => {
    if (!editingTabId) return;
    const name = tabNameDraft.trim() || tabs.find((t) => t.id === editingTabId)?.name || "탭";
    setTabState((s) => ({
      ...s,
      tabs: s.tabs.map((t) => (t.id === editingTabId ? { ...t, name } : t)),
    }));
    setEditingTabId(null);
  };

  const cancelTabRename = () => setEditingTabId(null);

  const handleImageUpload = (file: File) => {
    if (!file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const src = e.target?.result as string;
      const img = new Image();
      img.onload = () => {
        const w = img.naturalWidth;
        const h = img.naturalHeight;
        updateActiveTab((t) => ({
          ...t,
          imageSrc: src,
          imageDimensions: { width: w, height: h },
          textItems: t.savedDefaults.length > 0 ? applyDefaults(t.savedDefaults) : t.textItems,
        }));
        setSelectedId(null);
        setEditingId(null);
      };
      img.src = src;
    };
    reader.readAsDataURL(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleImageUpload(file);
    e.target.value = "";
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleImageUpload(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => setIsDragOver(false);

  const addText = () => {
    if (!newText.trim() || !imageSrc) return;
    const id = crypto.randomUUID();
    setTextItems((prev) => [
      ...prev,
      { id, text: newText.trim(), x: imageDimensions.width - 50, y: 50, fontSize, color },
    ]);
    setNewText("");
    setSelectedId(id);
    setEditingId(id);
  };

  const updateItemById = (id: string, key: keyof TextItem, value: string | number) => {
    setTextItems((prev) => prev.map((t) => (t.id === id ? { ...t, [key]: value } : t)));
  };

  const updateSelected = (key: keyof TextItem, value: string | number) => {
    if (!selectedId) return;
    updateItemById(selectedId, key, value);
  };

  const deleteSelected = () => {
    if (!selectedId) return;
    setTextItems((prev) => prev.filter((t) => t.id !== selectedId));
    setSelectedId(null);
    setEditingId(null);
  };

  const handleSaveDefaults = () => {
    const defaults: DefaultItem[] = textItems.map(({ id: _id, ...rest }) => rest);
    updateActiveTab((t) => ({ ...t, savedDefaults: defaults }));
    setSavedFeedback(true);
    setTimeout(() => setSavedFeedback(false), 2000);
  };

  const handleClearDefaults = () => {
    updateActiveTab((t) => ({ ...t, savedDefaults: [] }));
  };


  const maxDisplayWidth = 700;
  const maxDisplayHeight = 500;
  let displayWidth = imageDimensions.width;
  let displayHeight = imageDimensions.height;
  if (displayWidth > maxDisplayWidth) {
    displayHeight = (displayHeight * maxDisplayWidth) / displayWidth;
    displayWidth = maxDisplayWidth;
  }
  if (displayHeight > maxDisplayHeight) {
    displayWidth = (displayWidth * maxDisplayHeight) / displayHeight;
    displayHeight = maxDisplayHeight;
  }

  const handleMouseDown = (e: React.MouseEvent, id: string) => {
    if (editingId === id) return;
    e.stopPropagation();
    setSelectedId(id);
    if (positionLocked) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const item = textItems.find((t) => t.id === id);
    if (!item) return;
    const scaleX = displayWidth / imageDimensions.width;
    const scaleY = displayHeight / imageDimensions.height;
    setDragging({
      id,
      offsetX: e.clientX - rect.left - item.x * scaleX,
      offsetY: e.clientY - rect.top - item.y * scaleY,
    });
  };

  const SNAP_THRESHOLD_PX = 8;

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!dragging || !canvasRef.current) return;
      const rect = canvasRef.current.getBoundingClientRect();
      const scaleX = displayWidth / imageDimensions.width;
      const scaleY = displayHeight / imageDimensions.height;
      let x = Math.max(0, (e.clientX - rect.left - dragging.offsetX) / scaleX);
      let y = Math.max(0, (e.clientY - rect.top - dragging.offsetY) / scaleY);

      const others = textItems.filter((t) => t.id !== dragging.id);
      const threshX = SNAP_THRESHOLD_PX / scaleX;
      const threshY = SNAP_THRESHOLD_PX / scaleY;
      const newSnap: { x?: number; y?: number } = {};

      for (const o of others) {
        if (Math.abs(x - o.x) < threshX) { x = o.x; newSnap.x = o.x; break; }
      }
      for (const o of others) {
        if (Math.abs(y - o.y) < threshY) { y = o.y; newSnap.y = o.y; break; }
      }

      setSnapLines(newSnap);
      setTextItems((prev) =>
        prev.map((t) => (t.id === dragging.id ? { ...t, x, y } : t))
      );
    },
    [dragging, imageDimensions, textItems, displayWidth, displayHeight]
  );

  const handleMouseUp = () => { setDragging(null); setSnapLines({}); };

  const handleDownload = async () => {
    if (!imageSrc) return;
    setDownloading(true);
    try {
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = reject;
        img.src = imageSrc;
      });
      const canvas = document.createElement("canvas");
      canvas.width = imageDimensions.width;
      canvas.height = imageDimensions.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(img, 0, 0, imageDimensions.width, imageDimensions.height);
      for (const item of textItems) {
        ctx.save();
        ctx.font = `bold ${item.fontSize}px Pretendard, sans-serif`;
        ctx.fillStyle = item.color;
        ctx.textBaseline = "top";
        ctx.textAlign = "right";
        ctx.fillText(item.text, item.x, item.y);
        ctx.restore();
      }
      const link = document.createElement("a");
      link.download = `${activeTab?.name ?? "image"}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    } finally {
      setDownloading(false);
    }
  };

  const selectedItem = textItems.find((t) => t.id === selectedId);

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 flex flex-col">
      <header className="bg-gray-900 border-b border-gray-800 px-6 py-4">
        <h1 className="text-xl font-bold tracking-tight text-white">이미지 텍스트 편집기</h1>
        <p className="text-gray-400 text-sm mt-0.5">이미지를 업로드하고 텍스트를 추가한 후 다운로드하세요</p>
      </header>
      <div className="bg-gray-900 border-b border-gray-800 flex items-end gap-0 px-4 overflow-x-auto">
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId;
          return (
            <div
              key={tab.id}
              onClick={() => switchTab(tab.id)}
              className={`group flex items-center gap-1.5 min-w-0 px-3 py-2.5 cursor-pointer border-b-2 transition-all select-none ${
                isActive
                  ? "border-indigo-500 text-white bg-gray-950/40"
                  : "border-transparent text-gray-400 hover:text-gray-200 hover:bg-gray-800/40"
              }`}
            >
              {editingTabId === tab.id ? (
                <input
                  ref={tabInputRef}
                  value={tabNameDraft}
                  onChange={(e) => setTabNameDraft(e.target.value)}
                  onBlur={commitTabRename}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitTabRename();
                    if (e.key === "Escape") cancelTabRename();
                    e.stopPropagation();
                  }}
                  onClick={(e) => e.stopPropagation()}
                  className="bg-gray-800 border border-indigo-500 rounded px-1.5 py-0.5 text-sm text-white outline-none w-24"
                />
              ) : (
                <span
                  className="text-sm font-medium truncate max-w-[120px]"
                  onDoubleClick={(e) => startRenamingTab(tab, e)}
                  title="더블클릭으로 이름 수정"
                >
                  {tab.name}
                </span>
              )}
              <button
                onClick={(e) => duplicateTab(tab.id, e)}
                className="opacity-0 group-hover:opacity-100 flex-shrink-0 w-4 h-4 flex items-center justify-center rounded text-gray-500 hover:text-indigo-400 hover:bg-indigo-900/30 transition-all"
                title="탭 복제"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3 h-3">
                  <rect x="9" y="9" width="13" height="13" rx="2" />
                  <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" strokeLinecap="round" />
                </svg>
              </button>
              {tabs.length > 1 && (
                <button
                  onClick={(e) => closeTab(tab.id, e)}
                  className="opacity-0 group-hover:opacity-100 flex-shrink-0 w-4 h-4 flex items-center justify-center rounded text-gray-500 hover:text-red-400 hover:bg-red-900/30 transition-all"
                  title="탭 닫기"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-3 h-3">
                    <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" />
                  </svg>
                </button>
              )}
            </div>
          );
        })}
        <button
          onClick={addTab}
          className="flex-shrink-0 flex items-center gap-1 px-3 py-2.5 text-gray-500 hover:text-gray-200 hover:bg-gray-800/40 text-sm transition-all border-b-2 border-transparent"
          title="새 탭 추가"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-4 h-4">
            <path d="M12 5v14M5 12h14" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      <div className="flex flex-1 overflow-hidden flex-col lg:flex-row">
        <aside className="w-full lg:w-72 bg-gray-900 border-b lg:border-b-0 lg:border-r border-gray-800 p-5 flex flex-col gap-5 overflow-y-auto">
          <div>
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">이미지 업로드</h2>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full border-2 border-dashed border-gray-700 rounded-xl py-4 px-3 text-sm text-gray-400 hover:border-indigo-500 hover:text-indigo-400 transition-colors text-center cursor-pointer"
            >
              클릭하여 업로드
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              className="hidden"
            />
            {savedDefaults.length > 0 && (
              <div className="mt-2 flex items-center gap-1.5 text-xs text-indigo-400">
                <svg className="w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2a10 10 0 110 20A10 10 0 0112 2zm0 2a8 8 0 100 16A8 8 0 0012 4zm-1 5h2v4h-2V9zm0 6h2v2h-2v-2z" />
                </svg>
                새 이미지 업로드 시 저장된 텍스트 {savedDefaults.length}개 자동 적용
              </div>
            )}
          </div>

          <hr className="border-gray-800" />

          {imageSrc && (
            <>
              <div>
                <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">텍스트 추가</h2>
                <div className="flex gap-2 mb-3">
                  <input
                    type="text"
                    placeholder="텍스트를 입력하세요"
                    value={newText}
                    onChange={(e) => setNewText(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addText()}
                    className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 outline-none focus:border-indigo-500 transition-colors"
                  />
                  <button
                    onClick={addText}
                    disabled={!newText.trim()}
                    className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-700 disabled:text-gray-500 text-white px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-4 h-4">
                      <path d="M12 5v14M5 12h14" strokeLinecap="round" />
                    </svg>
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">크기</label>
                    <input
                      type="number"
                      min={8}
                      max={200}
                      value={fontSize}
                      onChange={(e) => setFontSize(Number(e.target.value))}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-sm text-white outline-none focus:border-indigo-500 transition-colors"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">색상</label>
                    <input
                      type="color"
                      value={color}
                      onChange={(e) => setColor(e.target.value)}
                      className="w-full h-9 bg-gray-800 border border-gray-700 rounded-lg cursor-pointer"
                    />
                  </div>
                </div>
              </div>

              <hr className="border-gray-800" />

              <div>
                <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">텍스트 위치 고정</h2>
                <button
                  onClick={() => setPositionLocked((v) => !v)}
                  className={`w-full py-2.5 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 ${
                    positionLocked
                      ? "bg-amber-600/30 text-amber-300 border border-amber-600/50 hover:bg-amber-600/40"
                      : "bg-emerald-600/25 text-emerald-300 border border-emerald-500/60 hover:bg-emerald-600/35"
                  }`}
                >
                  {positionLocked ? (
                    <>
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                        <path d="M7 11V7a5 5 0 0110 0v4" strokeLinecap="round" />
                      </svg>
                      위치 고정 ON
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                        <path d="M7 11V7a5 5 0 019.9-1" strokeLinecap="round" />
                      </svg>
                      위치 고정 OFF
                    </>
                  )}
                </button>
              </div>

              {selectedItem && (
                <div>
                  <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">선택된 텍스트 편집</h2>
                  <div className="bg-gray-800 rounded-xl p-3 flex flex-col gap-2">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs text-gray-500 mb-1 block">크기</label>
                        <input
                          type="number"
                          min={8}
                          max={200}
                          value={selectedItem.fontSize}
                          onChange={(e) => updateSelected("fontSize", Number(e.target.value))}
                          className="w-full bg-gray-700 border border-gray-600 rounded-lg px-2 py-1.5 text-sm text-white outline-none focus:border-indigo-500 transition-colors"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 mb-1 block">색상</label>
                        <input
                          type="color"
                          value={selectedItem.color}
                          onChange={(e) => updateSelected("color", e.target.value)}
                          className="w-full h-9 bg-gray-700 border border-gray-600 rounded-lg cursor-pointer"
                        />
                      </div>
                    </div>
                    <button
                      onClick={deleteSelected}
                      className="w-full py-1.5 rounded-lg text-sm text-red-400 hover:bg-red-900/30 transition-colors"
                    >
                      삭제
                    </button>
                  </div>
                </div>
              )}

              {textItems.length > 0 && (
                <div>
                  <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">텍스트 위치 세팅</h2>
                  <div className="flex flex-col gap-2">
                    <button
                      onClick={handleSaveDefaults}
                      className={`w-full py-2 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 ${
                        savedFeedback
                          ? "bg-green-700 text-green-100"
                          : "bg-gray-800 hover:bg-gray-700 text-gray-300"
                      }`}
                    >
                      {savedFeedback ? (
                        <>
                          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                          저장 완료!
                        </>
                      ) : (
                        <>
                          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z" strokeLinecap="round" strokeLinejoin="round" />
                            <path d="M17 21v-8H7v8M7 3v5h8" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                          현재 위치 저장
                        </>
                      )}
                    </button>
                    {savedDefaults.length > 0 && (
                      <button
                        onClick={() => setConfirmClear(true)}
                        className="w-full py-2 rounded-lg text-xs text-gray-500 hover:text-red-400 hover:bg-red-900/20 transition-colors"
                      >
                        기본값 초기화
                      </button>
                    )}
                  </div>
                </div>
              )}

              <div className="mt-auto pt-2">
                <button
                  onClick={handleDownload}
                  disabled={downloading}
                  className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-700 disabled:text-gray-500 text-white py-3 rounded-xl text-sm font-semibold transition-colors flex items-center justify-center gap-2"
                >
                  {downloading ? (
                    <>
                      <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      저장 중...
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      이미지 다운로드
                    </>
                  )}
                </button>
              </div>
            </>
          )}
        </aside>

        <main
          className="flex-1 flex items-center justify-center p-6 overflow-auto bg-gray-950"
          onClick={() => { setSelectedId(null); setEditingId(null); }}
        >
          {!imageSrc ? (
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
              className={`flex flex-col items-center justify-center w-full max-w-lg h-80 border-2 border-dashed rounded-2xl cursor-pointer transition-all ${isDragOver ? "border-indigo-400 bg-indigo-950/30" : "border-gray-700 hover:border-gray-600"}`}
            >
              <svg className="w-12 h-12 text-gray-600 mb-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <p className="text-gray-400 font-medium">이미지를 드래그하거나 클릭하여 업로드</p>
              <p className="text-gray-600 text-sm mt-1">PNG, JPG, GIF, WebP 지원</p>
              {savedDefaults.length > 0 && (
                <p className="text-indigo-500 text-xs mt-2">저장된 텍스트 {savedDefaults.length}개 자동 적용됨</p>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-4" onClick={(e) => e.stopPropagation()}>
              {!positionLocked && (
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-900/40 border border-emerald-600/40 text-emerald-300 text-xs font-medium">
                  <svg className="w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 019.9-1" strokeLinecap="round" />
                  </svg>
                  위치 이동 모드 — 텍스트를 드래그하여 이동하세요
                </div>
              )}
              <div
                ref={canvasRef}
                style={{ width: displayWidth, height: displayHeight, position: "relative", cursor: dragging ? "grabbing" : "default", overflow: "hidden", outline: positionLocked ? "none" : "2px solid rgba(52,211,153,0.4)" }}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                onClick={() => { setSelectedId(null); setEditingId(null); }}
              >
                <img
                  src={imageSrc}
                  alt="uploaded"
                  style={{ width: displayWidth, height: displayHeight, display: "block", userSelect: "none", pointerEvents: "none" }}
                  draggable={false}
                />
                {snapLines.x !== undefined && (() => {
                  const sx = displayWidth / imageDimensions.width;
                  return (
                    <div style={{ position: "absolute", left: snapLines.x * sx, top: 0, width: 1, height: "100%", background: "rgba(99,102,241,0.85)", pointerEvents: "none", zIndex: 50 }} />
                  );
                })()}
                {snapLines.y !== undefined && (() => {
                  const sy = displayHeight / imageDimensions.height;
                  return (
                    <div style={{ position: "absolute", left: 0, top: snapLines.y * sy, width: "100%", height: 1, background: "rgba(99,102,241,0.85)", pointerEvents: "none", zIndex: 50 }} />
                  );
                })()}
                {textItems.map((item) => {
                  const scaleX = displayWidth / imageDimensions.width;
                  const scaleY = displayHeight / imageDimensions.height;
                  const isEditing = editingId === item.id;
                  const isSelected = selectedId === item.id;

                  return (
                    <div
                      key={item.id}
                      ref={isEditing ? editingRef : null}
                      contentEditable={isEditing}
                      suppressContentEditableWarning
                      onMouseDown={(e) => handleMouseDown(e, item.id)}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedId(item.id);
                        setEditingId(item.id);
                      }}
                      onBlur={(e) => {
                        const text = e.currentTarget.textContent ?? "";
                        if (text.trim()) {
                          updateItemById(item.id, "text", text.trim());
                        } else {
                          e.currentTarget.textContent = item.text;
                        }
                        setEditingId(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          e.currentTarget.blur();
                        }
                        if (e.key === "Escape") {
                          e.currentTarget.textContent = item.text;
                          e.currentTarget.blur();
                        }
                        e.stopPropagation();
                      }}
                      style={{
                        position: "absolute",
                        left: item.x * scaleX + 12,
                        top: item.y * scaleY,
                        transform: "translateX(-100%)",
                        fontSize: item.fontSize * Math.min(scaleX, scaleY),
                        color: item.color,
                        fontFamily: FONT_FAMILY,
                        fontWeight: FONT_WEIGHT,
                        cursor: isEditing ? "text" : positionLocked ? "default" : "grab",
                        userSelect: isEditing ? "text" : "none",
                        whiteSpace: "pre",
                        lineHeight: 1,
                        minWidth: 4,
                        paddingLeft: 12,
                        paddingRight: 12,
                        outline: isEditing
                          ? "2px solid rgba(99,102,241,0.9)"
                          : isSelected
                          ? "2px dashed rgba(99,102,241,0.8)"
                          : "none",
                        outlineOffset: 4,
                      }}
                    >
                      {item.text}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </main>
      </div>

      {confirmClear && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setConfirmClear(false)}>
          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-80 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-white font-semibold text-base mb-2">기본값 초기화</h3>
            <p className="text-gray-400 text-sm mb-6">저장된 텍스트 위치 기본값을 삭제할까요?<br />이 작업은 되돌릴 수 없습니다.</p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmClear(false)}
                className="flex-1 py-2 rounded-lg text-sm text-gray-400 bg-gray-800 hover:bg-gray-700 transition-colors"
              >
                취소
              </button>
              <button
                onClick={() => { handleClearDefaults(); setConfirmClear(false); }}
                className="flex-1 py-2 rounded-lg text-sm font-medium text-white bg-red-600 hover:bg-red-500 transition-colors"
              >
                초기화
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
