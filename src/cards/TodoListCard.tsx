import React, { useState, useCallback } from "react";
import { Plus, Pencil, Trash2, Check, X } from "lucide-react";
import type { CardRendererProps } from "./types";
import { useT } from "../lib/i18n";

interface Todo {
  id: string;
  text: string;
  completed: boolean;
}

function TodoListCardInner({ card }: CardRendererProps) {
  const { t } = useT();
  const [todos, setTodos] = useState<Todo[]>([]);
  const [input, setInput] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [filter, setFilter] = useState<"all" | "active" | "completed">("all");

  const addTodo = useCallback(() => {
    const trimmed = input.trim();
    if (!trimmed) return;
    setTodos((prev) => [
      ...prev,
      { id: crypto.randomUUID(), text: trimmed, completed: false },
    ]);
    setInput("");
  }, [input]);

  const deleteTodo = useCallback((id: string) => {
    setTodos((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toggleTodo = useCallback((id: string) => {
    setTodos((prev) =>
      prev.map((t) => (t.id === id ? { ...t, completed: !t.completed } : t)),
    );
  }, []);

  const startEdit = useCallback((todo: Todo) => {
    setEditingId(todo.id);
    setEditText(todo.text);
  }, []);

  const saveEdit = useCallback(() => {
    const trimmed = editText.trim();
    if (!trimmed || !editingId) {
      setEditingId(null);
      return;
    }
    setTodos((prev) =>
      prev.map((t) => (t.id === editingId ? { ...t, text: trimmed } : t)),
    );
    setEditingId(null);
    setEditText("");
  }, [editingId, editText]);

  const cancelEdit = useCallback(() => {
    setEditingId(null);
    setEditText("");
  }, []);

  const filtered = todos.filter((t) => {
    if (filter === "active") return !t.completed;
    if (filter === "completed") return t.completed;
    return true;
  });

  const activeCount = todos.filter((t) => !t.completed).length;

  return (
    <div className="px-4 py-3">
      {/* Header */}
      <h3 className="text-sm font-semibold text-gray-200 mb-3">
        {card.text || "Todo List"}
      </h3>

      {/* Add input */}
      <div className="flex gap-2 mb-3">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addTodo()}
          placeholder={t("todoList.placeholder")}
          className="flex-1 px-3 py-1.5 text-sm rounded-lg bg-gray-800/60 border border-gray-700/50 text-gray-100 placeholder-gray-500 outline-none focus:border-blue-500/60 transition-colors"
        />
        <button
          onClick={addTodo}
          disabled={!input.trim()}
          className="px-3 py-1.5 text-sm rounded-lg bg-blue-600 hover:bg-blue-500 active:scale-[0.97] text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-150 flex items-center gap-1"
        >
          <Plus size={14} />
          Add
        </button>
      </div>

      {/* Filter tabs */}
      {todos.length > 0 && (
        <div className="flex gap-1 mb-3">
          {(["all", "active", "completed"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-2.5 py-1 text-xs rounded-md transition-all duration-150 capitalize ${
                filter === f
                  ? "bg-blue-600/80 text-white"
                  : "bg-gray-800/40 text-gray-400 hover:text-gray-200 hover:bg-gray-700/40"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      )}

      {/* Todo list */}
      <div className="space-y-1.5">
        {filtered.map((todo) => (
          <div
            key={todo.id}
            className="flex items-center gap-2 p-2 rounded-lg bg-gray-800/40 border border-gray-700/30 group hover:bg-gray-800/60 transition-all duration-150"
          >
            {editingId === todo.id ? (
              /* Edit mode */
              <>
                <input
                  type="text"
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") saveEdit();
                    if (e.key === "Escape") cancelEdit();
                  }}
                  autoFocus
                  className="flex-1 px-2 py-1 text-sm rounded bg-gray-900/60 border border-blue-500/50 text-gray-100 outline-none"
                />
                <button
                  onClick={saveEdit}
                  className="p-1 rounded hover:bg-green-600/30 text-green-400 transition-colors"
                >
                  <Check size={14} />
                </button>
                <button
                  onClick={cancelEdit}
                  className="p-1 rounded hover:bg-red-600/30 text-red-400 transition-colors"
                >
                  <X size={14} />
                </button>
              </>
            ) : (
              /* View mode */
              <>
                <button
                  onClick={() => toggleTodo(todo.id)}
                  className={`w-4.5 h-4.5 rounded border flex-shrink-0 flex items-center justify-center transition-all duration-150 ${
                    todo.completed
                      ? "bg-blue-600 border-blue-500 text-white"
                      : "border-gray-600 hover:border-blue-500/60"
                  }`}
                >
                  {todo.completed && <Check size={10} strokeWidth={3} />}
                </button>
                <span
                  className={`flex-1 text-sm transition-all duration-150 ${
                    todo.completed
                      ? "line-through text-gray-500"
                      : "text-gray-200"
                  }`}
                >
                  {todo.text}
                </span>
                <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                  <button
                    onClick={() => startEdit(todo)}
                    className="p-1 rounded hover:bg-gray-700/60 text-gray-400 hover:text-gray-200 transition-colors"
                  >
                    <Pencil size={13} />
                  </button>
                  <button
                    onClick={() => deleteTodo(todo.id)}
                    className="p-1 rounded hover:bg-red-600/30 text-gray-400 hover:text-red-400 transition-colors"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </>
            )}
          </div>
        ))}
      </div>

      {/* Empty state */}
      {todos.length === 0 && (
        <div className="text-center py-6 text-gray-500 text-sm">
          No todos yet. Add one above!
        </div>
      )}

      {/* Footer count */}
      {todos.length > 0 && (
        <div className="mt-3 text-xs text-gray-500">
          {activeCount} item{activeCount !== 1 ? "s" : ""} remaining
        </div>
      )}
    </div>
  );
}

const TodoListCard = React.memo(TodoListCardInner);
export default TodoListCard;
