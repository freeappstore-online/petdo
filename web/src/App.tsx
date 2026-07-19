import { useState, useEffect, useCallback } from "react";
import { Shell } from "./components/Shell";

// ── Types ──────────────────────────────────────────────────────────────────
interface Task {
  id: string;
  text: string;
  completed: boolean;
  createdAt: number;
}

interface PetState {
  name: string;
  coins: number;
  hunger: number;       // 0–100, 100 = full, 0 = starving → dies
  happiness: number;    // 0–100
  alive: boolean;
  lastTick: number;     // timestamp of last hunger decay
  totalCompleted: number;
}

type View = "tasks" | "pet";

// ── Constants ──────────────────────────────────────────────────────────────
const STORAGE_TASKS = "petodo_tasks";
const STORAGE_PET   = "petodo_pet";
const COIN_PER_TASK = 5;
const HUNGER_DECAY_MS  = 60_000 * 10; // every 10 min lose 5 hunger
const HUNGER_DECAY_AMT = 5;
const FEED_COST = 10; // coins per feed
const FEED_HUNGER = 20; // hunger restored per feed

const DEFAULT_PET: PetState = {
  name: "Biscuit",
  coins: 0,
  hunger: 80,
  happiness: 80,
  alive: true,
  lastTick: Date.now(),
  totalCompleted: 0,
};

// ── Pet SVG sprites ────────────────────────────────────────────────────────
function PetSprite({ hunger, happiness, alive }: { hunger: number; happiness: number; alive: boolean }) {
  const sad = hunger < 30 || happiness < 30;
  const dead = !alive;

  // Eye shapes
  const leftEye  = dead ? "X" : sad ? ">" : "●";
  const rightEye = dead ? "X" : sad ? "<" : "●";
  const mouth    = dead ? "——" : sad ? "︵" : "‿";

  // Body colour based on health
  const bodyColor = dead
    ? "#9ca3af"
    : hunger < 30
    ? "#f87171"
    : hunger < 60
    ? "#fbbf24"
    : "#86efac";

  // Ear wiggle animation class
  const wiggle = !dead && !sad ? "animate-bounce" : "";

  return (
    <div className="flex flex-col items-center select-none" style={{ userSelect: "none" }}>
      {/* Ears */}
      <div className="flex gap-8 mb-[-8px]">
        <div
          className={`w-5 h-7 rounded-full ${wiggle}`}
          style={{ background: bodyColor, transform: "rotate(-15deg)" }}
        />
        <div
          className={`w-5 h-7 rounded-full ${wiggle}`}
          style={{ background: bodyColor, transform: "rotate(15deg)", animationDelay: "0.15s" }}
        />
      </div>

      {/* Head */}
      <div
        className="relative flex items-center justify-center rounded-full shadow-lg"
        style={{ width: 120, height: 110, background: bodyColor }}
      >
        {/* Eyes */}
        <div className="flex gap-7 items-center" style={{ marginTop: -8 }}>
          <span style={{ fontSize: dead ? 18 : 20, lineHeight: 1 }}>{leftEye}</span>
          <span style={{ fontSize: dead ? 18 : 20, lineHeight: 1 }}>{rightEye}</span>
        </div>
        {/* Mouth */}
        <div
          className="absolute"
          style={{ bottom: 26, fontSize: 18, left: "50%", transform: "translateX(-50%)" }}
        >
          {mouth}
        </div>
        {/* Blush */}
        {!dead && (
          <>
            <div
              className="absolute rounded-full opacity-30"
              style={{ width: 22, height: 12, background: "#f43f5e", bottom: 34, left: 12 }}
            />
            <div
              className="absolute rounded-full opacity-30"
              style={{ width: 22, height: 12, background: "#f43f5e", bottom: 34, right: 12 }}
            />
          </>
        )}
      </div>

      {/* Body */}
      <div
        className="rounded-b-3xl rounded-t-xl flex items-end justify-center gap-3 pb-2"
        style={{ width: 100, height: 70, background: bodyColor, marginTop: -4 }}
      >
        {/* Feet */}
        <div className="w-7 h-5 rounded-full" style={{ background: bodyColor, filter: "brightness(0.85)" }} />
        <div className="w-7 h-5 rounded-full" style={{ background: bodyColor, filter: "brightness(0.85)" }} />
      </div>

      {/* Arms */}
      <div className="flex gap-2 mt-[-44px] w-[140px] justify-between px-1 pointer-events-none">
        <div className="w-5 h-10 rounded-full" style={{ background: bodyColor, transform: "rotate(20deg)", transformOrigin: "top center" }} />
        <div className="w-5 h-10 rounded-full" style={{ background: bodyColor, transform: "rotate(-20deg)", transformOrigin: "top center" }} />
      </div>

      {/* Status label */}
      <div className="mt-6 text-sm font-semibold" style={{ color: dead ? "var(--error)" : sad ? "var(--warning)" : "var(--success)" }}>
        {dead ? "💀 Your pet has died" : sad ? "😟 Feeling unwell…" : "😊 Happy & healthy!"}
      </div>
    </div>
  );
}

// ── Stat bar ───────────────────────────────────────────────────────────────
function StatBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between text-xs font-medium" style={{ color: "var(--muted)" }}>
        <span>{label}</span>
        <span>{Math.round(value)}%</span>
      </div>
      <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--line)" }}>
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${value}%`, background: color }}
        />
      </div>
    </div>
  );
}

// ── Task row ───────────────────────────────────────────────────────────────
function TaskRow({
  task,
  onToggle,
  onDelete,
}: {
  task: Task;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div
      className="flex items-center gap-3 px-4 py-3 rounded-2xl transition-colors"
      style={{ background: "var(--panel)", border: "1px solid var(--line)" }}
    >
      {/* Tick circle */}
      <button
        onClick={() => onToggle(task.id)}
        aria-label={task.completed ? "Mark incomplete" : "Mark complete"}
        className="shrink-0 flex items-center justify-center rounded-full border-2 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-1"
        style={{
          width: 26,
          height: 26,
          borderColor: task.completed ? "var(--success)" : "var(--line-strong)",
          background: task.completed ? "var(--success)" : "transparent",
          focusRingColor: "var(--accent)",
        }}
      >
        {task.completed && (
          <svg width="13" height="10" viewBox="0 0 13 10" fill="none">
            <path d="M1 5l3.5 3.5L12 1" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>

      {/* Text */}
      <span
        className="flex-1 text-sm leading-snug transition-all duration-200"
        style={{
          color: task.completed ? "var(--muted)" : "var(--ink)",
          textDecoration: task.completed ? "line-through" : "none",
        }}
      >
        {task.text}
      </span>

      {/* Delete */}
      <button
        onClick={() => onDelete(task.id)}
        aria-label="Delete task"
        className="shrink-0 opacity-30 hover:opacity-80 transition-opacity text-lg leading-none"
        style={{ color: "var(--muted)" }}
      >
        ×
      </button>
    </div>
  );
}

// ── Main App ───────────────────────────────────────────────────────────────
export default function App() {
  const [view, setView] = useState<View>("tasks");
  const [tasks, setTasks] = useState<Task[]>(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_TASKS) || "[]"); }
    catch { return []; }
  });
  const [pet, setPet] = useState<PetState>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_PET);
      return saved ? JSON.parse(saved) : DEFAULT_PET;
    } catch { return DEFAULT_PET; }
  });
  const [newText, setNewText] = useState("");
  const [namingPet, setNamingPet] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [coinAnim, setCoinAnim] = useState(false);

  // Persist tasks
  useEffect(() => {
    localStorage.setItem(STORAGE_TASKS, JSON.stringify(tasks));
  }, [tasks]);

  // Persist pet
  useEffect(() => {
    localStorage.setItem(STORAGE_PET, JSON.stringify(pet));
  }, [pet]);

  // Hunger decay tick
  useEffect(() => {
    const interval = setInterval(() => {
      setPet((prev) => {
        if (!prev.alive) return prev;
        const now = Date.now();
        const ticks = Math.floor((now - prev.lastTick) / HUNGER_DECAY_MS);
        if (ticks <= 0) return prev;
        const newHunger = Math.max(0, prev.hunger - ticks * HUNGER_DECAY_AMT);
        const newHappiness = Math.max(0, prev.happiness - ticks * 2);
        const alive = newHunger > 0;
        return { ...prev, hunger: newHunger, happiness: newHappiness, alive, lastTick: now };
      });
    }, 5_000);
    return () => clearInterval(interval);
  }, []);

  // Add task
  const addTask = useCallback(() => {
    const text = newText.trim();
    if (!text) return;
    setTasks((prev) => [
      { id: crypto.randomUUID(), text, completed: false, createdAt: Date.now() },
      ...prev,
    ]);
    setNewText("");
  }, [newText]);

  // Toggle task completion
  const toggleTask = useCallback((id: string) => {
    setTasks((prev) =>
      prev.map((t) => {
        if (t.id !== id) return t;
        const completing = !t.completed;
        if (completing && pet.alive) {
          // Award coins
          setPet((p) => {
            const newCoins = p.coins + COIN_PER_TASK;
            const newHappiness = Math.min(100, p.happiness + 5);
            return { ...p, coins: newCoins, happiness: newHappiness, totalCompleted: p.totalCompleted + 1 };
          });
          setCoinAnim(true);
          setTimeout(() => setCoinAnim(false), 800);
        } else if (!completing && pet.alive) {
          // Un-completing — take coins back (min 0)
          setPet((p) => ({ ...p, coins: Math.max(0, p.coins - COIN_PER_TASK) }));
        }
        return { ...t, completed: completing };
      })
    );
  }, [pet.alive]);

  // Delete task
  const deleteTask = useCallback((id: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Feed pet
  const feedPet = useCallback(() => {
    setPet((prev) => {
      if (!prev.alive || prev.coins < FEED_COST) return prev;
      return {
        ...prev,
        coins: prev.coins - FEED_COST,
        hunger: Math.min(100, prev.hunger + FEED_HUNGER),
        happiness: Math.min(100, prev.happiness + 10),
      };
    });
  }, []);

  // Restart pet
  const restartPet = useCallback(() => {
    setPet({ ...DEFAULT_PET, name: pet.name, lastTick: Date.now() });
    setTasks([]);
  }, [pet.name]);

  // Rename pet
  const renamePet = useCallback(() => {
    const name = nameInput.trim();
    if (!name) return;
    setPet((prev) => ({ ...prev, name }));
    setNamingPet(false);
    setNameInput("");
  }, [nameInput]);

  const incompleteTasks = tasks.filter((t) => !t.completed);
  const completedTasks  = tasks.filter((t) => t.completed);

  // ── Nav items ────────────────────────────────────────────────────────────
  const navItems = [
    { id: "tasks" as View, label: "Tasks", icon: "✅" },
    { id: "pet"   as View, label: "My Pet", icon: "🐾" },
  ];

  return (
    <Shell navItems={navItems} activeView={view} onNavigate={setView}>
      {/* ── TASKS VIEW ── */}
      {view === "tasks" && (
        <div className="max-w-xl mx-auto flex flex-col gap-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold" style={{ fontFamily: "Fraunces, serif" }}>
                To-Do
              </h1>
              <p className="text-sm mt-0.5" style={{ color: "var(--muted)" }}>
                Complete tasks → earn coins → feed {pet.name}!
              </p>
            </div>
            {/* Coin badge */}
            <div
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full font-bold text-sm transition-transform ${coinAnim ? "scale-125" : "scale-100"}`}
              style={{ background: "var(--panel)", border: "1px solid var(--line)", color: "var(--warning)" }}
            >
              🪙 {pet.coins}
            </div>
          </div>

          {/* Add task input */}
          <div
            className="flex items-center gap-2 px-4 py-3 rounded-2xl"
            style={{ background: "var(--panel)", border: "1px solid var(--line)" }}
          >
            <input
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--muted)]"
              style={{ color: "var(--ink)" }}
              placeholder="Add a new task…"
              value={newText}
              onChange={(e) => setNewText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addTask()}
            />
            <button
              onClick={addTask}
              disabled={!newText.trim()}
              className="px-3 py-1.5 rounded-xl text-sm font-semibold transition-opacity disabled:opacity-40"
              style={{ background: "var(--accent)", color: "#fff" }}
            >
              Add
            </button>
          </div>

          {/* Task list */}
          {tasks.length === 0 ? (
            <div
              className="flex flex-col items-center justify-center py-16 gap-3 rounded-2xl"
              style={{ border: "1.5px dashed var(--line)" }}
            >
              <span className="text-4xl">📝</span>
              <p className="text-sm" style={{ color: "var(--muted)" }}>No tasks yet — add one above!</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {incompleteTasks.map((t) => (
                <TaskRow key={t.id} task={t} onToggle={toggleTask} onDelete={deleteTask} />
              ))}
              {completedTasks.length > 0 && (
                <>
                  <p className="text-xs font-semibold mt-2 px-1" style={{ color: "var(--muted)" }}>
                    COMPLETED · {completedTasks.length}
                  </p>
                  {completedTasks.map((t) => (
                    <TaskRow key={t.id} task={t} onToggle={toggleTask} onDelete={deleteTask} />
                  ))}
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── PET VIEW ── */}
      {view === "pet" && (
        <div className="max-w-sm mx-auto flex flex-col gap-6 items-center">
          {/* Pet name */}
          <div className="flex items-center gap-2">
            {namingPet ? (
              <>
                <input
                  autoFocus
                  className="text-xl font-bold text-center bg-transparent border-b-2 outline-none px-2 py-1"
                  style={{ fontFamily: "Fraunces, serif", borderColor: "var(--accent)", color: "var(--ink)", width: 160 }}
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && renamePet()}
                  maxLength={20}
                />
                <button
                  onClick={renamePet}
                  className="text-sm px-2 py-1 rounded-lg font-semibold"
                  style={{ background: "var(--accent)", color: "#fff" }}
                >
                  Save
                </button>
                <button
                  onClick={() => setNamingPet(false)}
                  className="text-sm px-2 py-1 rounded-lg"
                  style={{ background: "var(--line)", color: "var(--ink)" }}
                >
                  Cancel
                </button>
              </>
            ) : (
              <>
                <h1 className="text-2xl font-bold" style={{ fontFamily: "Fraunces, serif" }}>
                  {pet.name}
                </h1>
                <button
                  onClick={() => { setNamingPet(true); setNameInput(pet.name); }}
                  className="text-xs px-2 py-0.5 rounded-full opacity-50 hover:opacity-100 transition-opacity"
                  style={{ border: "1px solid var(--line)", color: "var(--muted)" }}
                >
                  rename
                </button>
              </>
            )}
          </div>

          {/* Pet sprite */}
          <div
            className="w-full flex flex-col items-center py-8 rounded-3xl"
            style={{ background: "var(--panel)", border: "1px solid var(--line)" }}
          >
            <PetSprite hunger={pet.hunger} happiness={pet.happiness} alive={pet.alive} />
          </div>

          {/* Stats */}
          {pet.alive && (
            <div className="w-full flex flex-col gap-3 px-1">
              <StatBar label="🍖 Hunger" value={pet.hunger} color="var(--success)" />
              <StatBar label="😊 Happiness" value={pet.happiness} color="#a78bfa" />
            </div>
          )}

          {/* Coins + feed */}
          <div
            className="w-full flex items-center justify-between px-5 py-4 rounded-2xl"
            style={{ background: "var(--panel)", border: "1px solid var(--line)" }}
          >
            <div className="flex flex-col">
              <span className="text-xs font-semibold" style={{ color: "var(--muted)" }}>YOUR COINS</span>
              <span className="text-2xl font-bold" style={{ color: "var(--warning)" }}>🪙 {pet.coins}</span>
              <span className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>
                Each feed costs {FEED_COST} coins
              </span>
            </div>
            <button
              onClick={feedPet}
              disabled={!pet.alive || pet.coins < FEED_COST}
              className="px-5 py-2.5 rounded-xl font-bold text-sm transition-all disabled:opacity-40 active:scale-95"
              style={{ background: "var(--success)", color: "#fff" }}
            >
              🍖 Feed
            </button>
          </div>

          {/* Earn coins hint */}
          <div
            className="w-full text-center text-sm rounded-2xl px-4 py-3"
            style={{ background: "var(--panel)", border: "1px solid var(--line)", color: "var(--muted)" }}
          >
            ✅ Complete tasks to earn <strong style={{ color: "var(--warning)" }}>+{COIN_PER_TASK} coins</strong> per task.<br />
            Don't let {pet.name}'s hunger reach 0 or they'll die! 💀
          </div>

          {/* Stats row */}
          <div className="w-full grid grid-cols-2 gap-3">
            <div
              className="flex flex-col items-center py-3 rounded-2xl"
              style={{ background: "var(--panel)", border: "1px solid var(--line)" }}
            >
              <span className="text-xl font-bold">{pet.totalCompleted}</span>
              <span className="text-xs" style={{ color: "var(--muted)" }}>Tasks completed</span>
            </div>
            <div
              className="flex flex-col items-center py-3 rounded-2xl"
              style={{ background: "var(--panel)", border: "1px solid var(--line)" }}
            >
              <span className="text-xl font-bold" style={{ color: pet.alive ? "var(--success)" : "var(--error)" }}>
                {pet.alive ? "Alive 💚" : "Dead 💀"}
              </span>
              <span className="text-xs" style={{ color: "var(--muted)" }}>Status</span>
            </div>
          </div>

          {/* Restart (only if dead) */}
          {!pet.alive && (
            <button
              onClick={restartPet}
              className="w-full py-3 rounded-2xl font-bold text-sm transition-all active:scale-95"
              style={{ background: "var(--error)", color: "#fff" }}
            >
              😢 Start Over — Adopt a New Pet
            </button>
          )}
        </div>
      )}
    </Shell>
  );
}
