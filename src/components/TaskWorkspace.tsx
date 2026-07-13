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
  return { roots, nodeMap };
}

function buildTaskPath(taskId: string | null, taskMap: Map<string, Task>) {
  if (!taskId || !taskMap.has(taskId)) {
    return "根待办";
  }

  const parts: string[] = [];
  let current = taskMap.get(taskId) ?? null;
  while (current) {
    parts.unshift(getTaskDisplayText(current));
    current = current.parent_id ? taskMap.get(current.parent_id) ?? null : null;
  }

  return parts.join(" / ");
}

function getFirstContentLine(content: string) {
  return content.split(/\r?\n/).map((line) => line.trim()).find(Boolean) ?? "";
}

function getTaskDisplayText(task: Task) {
  return getFirstContentLine(task.content) || task.title || "新待办";
}

function withDerivedTitle(task: Task): Task {
  return {
    ...task,
    title: getFirstContentLine(task.content) || "新待办",
  };
}

function getRootTaskId(taskId: string | null, taskMap: Map<string, Task>) {
  if (!taskId || !taskMap.has(taskId)) {
    return null;
  }

  let current = taskMap.get(taskId) ?? null;
  while (current?.parent_id) {
    current = taskMap.get(current.parent_id) ?? null;
  }

  return current?.id ?? null;
}

function buildProgressStats(children: TaskTreeNode[]) {
  const total = children.length;
  const completed = children.filter((node) => node.task.completed).length;
  const percent = total === 0 ? 0 : Math.round((completed / total) * 100);
  return { total, completed, percent };
}

function createTaskSaveRequest(task: Task): UpdateTaskRequest {
  const normalizedTask = withDerivedTitle(task);
  return {
    id: normalizedTask.id,
    title: normalizedTask.title,
    content: normalizedTask.content,
    completed: normalizedTask.completed,
    priority: normalizedTask.priority,
    parent_id: normalizedTask.parent_id ?? null,
    remind_at: normalizedTask.remind_at ?? null,
    due_at: normalizedTask.due_at ?? null,
  };
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
  const [isSavingParent, setIsSavingParent] = useState(false);
  const [parentSaveMessage, setParentSaveMessage] = useState("");
  const [pendingDeleteTask, setPendingDeleteTask] = useState<Task | null>(null);
  const [isParentExpanded, setIsParentExpanded] = useState(false);
  const [expandedChildId, setExpandedChildId] = useState<string | null>(null);
  const [expandedChildDraft, setExpandedChildDraft] = useState<Task | null>(null);
  const [isSavingChild, setIsSavingChild] = useState(false);
  const [childSaveMessage, setChildSaveMessage] = useState("");

  const taskMap = useMemo(() => new Map(tasks.map((task) => [task.id, task])), [tasks]);
  const { roots: taskTree, nodeMap } = useMemo(() => buildTaskTree(tasks), [tasks]);
  const rootTasks = useMemo(() => taskTree.map((node) => node.task), [taskTree]);
  const taskCount = tasks.filter((task) => !task.completed).length;
  const primaryModifierLabel = /Mac|iPhone|iPad|iPod/.test(navigator.platform) ? "Cmd" : "Ctrl";

  const selectedRootId = useMemo(() => {
    const rootId = getRootTaskId(selectedTaskId, taskMap);
    return rootId ?? rootTasks[0]?.id ?? null;
  }, [rootTasks, selectedTaskId, taskMap]);

  const selectedRootTask = selectedRootId ? taskMap.get(selectedRootId) ?? null : null;
  const activeTaskId = selectedTaskId && taskMap.has(selectedTaskId) ? selectedTaskId : selectedRootId;
  const activeTask = activeTaskId ? taskMap.get(activeTaskId) ?? null : null;
  const activeNode = activeTaskId ? nodeMap.get(activeTaskId) ?? null : null;
  const childNodes = activeNode?.children ?? [];
  const selectedTaskPath = useMemo(() => buildTaskPath(activeTaskId, taskMap), [activeTaskId, taskMap]);
  const activeDepth = activeTask?.depth ?? (activeTask ? buildTaskPath(activeTask.id, taskMap).split(" / ").length - 1 : 0);
  const canCreateChild = Boolean(activeTask && activeDepth < 2);
  const childLayerLabel = activeDepth === 0 ? "子待办" : "孙待办";
  const createChildButtonLabel = activeDepth === 0 ? "新建子待办" : "新建孙待办";
  const activeTaskLabel = activeDepth === 0 ? "父待办" : activeDepth === 1 ? "子待办" : "孙待办";

  const [parentDraft, setParentDraft] = useState<Task | null>(activeTask);

  useEffect(() => {
    if (!selectedRootTask && rootTasks[0]) {
      onSelectTask(rootTasks[0].id);
    }
  }, [onSelectTask, rootTasks, selectedRootTask]);

  useEffect(() => {
    setParentDraft(activeTask);
    setParentSaveMessage("");
    setIsParentExpanded(false);
  }, [activeTask]);

  useEffect(() => {
    setExpandedChildId((prev) => (prev && childNodes.some((node) => node.task.id === prev) ? prev : null));
  }, [childNodes]);

  const expandedChildNode = useMemo(
    () => childNodes.find((node) => node.task.id === expandedChildId) ?? null,
    [childNodes, expandedChildId],
  );

  useEffect(() => {
    setExpandedChildDraft(expandedChildNode?.task ?? null);
    setChildSaveMessage("");
  }, [expandedChildNode]);

  const progressStats = useMemo(() => buildProgressStats(childNodes), [childNodes]);

  const handleParentSave = useCallback(async () => {
    if (!parentDraft) {
      return;
    }

    setIsSavingParent(true);
    setParentSaveMessage("");
    const saved = await onSaveTask(createTaskSaveRequest(parentDraft));
    setIsSavingParent(false);
    setParentSaveMessage(saved ? "已保存" : "保存失败");
  }, [onSaveTask, parentDraft]);

  const handleChildSave = useCallback(async () => {
    if (!expandedChildDraft) {
      return;
    }

    setIsSavingChild(true);
    setChildSaveMessage("");
    const saved = await onSaveTask({
      ...createTaskSaveRequest(expandedChildDraft),
      remind_at: null,
      due_at: null,
    });
    setIsSavingChild(false);
    setChildSaveMessage(saved ? "已保存" : "保存失败");
  }, [expandedChildDraft, onSaveTask]);

  const confirmDeleteTask = useCallback(async () => {
    if (!pendingDeleteTask) {
      return;
    }

    await onDeleteTask(pendingDeleteTask.id);
    setPendingDeleteTask(null);
  }, [onDeleteTask, pendingDeleteTask]);

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
        if (event.shiftKey && expandedChildDraft) {
          onCreateChildTask(expandedChildDraft.id);
        } else if (event.shiftKey && activeTask && activeDepth < 2) {
          onCreateChildTask(activeTask.id);
        } else {
          onCreateTask();
        }
        return;
      }

      if (event.key.toLowerCase() === "s") {
        event.preventDefault();
        if (expandedChildDraft) {
          void handleChildSave();
        } else {
          void handleParentSave();
        }
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
  }, [activeDepth, activeTask, expandedChildDraft, handleChildSave, handleParentSave, onCreateChildTask, onCreateTask]);

  const renderChildCard = (node: TaskTreeNode) => {
    const { task, children } = node;
    const isExpanded = expandedChildId === task.id;
    const grandchildCount = children.length;
    const completedGrandchildCount = children.filter((child) => child.task.completed).length;

    return (
      <div
        key={task.id}
        className={`rounded-lg border bg-white transition-all ${
          isExpanded ? "border-blue-300 shadow-sm" : "border-slate-200 hover:border-blue-200"
        }`}
      >
        <button
          type="button"
          onClick={() => {
            setExpandedChildId((prev) => (prev === task.id ? null : task.id));
          }}
          onDoubleClick={() => {
            onSelectTask(task.id);
          }}
          className="grid min-h-[56px] w-full grid-cols-[auto_1fr_auto] items-center gap-3 px-4 py-3 text-left"
        >
          <input
            type="checkbox"
            checked={isExpanded && expandedChildDraft ? expandedChildDraft.completed : task.completed}
            onChange={(event) => {
              const completed = event.target.checked;
              if (isExpanded && expandedChildDraft) {
                setExpandedChildDraft({ ...expandedChildDraft, completed });
              } else {
                void onToggleTaskCompleted(task, completed);
              }
            }}
            onClick={(event) => event.stopPropagation()}
          />
          <div className="min-w-0">
            <div className={`truncate text-sm font-semibold ${task.completed ? "text-slate-400 line-through" : "text-slate-800"}`}>
              {getTaskDisplayText(task)}
            </div>
            <div className="mt-1 flex items-center gap-2 text-[11px] text-slate-400">
              <span>{task.priority}</span>
              <span>{completedGrandchildCount}/{grandchildCount} 个下一层</span>
            </div>
          </div>
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                setExpandedChildId((prev) => (prev === task.id ? null : task.id));
              }}
              className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-200"
            >
              {isExpanded ? "收起" : "展开"}
            </button>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onSelectTask(task.id);
              }}
              className="rounded-lg bg-blue-50 px-3 py-1.5 text-xs text-blue-600 hover:bg-blue-100"
            >
              打开
            </button>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                setPendingDeleteTask(task);
              }}
              className="rounded-lg bg-red-50 px-3 py-1.5 text-xs text-red-500 hover:bg-red-100"
            >
              删除
            </button>
          </div>
        </button>

        {isExpanded && expandedChildDraft ? (
          <div className="border-t border-slate-100 bg-slate-50 px-4 py-3">
            <textarea
              value={expandedChildDraft.content}
              onChange={(event) => setExpandedChildDraft({ ...expandedChildDraft, content: event.target.value })}
              className="h-24 w-full resize-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-400"
              placeholder="待办详情，第一行会作为显示文本..."
            />
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
              <select
                value={expandedChildDraft.priority}
                onChange={(event) => setExpandedChildDraft({ ...expandedChildDraft, priority: event.target.value })}
                className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-slate-700 outline-none"
              >
                <option value="high">高优先级</option>
                <option value="normal">中优先级</option>
                <option value="low">低优先级</option>
              </select>
              <button
                type="button"
                onClick={() => void handleChildSave()}
                className="rounded-lg bg-blue-500 px-3 py-1.5 text-white hover:bg-blue-600"
              >
                保存
              </button>
              <span className={`text-xs ${isSavingChild ? "text-blue-500" : "text-slate-400"}`}>
                {isSavingChild ? "保存中..." : childSaveMessage || "打开后查看下一层"}
              </span>
            </div>
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <>
      <div className="w-[260px] bg-white border-r border-slate-200 flex flex-col">
        <div className="flex items-center justify-between p-3 border-b border-slate-200">
          <div>
            <div className="text-sm font-medium text-slate-700">父待办</div>
            <div className="text-xs text-slate-400 mt-1">{taskCount} 个未完成</div>
          </div>
          <button
            type="button"
            onClick={onCreateTask}
            className="rounded-lg bg-blue-500 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-blue-600 transition-colors"
          >
            新建父待办
          </button>
        </div>

        <div className="border-b border-slate-100 bg-slate-50 px-4 py-2 text-[11px] text-slate-400">
          当前路径：{selectedTaskPath} · {primaryModifierLabel}+N 新建父待办，{primaryModifierLabel}+Shift+N 新建子级
        </div>

        <div className="flex-1 overflow-y-auto">
          {taskTree.length === 0 ? (
            <div className="px-4 py-6 text-sm text-slate-400">还没有父待办，先新建一个吧。</div>
          ) : (
            taskTree.map(({ task, children }) => {
              const isSelected = task.id === selectedRootId;
              const rootProgress = buildProgressStats(children);

              return (
                <button
                  key={task.id}
                  type="button"
                  onClick={() => onSelectTask(task.id)}
                  className={`w-full border-b border-slate-100 px-4 py-3 text-left transition-colors ${
                    isSelected ? "bg-blue-50" : "hover:bg-slate-50"
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
                        {getTaskDisplayText(task)}
                      </div>
                      <div className="mt-1 line-clamp-2 text-xs text-slate-400">
                        {task.content || "右侧查看子待办和孙待办"}
                      </div>
                      <div className="mt-2 flex items-center gap-2 text-[11px] text-slate-400">
                        <span>{children.length} 个子待办</span>
                        <span>进度 {rootProgress.completed}/{rootProgress.total}</span>
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
        {!parentDraft ? (
          <div className="flex-1 flex items-center justify-center bg-slate-50">
            <div className="text-center text-slate-400">
              <span className="text-6xl mb-4 block">✅</span>
              <p className="text-lg">选择或新建父待办</p>
              <p className="text-sm mt-2">左侧只显示父待办，右侧集中处理子待办与孙待办。</p>
            </div>
          </div>
        ) : (
          <>
            <div className={`border-b border-slate-200 bg-white transition-all ${isParentExpanded ? "min-h-[34%]" : "min-h-[16%]"}`}>
              <div className="flex items-start justify-between gap-4 px-4 py-2.5">
                <div className="min-w-0 flex-1">
                  {parentDraft.parent_id ? (
                    <button
                      type="button"
                      onClick={() => onSelectTask(parentDraft.parent_id!)}
                      className="mb-2 rounded-lg bg-slate-100 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-200"
                    >
                      返回上级
                    </button>
                  ) : null}
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={parentDraft.completed}
                      onChange={(event) => setParentDraft({ ...parentDraft, completed: event.target.checked })}
                    />
                    <div className="min-w-0 flex-1 truncate text-lg font-semibold text-slate-800">
                      {getTaskDisplayText(parentDraft)}
                    </div>
                  </div>
                  <div className="mt-1 text-xs text-slate-400">
                    路径：{buildTaskPath(parentDraft.id, taskMap)}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {canCreateChild ? (
                    <button
                      type="button"
                      onClick={() => onCreateChildTask(parentDraft.id)}
                      className="rounded-lg bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-200 transition-colors"
                    >
                      {createChildButtonLabel}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => void handleParentSave()}
                    className="rounded-lg bg-blue-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-600 transition-colors"
                  >
                    保存{activeTaskLabel}
                  </button>
                  <button
                    type="button"
                    onClick={() => setPendingDeleteTask(parentDraft)}
                    className="rounded-lg bg-red-50 px-3 py-1.5 text-sm font-medium text-red-500 hover:bg-red-100 transition-colors"
                  >
                    删除
                  </button>
                </div>
              </div>

              <div className="px-4 pb-3">
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="font-medium text-slate-700">进度 {progressStats.completed}/{progressStats.total}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-slate-400">{progressStats.percent}%</span>
                      <button
                        type="button"
                        onClick={() => setIsParentExpanded((prev) => !prev)}
                        className="rounded-lg bg-white px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100"
                      >
                        {isParentExpanded ? "收起详情" : "展开详情"}
                      </button>
                    </div>
                  </div>
                  <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-slate-200">
                    <div
                      className="h-full rounded-full bg-blue-500 transition-all"
                      style={{ width: `${progressStats.percent}%` }}
                    />
                  </div>
                  {isParentExpanded ? (
                    <div className={`mt-3 grid gap-3 ${activeDepth === 0 ? "md:grid-cols-3" : "md:grid-cols-1"}`}>
                      <label className="flex flex-col gap-1">
                        <span className="text-xs text-slate-500">优先级</span>
                        <select
                          value={parentDraft.priority}
                          onChange={(event) => setParentDraft({ ...parentDraft, priority: event.target.value })}
                          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none"
                        >
                          <option value="high">高</option>
                          <option value="normal">中</option>
                          <option value="low">低</option>
                        </select>
                      </label>
                      {activeDepth === 0 ? (
                        <>
                          <label className="flex flex-col gap-1">
                            <span className="text-xs text-slate-500">提醒时间</span>
                            <input
                              type="datetime-local"
                              value={toLocalInputValue(parentDraft.remind_at)}
                              onChange={(event) => setParentDraft({ ...parentDraft, remind_at: fromLocalInputValue(event.target.value) })}
                              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none"
                            />
                          </label>
                          <label className="flex flex-col gap-1">
                            <span className="text-xs text-slate-500">截止时间</span>
                            <input
                              type="datetime-local"
                              value={toLocalInputValue(parentDraft.due_at)}
                              onChange={(event) => setParentDraft({ ...parentDraft, due_at: fromLocalInputValue(event.target.value) })}
                              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none"
                            />
                          </label>
                        </>
                      ) : null}
                    </div>
                  ) : null}
                  <div className="mt-3">
                    {isParentExpanded ? (
                      <textarea
                        value={parentDraft.content}
                        onChange={(event) => setParentDraft({ ...parentDraft, content: event.target.value })}
                        placeholder={`${activeTaskLabel}详情，第一行会作为显示文本...`}
                        className="h-32 w-full resize-none rounded-xl border border-slate-200 bg-white p-3 text-sm leading-6 text-slate-700 outline-none focus:border-blue-400"
                      />
                    ) : (
                      <div className="line-clamp-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm leading-6 text-slate-500">
                        {getFirstContentLine(parentDraft.content) || "展开详情后填写父待办内容，第一行会作为显示文本。"}
                      </div>
                    )}
                  </div>
                  <div className="mt-2 flex items-center justify-between text-xs text-slate-400">
                    <span>{primaryModifierLabel}+S 保存当前编辑中的待办</span>
                    <span>{isSavingParent ? "保存中..." : parentSaveMessage || (activeDepth === 0 ? "父待办仅设置自己的时间，不继承给子级" : "当前层级不设置时间")}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="border-b border-slate-100 bg-slate-50 px-4 py-2 text-[11px] text-slate-400">
              {childLayerLabel}以横条展示，展开只编辑当前条目，打开后进入下一层。
            </div>

            <div className="flex-1 overflow-y-auto bg-slate-50 p-4">
              {childNodes.length === 0 ? (
                <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white text-slate-400">
                  当前待办还没有{childLayerLabel}，先新建一个吧。
                </div>
              ) : (
                <div className="space-y-2">
                  {childNodes.map((node) => renderChildCard(node))}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {pendingDeleteTask ? (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/25">
          <div className="w-[380px] rounded-xl bg-white p-4 shadow-xl">
            <div className="text-sm font-semibold text-slate-800">确认删除待办</div>
            <div className="mt-3 text-sm text-slate-600">
              确定删除“{pendingDeleteTask.title}”吗？
            </div>
            <div className="mt-1 text-xs text-slate-400">
              删除后会进入应用内回收站。
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingDeleteTask(null)}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-500 hover:bg-slate-50"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => {
                  void confirmDeleteTask();
                }}
                className="rounded-lg bg-red-500 px-3 py-1.5 text-sm text-white hover:bg-red-600"
              >
                删除
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

export default TaskWorkspace;
