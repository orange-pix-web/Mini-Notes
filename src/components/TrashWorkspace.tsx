import { useMemo } from "react";
import type { Task } from "@/types";

interface TrashWorkspaceProps {
  tasks: Task[];
  selectedTaskId: string | null;
  onSelectTask: (id: string) => void;
  onRestoreTask: (id: string) => Promise<void>;
  onPermanentlyDeleteTask: (id: string) => Promise<void>;
}

function formatDateTime(value?: string | null) {
  if (!value) {
    return "未设置";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function TrashWorkspace({
  tasks,
  selectedTaskId,
  onSelectTask,
  onRestoreTask,
  onPermanentlyDeleteTask,
}: TrashWorkspaceProps) {
  const selectedTask = useMemo(
    () => tasks.find((task) => task.id === selectedTaskId) ?? null,
    [tasks, selectedTaskId],
  );

  return (
    <>
      <div className="w-[280px] bg-white border-r border-slate-200 flex flex-col">
        <div className="flex items-center justify-between p-3 border-b border-slate-200">
          <div>
            <div className="text-sm font-medium text-slate-700">回收站</div>
            <div className="text-xs text-slate-400 mt-1">这里只显示已删除待办，不显示笔记</div>
          </div>
          <span className="text-xs text-slate-400">{tasks.length} 项</span>
        </div>

        <div className="flex-1 overflow-y-auto">
          {tasks.length === 0 ? (
            <div className="px-4 py-6 text-sm text-slate-400">
              当前没有已删除待办。
              <div className="mt-2 text-xs text-slate-300">笔记删除仍然只进入系统回收站，不在这里显示。</div>
            </div>
          ) : (
            tasks.map((task) => (
              <button
                key={task.id}
                type="button"
                onClick={() => onSelectTask(task.id)}
                className={`w-full border-b border-slate-100 px-4 py-3 text-left transition-colors ${
                  task.id === selectedTaskId ? "bg-blue-50" : "hover:bg-slate-50"
                }`}
              >
                <div className="truncate text-sm font-medium text-slate-800">{task.title}</div>
                <div className="mt-1 truncate text-xs text-slate-400">{task.content || "暂无详情"}</div>
                <div className="mt-2 text-[11px] text-slate-400">删除于 {formatDateTime(task.deleted_at)}</div>
              </button>
            ))
          )}
        </div>
      </div>

      <div className="flex-1 min-w-[500px] flex flex-col bg-white">
        {!selectedTask ? (
          <div className="flex-1 flex items-center justify-center bg-slate-50">
            <div className="text-center text-slate-400">
              <span className="text-6xl mb-4 block">🗑️</span>
              <p className="text-lg">回收站</p>
              <p className="text-sm mt-2">这里只保留待办回收数据，笔记不会进入这里。</p>
            </div>
          </div>
        ) : (
          <>
            <div className="px-4 py-3 border-b border-slate-200 bg-white">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-slate-800">{selectedTask.title}</h2>
                  <div className="mt-2 flex gap-3 text-xs text-slate-400">
                    <span>优先级：{selectedTask.priority}</span>
                    <span>删除时间：{formatDateTime(selectedTask.deleted_at)}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void onRestoreTask(selectedTask.id)}
                    className="rounded-lg bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-600 hover:bg-blue-100 transition-colors"
                  >
                    还原
                  </button>
                  <button
                    type="button"
                    onClick={() => void onPermanentlyDeleteTask(selectedTask.id)}
                    className="rounded-lg bg-red-50 px-3 py-1.5 text-sm font-medium text-red-500 hover:bg-red-100 transition-colors"
                  >
                    彻底删除
                  </button>
                </div>
              </div>
            </div>
            <div className="flex-1 p-4 bg-white">
              <div className="h-full rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-600 whitespace-pre-wrap">
                {selectedTask.content || "暂无详情"}
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}

export default TrashWorkspace;
