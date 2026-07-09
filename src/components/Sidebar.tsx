import { useState } from "react";
import type { NavItem, NavOption } from "@/types";

const navOptions: NavOption[] = [
  { id: "all", label: "全部笔记", icon: "📝" },
  { id: "inbox", label: "Inbox 待整理", icon: "📥" },
  { id: "favorite", label: "收藏", icon: "⭐" },
  { id: "tags", label: "标签", icon: "🏷️" },
  { id: "categories", label: "分类", icon: "📁" },
  { id: "projects", label: "项目", icon: "📋" },
  { id: "tasks", label: "任务", icon: "✅" },
  { id: "attachments", label: "附件", icon: "📎" },
  { id: "trash", label: "回收站", icon: "🗑️" },
];

interface SidebarProps {
  activeNav: NavItem;
  onNavChange: (nav: NavItem) => void;
  onNewNote?: () => void;
}

function Sidebar({ activeNav, onNavChange, onNewNote }: SidebarProps) {
  const [searchInput, setSearchInput] = useState("");

  return (
    <div className="w-56 bg-white border-r border-slate-200 flex flex-col">
      <div className="p-3 border-b border-slate-200">
        <h1 className="text-lg font-bold text-slate-800">Mini Notes</h1>
        <p className="text-xs text-slate-500 mt-0.5">个人工作笔记</p>
      </div>

      <div className="p-2">
        <button
          onClick={onNewNote}
          disabled={!onNewNote}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <span>+</span>
          <span>新建笔记</span>
        </button>
      </div>

      <div className="px-2 pb-2">
        <input
          type="text"
          placeholder="搜索..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          className="w-full px-3 py-1.5 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
        />
      </div>

      <nav className="flex-1 overflow-y-auto py-1">
        {navOptions.map((option) => (
          <button
            key={option.id}
            onClick={() => onNavChange(option.id)}
            className={`w-full flex items-center px-3 py-2 text-sm transition-colors rounded-lg mx-1 ${
              activeNav === option.id
                ? "bg-blue-50 text-blue-600 font-medium"
                : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            <span className="mr-2.5 text-base">{option.icon}</span>
            <span>{option.label}</span>
          </button>
        ))}
      </nav>

      <div className="p-2 border-t border-slate-200">
        <div className="text-xs text-slate-400">
          <div>数据目录</div>
          <div className="text-slate-500 truncate">~/MiniNotes</div>
        </div>
      </div>
    </div>
  );
}

export default Sidebar;