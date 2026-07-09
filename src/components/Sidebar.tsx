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
  onSearch: (query: string) => void;
}

function Sidebar({ activeNav, onNavChange, onSearch }: SidebarProps) {
  const [searchInput, setSearchInput] = useState("");

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchInput(e.target.value);
    onSearch(e.target.value);
  };

  return (
    <div className="w-64 bg-white border-r border-slate-200 flex flex-col">
      <div className="p-4 border-b border-slate-200">
        <h1 className="text-xl font-bold text-slate-800">Mini Notes</h1>
        <p className="text-xs text-slate-500 mt-1">个人工作笔记</p>
      </div>

      <div className="p-3">
        <input
          type="text"
          placeholder="搜索笔记..."
          value={searchInput}
          onChange={handleSearchChange}
          className="w-full px-3 py-2 text-sm bg-slate-100 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>

      <nav className="flex-1 overflow-y-auto py-2">
        {navOptions.map((option) => (
          <button
            key={option.id}
            onClick={() => onNavChange(option.id)}
            className={`w-full flex items-center px-4 py-2.5 text-sm transition-colors ${
              activeNav === option.id
                ? "bg-blue-50 text-blue-600 font-medium"
                : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            <span className="mr-3 text-lg">{option.icon}</span>
            <span>{option.label}</span>
          </button>
        ))}
      </nav>

      <div className="p-3 border-t border-slate-200">
        <div className="text-xs text-slate-400">
          <div>数据目录</div>
          <div className="text-slate-500 truncate">~/MiniNotes</div>
        </div>
      </div>
    </div>
  );
}

export default Sidebar;