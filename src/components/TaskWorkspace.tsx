import { useCallback, useEffect, useMemo, useState } from "react";
import type { Task, UpdateTaskRequest } from "@/types";

interface TaskWorkspaceProps {
  tasks: Task[];
  selectedTaskId: string | null;
  onSelectTask: (id: string) => void;
  onCreateTask: () => void;
  onCreateChildTask: (parentId: string) => void;
  onSaveTask: (request: UpdateTaskRequest) => Promise<Task | null>;
  onDeleteTask: (id: string) => Promise<void>;
  onToggleTaskCompleted: (task: Task, completed: boolean) => Promise<void>;
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

function toLocalInputValue(value?: string | null) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const offset = date.getTimezoneOffset();
  const localDate = new Date(date.getTime() - offset * 60_000);
  return localDate.toISOString().slice(0, 16);
}

function fromLocalInputValue(value: string) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString();
}

function getReminderState(task: Task) {
  const reminderSource = task.remind_at || task.due_at;
  if (!reminderSource || task.completed) {
    return null;
  }

  const target = new Date(reminderSource).getTime();
  if (Number.isNaN(target)) {
    return null;
  }

  const diff = target - Date.now();
  if (diff <= 0) {
    return { label: "已到提醒时间", tone: "text-red-500 bg-red-50" };
  }

  if (diff <= 24 * 60 * 60 * 1000) {
    return { label: "24小时内提醒", tone: "text-amber-600 bg-amber-50" };
  }

  return null;
}

function buildTaskTree(tasks: Task[]) {
  const sortedTasks = [...tasks].sort((a, b) => {
    if ((a.parent_id ?? "") !== (b.parent_id ?? "")) {
      return (a.parent_id ?? "").localeCompare(b.parent_id ?? "");
    }
    if (a.completed !== b.completed) {
      return Number(a.completed) - Number(b.completed);
    }
    if ((a.sort_order ?? 0) !== (b.sort_order ?? 0)) {
      return (a.sort_order ?? 0) - (b.sort_order ?? 0);
    }
    return b.updated_at.localeCompare(a.updated_at);
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
      if (a.task.completed !== b.task.completed) {
        return Number(a.task.completed) - Number(b.task.completed);
      }
      if ((a.task.sort_order ?? 0) !== (b.task.sort_order ?? 0)) {
        return (a.task.sort_order ?? 0) - (b.task.sort_order ?? 0);
      }
      return b.task.updated_at.localeCompare(a.task.updated_at);
    });

    nodes.forEach((node) => sortNodes(node.children));
  };

  sortNodes(roots);

  return roots;
}

function buildTaskPath(taskId: string | null, taskMap: Map<string, Task>) {
  if (!taskId || !taskMap.has(taskId)) {
    return "根待办";
  }

  const parts: string[] = [];
  let current = taskMap.get(taskId) ?? null;
  while (current) {
    parts.unshift(current.title);
    current = current.parent_id ? taskMap.get(current.parent_id) ?? null : null;
  }

  return parts.join(" / ");
}

function TaskWorkspace({
  tasks,
  selectedTaskId,
  onSelectTask,
  onCreateTask,
  onCreateChildTask,
  onSaveTask,
  onDeleteTask,
  onToggleTaskCompleted,
}: TaskWorkspaceProps) {
  const selectedTask = useMemo(
    () => tasks.find((task) => task.id === selectedTaskId) ?? null,
    [tasks, selectedTaskId],
  );
  const [draft, setDraft] = useState<Task | null>(selectedTask);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [renamingTaskId, setRenamingTaskId] = useState<string | null>(null);
  const [renamingTitle, setRenamingTitle] = useState("");

  useEffect(() => {
    setDraft(selectedTask);
    setSaveMessage("");
  }, [selectedTask]);

  useEffect(() => {
    setRenamingTaskId(null);
    setRenamingTitle("");
  }, [selectedTaskId]);

  const taskCount = tasks.filter((task) => !task.completed).length;
  const primaryModifierLabel = /Mac|iPhone|iPad|iPod/.test(navigator.platform) ? "Cmd" : "Ctrl";
  const taskMap = useMemo(() => new Map(tasks.map((task) => [task.id, task])), [tasks]);
  const taskTree = useMemo(() => buildTaskTree(tasks), [tasks]);
  const selectedTaskPath = useMemo(() => buildTaskPath(selectedTaskId, taskMap), [selectedTaskId, taskMap]);

  const handleSave = useCallback(async () => {
    if (!draft) {
      return;
    }

    setIsSaving(true);
    setSaveMessage("");
    const saved = await onSaveTask({
      id: draft.id,
      title: draft.title,
      content: draft.content,
      completed: draft.completed,
      priority: draft.priority,
      parent_id: draft.parent_id ?? null,
      remind_at: draft.remind_at ?? null,
      due_at: draft.due_at ?? null,
    });
    setIsSaving(false);
    setSaveMessage(saved ? "已保存" : "保存失败");
  }, [draft, onSaveTask]);

  const handleInlineRenameSave = useCallback(async (task: Task) => {
    const nextTitle = renamingTitle.trim();
    if (!nextTitle) {
      setRenamingTaskId(null);
      setRenamingTitle("");
      return;
    }

    const saved = await onSaveTask({
      id: task.id,
      title: nextTitle,
      content: task.content,
      completed: task.completed,
      priority: task.priority,
      parent_id: task.parent_id ?? null,
      remind_at: task.remind_at ?? null,
      due_at: task.due_at ?? null,
    });

    if (saved) {
      setRenamingTaskId(null);
      setRenamingTitle("");
    }
  }, [onSaveTask, renamingTitle]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isEditableTarget = Boolean(
        target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable),
      );
      const primaryPressed = /Mac|iPhone|iPad|iPod/.test(navigator.platform) ? event.metaKey : event.ctrlKey;
      const isMac = /Mac|iPhone|iPad|iPod/.test(navigator.platform);

      if (!primaryPressed) {
        return;
      }

      if (event.key.toLowerCase() === "n") {
        event.preventDefault();
        if (event.shiftKey && selectedTaskId) {
          onCreateChildTask(selectedTaskId);
        } else {
          onCreateTask();
        }
        return;
      }

      if (event.key.toLowerCase() === "s") {
        event.preventDefault();
        void handleSave();
        return;
      }

      const wantsRedo = (isMac && event.shiftKey && event.key.toLowerCase() === "z") || (!isMac && event.key.toLowerCase() === "y");
      if (isEditableTarget && wantsRedo) {
        event.preventDefault();
        document.execCommand("redo");
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleSave, onCreateChildTask, onCreateTask, selectedTaskId]);

  const renderTaskNode = (node: TaskTreeNode, depth = 0) => {
    const { task, children } = node;
    const reminderState = getReminderState(task);
    const isSelected = task.id === selectedTaskId;
    const isRenaming = renamingTaskId === task.id;

    return (
      <div key={task.id}>
        <button
          type="button"
          onClick={() => onSelectTask(task.id)}
          onDoubleClick={() => {
            setRenamingTaskId(task.id);
            setRenamingTitle(task.title);
          }}
          className={`w-full border-b border-slate-100 px-4 py-3 text-left transition-colors ${
            isSelected ? "bg-blue-50" : "hover:bg-slate-50"
          }`}
          style={{ paddingLeft: `${depth * 18 + 16}px` }}
        >
          <div className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={task.completed}
              onChange={(event) => {
                void onToggleTaskCompleted(task, event.target.checked);
              }}
              onClick={(event) => event.stopPropagation()}
              className="mt-1"
            />
            <div className="min-w-0 flex-1">
              {isRenaming ? (
                <input
                  type="text"
                  value={renamingTitle}
                  onChange={(event) => setRenamingTitle(event.target.value)}
                  onClick={(event) => event.stopPropagation()}
                  onDoubleClick={(event) => event.stopPropagation()}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void handleInlineRenameSave(task);
                    } else if (event.key === "Escape") {
                      event.preventDefault();
                      setRenamingTaskId(null);
                      setRenamingTitle("");
                    }
                  }}
                  onBlur={() => void handleInlineRenameSave(task)}
                  className="w-full rounded border border-blue-300 bg-white px-2 py-1 text-sm font-medium text-slate-800 outline-none"
                  autoFocus
                />
              ) : (
                <div className={`truncate text-sm font-medium ${task.completed ? "text-slate-400 line-through" : "text-slate-800"}`}>
                  {depth > 0 ? "↳ " : ""}{task.title}
                </div>
              )}
              <div className="mt-1 truncate text-xs text-slate-400">
                {task.content || "暂无详情"}
              </div>
              <div className="mt-2 flex items-center gap-2 text-[11px]">
                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-500">{task.priority}</span>
                <span className="text-slate-300">层级 {task.depth ?? depth}</span>
                {task.due_at ? <span className="text-slate-400">截止 {formatDateTime(task.due_at)}</span> : null}
                {reminderState ? (
                  <span className={`rounded px-1.5 py-0.5 ${reminderState.tone}`}>{reminderState.label}</span>
                ) : null}
              </div>
            </div>
            {!isRenaming ? (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  setRenamingTaskId(task.id);
                  setRenamingTitle(task.title);
                }}
                className="rounded p-1 text-slate-400 opacity-45 transition-opacity hover:bg-slate-100 hover:text-blue-600 hover:opacity-100"
                title="重命名待办"
                aria-label="重命名待办"
              >
                <span aria-hidden="true">✎</span>
              </button>
            ) : null}
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
            <div className="text-sm font-medium text-slate-700">待办事项</div>
            <div className="text-xs text-slate-400 mt-1">{taskCount} 个未完成</div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onCreateTask}
              className="rounded-lg bg-blue-500 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-blue-600 transition-colors"
            >
              新建待办
            </button>
            <button
              type="button"
              onClick={() => {
                if (selectedTaskId) {
                  onCreateChildTask(selectedTaskId);
                }
              }}
              disabled={!selectedTaskId}
              className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
            >
              子待办
            </button>
          </div>
        </div>

        <div className="border-b border-slate-100 bg-slate-50 px-4 py-2 text-[11px] text-slate-400">
          当前路径：{selectedTaskPath} · {primaryModifierLabel}+N 新建根待办，{primaryModifierLabel}+Shift+N 新建子待办
        </div>

        <div className="flex-1 overflow-y-auto">
          {taskTree.length === 0 ? (
            <div className="px-4 py-6 text-sm text-slate-400">还没有待办，先新建一个吧。</div>
          ) : (
            taskTree.map((node) => renderTaskNode(node))
          )}
        </div>
      </div>

      <div className="flex-1 min-w-[500px] flex flex-col bg-white">
        {!draft ? (
          <div className="flex-1 flex items-center justify-center bg-slate-50">
            <div className="text-center text-slate-400">
              <span className="text-6xl mb-4 block">✅</span>
              <p className="text-lg">选择或新建待办</p>
              <p className="text-sm mt-2">中间列表现在支持层级待办和子待办创建</p>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-white">
              <div className="min-w-0">
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={draft.completed}
                    onChange={(event) => setDraft((prev) => (prev ? { ...prev, completed: event.target.checked } : prev))}
                  />
                  <input
                    type="text"
                    value={draft.title}
                    onChange={(event) => setDraft((prev) => (prev ? { ...prev, title: event.target.value } : prev))}
                    className="min-w-[260px] text-lg font-semibold text-slate-800 outline-none"
                    placeholder="待办标题"
                  />
                </div>
                <div className="mt-2 text-xs text-slate-400">
                  路径：{buildTaskPath(draft.id, taskMap)}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onCreateChildTask(draft.id)}
                  className="rounded-lg bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-200 transition-colors"
                >
                  新建子待办
                </button>
                <button
                  type="button"
                  onClick={() => void handleSave()}
                  className="rounded-lg bg-blue-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-600 transition-colors"
                >
                  保存
                </button>
                <button
                  type="button"
                  onClick={() => void onDeleteTask(draft.id)}
                  className="rounded-lg bg-red-50 px-3 py-1.5 text-sm font-medium text-red-500 hover:bg-red-100 transition-colors"
                >
                  删除
                </button>
                <span className={`text-xs ${isSaving ? "text-blue-500" : "text-slate-400"}`}>{isSaving ? "保存中..." : saveMessage || "待保存"}</span>
              </div>
            </div>

            <div className="px-4 py-2 border-b border-slate-100 bg-slate-50 text-[11px] text-slate-400">
              {primaryModifierLabel}+S 保存，{primaryModifierLabel}+Z 撤销，{primaryModifierLabel}{primaryModifierLabel === "Cmd" ? "+Shift+Z" : "+Y"} 重做
            </div>

            <div className="px-4 py-3 border-b border-slate-100 bg-slate-50">
              <div className="grid grid-cols-3 gap-3 text-sm">
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-slate-500">优先级</span>
                  <select
                    value={draft.priority}
                    onChange={(event) => setDraft((prev) => (prev ? { ...prev, priority: event.target.value } : prev))}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-700 outline-none"
                  >
                    <option value="high">高</option>
                    <option value="normal">中</option>
                    <option value="low">低</option>
                  </select>
                </label>

                <label className="flex flex-col gap-1">
                  <span className="text-xs text-slate-500">提醒时间</span>
                  <input
                    type="datetime-local"
                    value={toLocalInputValue(draft.remind_at)}
                    onChange={(event) => setDraft((prev) => (prev ? { ...prev, remind_at: fromLocalInputValue(event.target.value) } : prev))}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-700 outline-none"
                  />
                </label>

                <label className="flex flex-col gap-1">
                  <span className="text-xs text-slate-500">截止时间</span>
                  <input
                    type="datetime-local"
                    value={toLocalInputValue(draft.due_at)}
                    onChange={(event) => setDraft((prev) => (prev ? { ...prev, due_at: fromLocalInputValue(event.target.value) } : prev))}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-700 outline-none"
                  />
                </label>
              </div>
            </div>

            <div className="flex-1 p-4 bg-white">
              <textarea
                value={draft.content}
                onChange={(event) => setDraft((prev) => (prev ? { ...prev, content: event.target.value } : prev))}
                placeholder="待办详情、拆解步骤、补充说明..."
                className="h-full w-full resize-none rounded-xl border border-slate-200 p-4 text-sm leading-6 text-slate-700 outline-none focus:border-blue-400"
              />
            </div>
          </>
        )}
      </div>
    </>
  );
}

export default TaskWorkspace;
