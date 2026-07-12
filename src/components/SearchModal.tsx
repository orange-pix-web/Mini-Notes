import { useEffect, useRef } from "react";
import type { SearchResultItem } from "@/types";

interface SearchModalProps {
  isOpen: boolean;
  query: string;
  results: SearchResultItem[];
  selectedIndex: number;
  isLoading: boolean;
  onQueryChange: (value: string) => void;
  onClose: () => void;
  onSelectIndex: (index: number) => void;
  onConfirmSelection: () => void;
}

function SearchModal({
  isOpen,
  query,
  results,
  selectedIndex,
  isLoading,
  onQueryChange,
  onClose,
  onSelectIndex,
  onConfirmSelection,
}: SearchModalProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const renderHighlightedText = (text: string, keyword: string, secondary = false) => {
    if (!keyword.trim()) {
      return <>{text}</>;
    }

    const escapedKeyword = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const matcher = new RegExp(`(${escapedKeyword})`, "ig");
    const parts = text.split(matcher);

    return (
      <>
        {parts.map((part, index) => {
          const isMatch = part.toLowerCase() === keyword.toLowerCase();
          if (!isMatch) {
            return <span key={`${part}-${index}`}>{part}</span>;
          }

          return (
            <mark
              key={`${part}-${index}`}
              className={secondary ? "rounded bg-amber-100 px-0.5 text-slate-700" : "rounded bg-yellow-100 px-0.5 text-slate-900"}
            >
              {part}
            </mark>
          );
        })}
      </>
    );
  };

  useEffect(() => {
    if (isOpen) {
      window.setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      onClose();
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [isOpen, onClose]);

  if (!isOpen) {
    return null;
  }

  const folderResults = results.filter((item) => item.type === "folder");
  const noteResults = results.filter((item) => item.type === "note");

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/30 backdrop-blur-[1px] flex items-start justify-center pt-16">
      <div className="w-[680px] max-w-[calc(100vw-32px)] rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden">
        <div className="border-b border-slate-200 p-3">
          <div className="flex items-center gap-3">
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  onClose();
                } else if (event.key === "ArrowDown") {
                  event.preventDefault();
                  if (results.length > 0) {
                    onSelectIndex(Math.min(selectedIndex + 1, results.length - 1));
                  }
                } else if (event.key === "ArrowUp") {
                  event.preventDefault();
                  if (results.length > 0) {
                    onSelectIndex(Math.max(selectedIndex - 1, 0));
                  }
                } else if (event.key === "Enter") {
                  event.preventDefault();
                  onConfirmSelection();
                }
              }}
              placeholder="搜索文件夹和文档..."
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
            />
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-500 hover:bg-slate-50 hover:text-slate-700 transition-colors"
              title="关闭搜索"
              aria-label="关闭搜索"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between px-4 py-2 text-xs text-slate-400 border-b border-slate-100 bg-slate-50">
          <span>回车打开，方向键切换，Esc 关闭</span>
          <span>{results.length} 个结果</span>
        </div>

        <div className="max-h-[420px] overflow-y-auto">
          {isLoading ? (
            <div className="px-4 py-6 text-sm text-slate-400">搜索中...</div>
          ) : results.length === 0 ? (
            <div className="px-4 py-6 text-sm text-slate-400">没有匹配的文件夹或文档</div>
          ) : (
            <div className="py-1">
              {[
                { title: "文件夹", items: folderResults },
                { title: "文档", items: noteResults },
              ].map((group) => (
                group.items.length > 0 ? (
                  <div key={group.title}>
                    <div className="sticky top-0 z-[1] bg-white/95 px-4 py-2 text-[11px] font-medium uppercase tracking-wider text-slate-400 border-y border-slate-100">
                      {group.title}
                    </div>
                    {group.items.map((item) => {
                      const index = results.findIndex((result) => result.id === item.id);
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onMouseEnter={() => onSelectIndex(index)}
                          onClick={() => {
                            onSelectIndex(index);
                            onConfirmSelection();
                          }}
                          className={`w-full px-4 py-3 text-left transition-colors ${
                            index === selectedIndex
                              ? "bg-blue-50"
                              : "hover:bg-slate-50"
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <span className="mt-0.5 text-lg">{item.type === "folder" ? "📁" : "📄"}</span>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="truncate text-sm font-medium text-slate-800">
                                  {renderHighlightedText(item.title, query)}
                                </span>
                                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">
                                  {item.type === "folder" ? "文件夹" : "文档"}
                                </span>
                              </div>
                              <div className="mt-1 truncate text-xs text-slate-400">
                                {renderHighlightedText(item.subtitle, query, true)}
                              </div>
                              {item.snippet ? (
                                <div className="mt-1 line-clamp-2 text-xs text-slate-500">
                                  {renderHighlightedText(item.snippet, query, true)}
                                </div>
                              ) : null}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ) : null
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default SearchModal;
