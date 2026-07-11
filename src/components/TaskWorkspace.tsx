import { useCallback, useEffect, useMemo, useState } from "react";
import type { Task, UpdateTaskRequest } from "@/types";

interface TaskWorkspaceProps {
  tasks: Task[];
  selectedTaskId: string | null;
  onSelectTask: (id: string) => void;
  onCreateTask: () => void;
  onSaveTask: (request: UpdateTaskRequest) => Promise<Task | null>;
  onDeleteTask: (id: string) => Promise<void>;
  onToggleTaskCompleted: (task: Task, completed: boolean) => Promise<void>;
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

function TaskWorkspace({
  tasks,
  selectedTaskId,
  onSelectTask,
  onCreateTask,
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

  useEffect(() => {
    setDraft(selectedTask);
    setSaveMessage("");
  }, [selectedTask]);

  const taskCount = tasks.filter((task) => !task.completed).length;
  const primaryModifierLabel = /Mac|iPhone|iPad|iPod/.test(navigator.platform) ? "Cmd" : "Ctrl";

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
      remind_at: draft.remind_at ?? null,
      due_at: draft.due_at ?? null,
    });
    setIsSaving(false);
    setSaveMessage(saved ? "已保存" : "保存失败");
  }, [draft, onSaveTask]);

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
  }, [handleSave]);

  return (
    <>
      <div className="w-[280px] bg-white border-r border-slate-200 flex flex-col">
        <div className="flex items-center justify-between p-3 border-b border-slate-200">
          <div>
            <div className="text-sm font-medium text-slate-700">待办事项</div>
            <div className="text-xs text-slate-400 mt-1">{taskCount} 个未完成</div>
          </div>
          <button
            type="button"
            onClick={onCreateTask}
            className="rounded-lg bg-blue-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-600 transition-colors"
          >
            + 新建待办
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {tasks.length === 0 ? (
            <div className="px-4 py-6 text-sm text-slate-400">还没有待办，先新建一个吧。</div>
          ) : (
            tasks.map((task) => {
              const reminderState = getReminderState(task);
              return (
                <button
                  key={task.id}
                  type="button"
                  onClick={() => onSelectTask(task.id)}
                  className={`w-full border-b border-slate-100 px-4 py-3 text-left transition-colors ${
                    task.id === selectedTaskId ? "bg-blue-50" : "hover:bg-slate-50"
                  }`}
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
                      <div className={`truncate text-sm font-medium ${task.completed ? "text-slate-400 line-through" : "text-slate-800"}`}>
                        {task.title}
                      </div>
                      <div className="mt-1 truncate text-xs text-slate-400">
                        {task.content || "暂无详情"}
                      </div>
                      <div className="mt-2 flex items-center gap-2 text-[11px]">
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-500">{task.priority}</span>
                        {task.due_at ? <span className="text-slate-400">截止 {formatDateTime(task.due_at)}</span> : null}
                        {reminderState ? (
                          <span className={`rounded px-1.5 py-0.5 ${reminderState.tone}`}>{reminderState.label}</span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      <div className="flex-1 min-w-[500px] flex flex-col bg-white">
        {!draft ? (
          <div className="flex-1 flex items-center justify-center bg-slate-50">
            <div className="text-center text-slate-400">
              <span className="text-6xl mb-4 block">✅</span>
              <p className="text-lg">选择或新建待办</p>
              <p className="text-sm mt-2">中间列表里可以查看待办和提醒时间</p>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-white">
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

              <div className="flex items-center gap-2">
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
