import { useMemo } from "react";
import type { Task } from "@/types";

interface TrashWorkspaceProps {
  tasks: Task[];
  selectedTaskId: string | null;
  onSelectTask: (id: string) => void;
  onRestoreTask: (id: string) => Promise<void>;
  onPermanentlyDeleteTask: (id: string) => Promise<void>;
}

interface TaskTreeNode {
  task: Task;
  children: TaskTreeNode[];
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

function buildTaskTree(tasks: Task[]) {
  const sortedTasks = [...tasks].sort((a, b) => {
    if ((a.parent_id ?? "") !== (b.parent_id ?? "")) {
      return (a.parent_id ?? "").localeCompare(b.parent_id ?? "");
    }
    if ((a.sort_order ?? 0) !== (b.sort_order ?? 0)) {
      return (a.sort_order ?? 0) - (b.sort_order ?? 0);
    }
    return (b.deleted_at ?? "").localeCompare(a.deleted_at ?? "");
  });

  const nodeMap = new Map<string, TaskTreeNode>();
  const roots: TaskTreeNode[] = [];

  for (const task of sortedTasks) {
    nodeMap.set(task.id, { task, children: [] });
  }

  for (const task of sortedTasks) {
    const node = nodeMap.get(task.id)!;
    const parentId = task.parent_id ?? null;
    if (parentId && nodeMap.has(parentId)) {
      nodeMap.get(parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  const sortNodes = (nodes: TaskTreeNode[]) => {
    nodes.sort((a, b) => {
      if ((a.task.sort_order ?? 0) !== (b.task.sort_order ?? 0)) {
        return (a.task.sort_order ?? 0) - (b.task.sort_order ?? 0);
      }
      return (b.task.deleted_at ?? "").localeCompare(a.task.deleted_at ?? "");
    });
    nodes.forEach((node) => sortNodes(node.children));
  };

  sortNodes(roots);
  return roots;
}

function buildTaskPath(taskId: string | null, taskMap: Map<string, Task>) {
  if (!taskId || !taskMap.has(taskId)) {
    return "回收站";
  }

  const parts: string[] = [];
  let current = taskMap.get(taskId) ?? null;
  while (current) {
    parts.unshift(current.title);
    current = current.parent_id ? taskMap.get(current.parent_id) ?? null : null;
  }

  return parts.join(" / ");
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
  const taskMap = useMemo(() => new Map(tasks.map((task) => [task.id, task])), [tasks]);
  const taskTree = useMemo(() => buildTaskTree(tasks), [tasks]);
  const selectedTaskPath = useMemo(() => buildTaskPath(selectedTaskId, taskMap), [selectedTaskId, taskMap]);

  const renderTaskNode = (node: TaskTreeNode, depth = 0) => {
    const { task, children } = node;
    const isSelected = task.id === selectedTaskId;

    return (
      <div key={task.id}>
        <button
          type="button"
          onClick={() => onSelectTask(task.id)}
          className={`w-full border-b border-slate-100 px-4 py-3 text-left transition-colors ${
            isSelected ? "bg-blue-50" : "hover:bg-slate-50"
          }`}
          style={{ paddingLeft: `${depth * 18 + 16}px` }}
        >
          <div className="truncate text-sm font-medium text-slate-800">
            {depth > 0 ? "↳ " : ""}{task.title}
          </div>
          <div className="mt-1 truncate text-xs text-slate-400">{task.content || "暂无详情"}</div>
          <div className="mt-2 flex items-center gap-2 text-[11px] text-slate-400">
            <span>删除于 {formatDateTime(task.deleted_at)}</span>
          </div>
        </button>
        {children.map((child) => renderTaskNode(child, depth + 1))}
      </div>
    );
  };

  return (
    <>
      <div className="w-[260px] bg-white border-r border-slate-200 flex flex-col">
        <div className="flex items-center justify-between p-3 border-b border-slate-200">
          <div>
            <div className="text-sm font-medium text-slate-700">回收站</div>
            <div className="text-xs text-slate-400 mt-1">树状显示已删除待办，不显示笔记</div>
          </div>
          <span className="text-xs text-slate-400">{tasks.length} 项</span>
        </div>

        <div className="border-b border-slate-100 bg-slate-50 px-4 py-2 text-[11px] text-slate-400">
          当前路径：{selectedTaskPath}
        </div>

        <div className="flex-1 overflow-y-auto">
          {taskTree.length === 0 ? (
            <div className="px-4 py-6 text-sm text-slate-400">
              当前没有已删除待办。
              <div className="mt-2 text-xs text-slate-300">笔记删除仍然只进入系统回收站，不在这里显示。</div>
            </div>
          ) : (
            taskTree.map((node) => renderTaskNode(node))
          )}
        </div>
      </div>

      <div className="flex-1 min-w-[500px] flex flex-col bg-white">
        {!selectedTask ? (
          <div className="flex-1 flex items-center justify-center bg-slate-50">
            <div className="text-center text-slate-400">
              <span className="text-6xl mb-4 block">🗑️</span>
              <p className="text-lg">回收站</p>
              <p className="text-sm mt-2">这里按树状保留待办回收数据，笔记不会进入这里。</p>
            </div>
          </div>
        ) : (
          <>
            <div className="px-4 py-3 border-b border-slate-200 bg-white">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-slate-800">{selectedTask.title}</h2>
                  <div className="mt-2 flex gap-3 text-xs text-slate-400">
                    <span>层级：{selectedTask.depth ?? 0}</span>
                    <span>删除时间：{formatDateTime(selectedTask.deleted_at)}</span>
                  </div>
                  <div className="mt-2 text-xs text-slate-400">路径：{buildTaskPath(selectedTask.id, taskMap)}</div>
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
