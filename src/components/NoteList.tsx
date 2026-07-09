import { createNote } from "@/api";
import type { Note } from "@/types";

interface NoteListProps {
  notes: Note[];
  selectedNote: Note | null;
  onSelect: (note: Note) => void;
  isLoading: boolean;
  searchQuery: string;
}

function NoteList({ notes, selectedNote, onSelect, isLoading, searchQuery }: NoteListProps) {
  const handleCreateNote = async () => {
    const now = new Date();
    const title = `新建笔记 ${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    
    try {
      const response = await createNote({
        title,
        content: "",
        folder: "Inbox",
      });
      
      if (response.success && response.data) {
        onSelect(response.data);
      }
    } catch (error) {
      console.error("Failed to create note:", error);
    }
  };

  const filteredNotes = notes.filter((note) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      note.title.toLowerCase().includes(query) ||
      note.summary.toLowerCase().includes(query)
    );
  });

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) return "今天";
    if (days === 1) return "昨天";
    if (days < 7) return `${days}天前`;
    return date.toLocaleDateString("zh-CN");
  };

  return (
    <div className="w-80 bg-white border-r border-slate-200 flex flex-col">
      <div className="flex items-center justify-between p-3 border-b border-slate-200">
        <span className="text-sm font-medium text-slate-700">笔记列表</span>
        <button
          onClick={handleCreateNote}
          className="px-3 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
        >
          + 新建
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-full text-slate-400">
            加载中...
          </div>
        ) : filteredNotes.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-400">
            <span className="text-4xl mb-2">📭</span>
            <p className="text-sm">暂无笔记</p>
          </div>
        ) : (
          <div className="py-2">
            {filteredNotes.map((note) => (
              <button
                key={note.id}
                onClick={() => onSelect(note)}
                className={`w-full text-left px-3 py-2.5 border-b border-slate-50 transition-colors ${
                  selectedNote?.id === note.id
                    ? "bg-blue-50 border-l-2 border-l-blue-500"
                    : "hover:bg-slate-50"
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1">
                      {note.is_pinned && <span className="text-xs">📌</span>}
                      {note.is_favorite && <span className="text-xs">⭐</span>}
                      <h3 className="text-sm font-medium text-slate-800 truncate">
                        {note.title}
                      </h3>
                    </div>
                    <p className="text-xs text-slate-500 truncate mt-0.5">
                      {note.summary || "无摘要"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-xs text-slate-400">{note.folder}</span>
                  <span className="text-xs text-slate-400">
                    {formatDate(note.updated_at)}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default NoteList;