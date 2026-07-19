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
  hunger: number;       // 0–150+, 100 = full, 0 = starving → dies, >120 = overfed, >140 = explodes
  happiness: number;    // 0–100
  alive: boolean;
  deathCause: "starved" | "exploded" | null;
  lastTick: number;
  totalCompleted: number;
}

type View = "tasks" | "pet";

// ── Constants ──────────────────────────────────────────────────────────────
const STORAGE_TASKS = "petodo_tasks";
const STORAGE_PET   = "petodo_pet";
const COIN_PER_TASK = 5;
const HUNGER_DECAY_MS  = 60_000 * 10; // every 10 min
const HUNGER_DECAY_AMT = 5;
const FEED_COST   = 10;
const FEED_HUNGER = 20;
const OVERFED_THRESHOLD  = 110; // starts looking uncomfortable
const STUFFED_THRESHOLD  = 125; // very stuffed
const EXPLODE_THRESHOLD  = 145; // 💥

const DEFAULT_PET: PetState = {
  name: "Biscuit",
  coins: 0,
  hunger: 80,
  happiness: 80,
  alive: true,
  deathCause: null,
  lastTick: Date.now(),
  totalCompleted: 0,
};

// ── Hunger stage helper ────────────────────────────────────────────────────
type HungerStage = "starving" | "hungry" | "content" | "full" | "overfed" | "stuffed" | "critical";

function getHungerStage(hunger: number): HungerStage {
  if (hunger <= 0)                              return "starving";
  if (hunger < 30)                              return "hungry";
  if (hunger < OVERFED_THRESHOLD)               return hunger < 70 ? "content" : "full";
  if (hunger < STUFFED_THRESHOLD)               return "overfed";
  if (hunger < EXPLODE_THRESHOLD)               return "stuffed";
  return "critical";
}

// ── Pet Sprite ─────────────────────────────────────────────────────────────
function PetSprite({
  hunger,
  happiness,
  alive,
  deathCause,
  exploding,
}: {
  hunger: number;
  happiness: number;
  alive: boolean;
  deathCause: "starved" | "exploded" | null;
  exploding: boolean;
}) {
  const stage = getHungerStage(hunger);
  const dead  = !alive;

  // ── Body size grows when overfed ──
  const baseW = 120;
  const baseH = 110;
  const sizeScale =
    stage === "overfed"  ? 1.15 :
    stage === "stuffed"  ? 1.30 :
    stage === "critical" ? 1.45 :
    1;
  const bodyW = Math.round(baseW * sizeScale);
  const bodyH = Math.round(baseH * sizeScale);

  // ── Body colour ──
  const bodyColor =
    dead && deathCause === "exploded" ? "#6b7280" :
    dead                              ? "#9ca3af" :
    stage === "critical"              ? "#ef4444" :
    stage === "stuffed"               ? "#f97316" :
    stage === "overfed"               ? "#eab308" :
    stage === "full"                  ? "#86efac" :
    stage === "content"               ? "#86efac" :
    stage === "hungry"                ? "#fbbf24" :
                                        "#f87171"; // starving

  // ── Eyes ──
  const eyeLeft  =
    dead && deathCause === "exploded" ? "💥" :
    dead                              ? "✕"  :
    stage === "critical"              ? "😵" :
    stage === "stuffed"               ? "😣" :
    stage === "overfed"               ? "😟" :
    stage === "full"                  ? "●"  :
    stage === "content"               ? "●"  :
    stage === "hungry"                ? ">"  :
                                        "×";

  const eyeRight =
    dead && deathCause === "exploded" ? "" :
    dead                              ? "✕" :
    stage === "critical"              ? ""  :
    stage === "stuffed"               ? ""  :
    stage === "overfed"               ? ""  :
    stage === "full"                  ? "●" :
    stage === "content"               ? "●" :
    stage === "hungry"                ? "<" :
                                        "×";

  // ── Mouth ──
  const mouth =
    dead && deathCause === "exploded" ? "💀" :
    dead                              ? "——" :
    stage === "critical"              ? "≋"  :
    stage === "stuffed"               ? "o"  :
    stage === "overfed"               ? "⌒"  :
    stage === "full"                  ? "‿"  :
    stage === "content"               ? "‿"  :
    stage === "hungry"                ? "︵" :
                                        "___";

  // ── Status label ──
  const statusLabel =
    dead && deathCause === "exploded" ? "💥 Your pet exploded!" :
    dead                              ? "💀 Your pet starved…" :
    stage === "critical"              ? "🚨 About to explode!!" :
    stage === "stuffed"               ? "😣 Way too full…" :
    stage === "overfed"               ? "😟 Getting too full" :
    stage === "full"                  ? "😊 Happy & healthy!" :
    stage === "content"               ? "😊 Happy & healthy!" :
    stage === "hungry"                ? "😟 Feeling hungry…" :
                                        "😰 Starving!";

  const statusColor =
    dead || stage === "critical"      ? "var(--error)"   :
    stage === "stuffed"               ? "#f97316"        :
    stage === "overfed"               ? "var(--warning)" :
    stage === "hungry" || stage === "starving" ? "var(--warning)" :
                                        "var(--success)";

  const wiggle = !dead && (stage === "content" || stage === "full") ? "animate-bounce" : "";

  // Shake when critical / exploding
  const shakeClass = (stage === "critical" || exploding) ? "animate-pulse" : "";

  return (
    <div className={`flex flex-col items-center select-none transition-all duration-500 ${shakeClass}`}
      style={{ userSelect: "none" }}>

      {/* 💥 Explosion overlay */}
      {exploding && (
        <div className="text-8xl animate-ping absolute">💥</div>
      )}

      {/* Ears */}
      {!exploding && (
        <div className="flex mb-[-8px]" style={{ gap: `${Math.round(32 * sizeScale)}px` }}>
          <div
            className={`rounded-full ${wiggle}`}
            style={{
              width: Math.round(20 * sizeScale),
              height: Math.round(28 * sizeScale),
              background: bodyColor,
              transform: "rotate(-15deg)",
            }}
          />
          <div
            className={`rounded-full ${wiggle}`}
            style={{
              width: Math.round(20 * sizeScale),
              height: Math.round(28 * sizeScale),
              background: bodyColor,
              transform: "rotate(15deg)",
              animationDelay: "0.15s",
            }}
          />
        </div>
      )}

      {/* Head */}
      {!exploding && (
        <div
          className="relative flex flex-col items-center justify-center rounded-full shadow-lg transition-all duration-500"
          style={{ width: bodyW, height: bodyH, background: bodyColor }}
        >
          {/* Eyes */}
          <div className="flex items-center" style={{ gap: Math.round(28 * sizeScale), marginTop: -8 }}>
            <span style={{ fontSize: stage === "critical" || stage === "stuffed" ? 22 : 20, lineHeight: 1 }}>
              {eyeLeft}
            </span>
            {eyeRight && (
              <span style={{ fontSize: 20, lineHeight: 1 }}>{eyeRight}</span>
            )}
          </div>

          {/* Mouth */}
          <div
            className="absolute"
            style={{
              bottom: Math.round(26 * sizeScale),
              fontSize: stage === "stuffed" || stage === "critical" ? 22 : 18,
              left: "50%",
              transform: "translateX(-50%)",
            }}
          >
            {mouth}
          </div>

          {/* Sweat drops when overfed */}
          {(stage === "overfed" || stage === "stuffed" || stage === "critical") && (
            <div
              className="absolute text-sm"
              style={{ top: 8, right: 8, fontSize: 16 }}
            >
              💧
            </div>
          )}

          {/* Blush (only healthy) */}
          {!dead && (stage === "content" || stage === "full") && (
            <>
              <div className="absolute rounded-full opacity-30"
                style={{ width: 22, height: 12, background: "#f43f5e", bottom: 34, left: 12 }} />
              <div className="absolute rounded-full opacity-30"
                style={{ width: 22, height: 12, background: "#f43f5e", bottom: 34, right: 12 }} />
            </>
          )}

          {/* Tummy lines when stuffed/critical */}
          {(stage === "stuffed" || stage === "critical") && (
            <div className="absolute bottom-4 flex gap-1">
              <div style={{ width: 20, height: 2, borderRadius: 2, background: "rgba(0,0,0,0.15)" }} />
              <div style={{ width: 20, height: 2, borderRadius: 2, background: "rgba(0,0,0,0.15)" }} />
            </div>
          )}
        </div>
      )}

      {/* Body */}
      {!exploding && (
        <div
          className="rounded-b-3xl rounded-t-xl flex items-end justify-center gap-3 pb-2 transition-all duration-500"
          style={{
            width: Math.round(100 * sizeScale),
            height: Math.round(70 * sizeScale),
            background: bodyColor,
            marginTop: -4,
          }}
        >
          <div className="rounded-full" style={{ width: Math.round(28 * sizeScale), height: Math.round(20 * sizeScale), background: bodyColor, filter: "brightness(0.85)" }} />
          <div className="rounded-full" style={{ width: Math.round(28 * sizeScale), height: Math.round(20 * sizeScale), background: bodyColor, filter: "brightness(0.85)" }} />
        </div>
      )}

      {/* Arms */}
      {!exploding && (
        <div
          className="flex justify-between px-1 pointer-events-none"
          style={{ marginTop: Math.round(-44 * sizeScale), width: Math.round(140 * sizeScale) }}
        >
          <div className="rounded-full"
            style={{ width: Math.round(20 * sizeScale), height: Math.round(40 * sizeScale), background: bodyColor, transform: "rotate(20deg)", transformOrigin: "top center" }} />
          <div className="rounded-full"
            style={{ width: Math.round(20 * sizeScale), height: Math.round(40 * sizeScale), background: bodyColor, transform: "rotate(-20deg)", transformOrigin: "top center" }} />
        </div>
      )}

      {/* Warning bar when close to exploding */}
      {!dead && (stage === "stuffed" || stage === "critical") && (
        <div className="mt-4 flex flex-col items-center gap-1">
          <div className="text-xs font-bold animate-pulse" style={{ color: "var(--error)" }}>
            ⚠️ STOP FEEDING! ⚠️
          </div>
        </div>
      )}

      {/* Status label */}
      <div className="mt-5 text-sm font-semibold text-center" style={{ color: statusColor }}>
        {statusLabel}
      </div>
    </div>
  );
}

// ── Stat bar ───────────────────────────────────────────────────────────────
function StatBar({ label, value, max = 100, color, warning }: {
  label: string;
  value: number;
  max?: number;
  color: string;
  warning?: boolean;
}) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between text-xs font-medium" style={{ color: "var(--muted)" }}>
        <span>{label}</span>
        <span className={warning ? "font-bold" : ""} style={{ color: warning ? "var(--error)" : "var(--muted)" }}>
          {Math.round(value)}{max !== 100 ? `/${max}` : "%"}
        </span>
      </div>
      <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--line)" }}>
        <div
          className={`h-full rounded-full transition-all duration-500 ${warning ? "animate-pulse" : ""}`}
          style={{ width: `${pct}%`, background: color }}
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
        className="shrink-0 flex items-center justify-center rounded-full border-2 transition-all duration-200 focus:outline-none"
        style={{
          width: 26,
          height: 26,
          borderColor: task.completed ? "var(--success)" : "var(--line-strong)",
          background: task.completed ? "var(--success)" : "transparent",
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
      return saved ? { ...DEFAULT_PET, ...JSON.parse(saved) } : DEFAULT_PET;
    } catch { return DEFAULT_PET; }
  });
  const [newText, setNewText]   = useState("");
  const [namingPet, setNamingPet] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [coinAnim, setCoinAnim]   = useState(false);
  const [exploding, setExploding] = useState(false);

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
        const now   = Date.now();
        const ticks = Math.floor((now - prev.lastTick) / HUNGER_DECAY_MS);
        if (ticks <= 0) return prev;
        const newHunger    = Math.max(0, prev.hunger - ticks * HUNGER_DECAY_AMT);
        const newHappiness = Math.max(0, prev.happiness - ticks * 2);
        const alive        = newHunger > 0;
        return { ...prev, hunger: newHunger, happiness: newHappiness, alive, deathCause: alive ? null : "starved", lastTick: now };
      });
    }, 5_000);
    return () => clearInterval(interval);
  }, []);

  // Check for explosion
  useEffect(() => {
    if (pet.alive && pet.hunger >= EXPLODE_THRESHOLD && !exploding) {
      setExploding(true);
      setTimeout(() => {
        setPet((prev) => ({
          ...prev,
          alive: false,
          deathCause: "exploded",
        }));
        setExploding(false);
      }, 1200);
    }
  }, [pet.hunger, pet.alive, exploding]);

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

  // Toggle task
  const toggleTask = useCallback((id: string) => {
    setTasks((prev) =>
      prev.map((t) => {
        if (t.id !== id) return t;
        const completing = !t.completed;
        if (completing && pet.alive) {
          setPet((p) => ({
            ...p,
            coins: p.coins + COIN_PER_TASK,
            happiness: Math.min(100, p.happiness + 5),
            totalCompleted: p.totalCompleted + 1,
          }));
          setCoinAnim(true);
          setTimeout(() => setCoinAnim(false), 800);
        } else if (!completing && pet.alive) {
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
      const newHunger = prev.hunger + FEED_HUNGER;
      return {
        ...prev,
        coins: prev.coins - FEED_COST,
        hunger: newHunger,
        happiness: Math.min(100, prev.happiness + 5),
      };
    });
  }, []);

  // Restart
  const restartPet = useCallback(() => {
    setPet({ ...DEFAULT_PET, name: pet.name, lastTick: Date.now() });
    setTasks([]);
  }, [pet.name]);

  // Rename
  const renamePet = useCallback(() => {
    const name = nameInput.trim();
    if (!name) return;
    setPet((prev) => ({ ...prev, name }));
    setNamingPet(false);
    setNameInput("");
  }, [nameInput]);

  const incompleteTasks = tasks.filter((t) => !t.completed);
  const completedTasks  = tasks.filter((t) => t.completed);

  const stage = getHungerStage(pet.hunger);
  const isOverfed = stage === "overfed" || stage === "stuffed" || stage === "critical";
  const hungerBarColor =
    stage === "critical" ? "#ef4444" :
    stage === "stuffed"  ? "#f97316" :
    stage === "overfed"  ? "#eab308" :
    "var(--success)";

  const navItems = [
    { id: "tasks", label: "Tasks", icon: "✅" },
    { id: "pet",   label: "My Pet", icon: "🐾" },
  ];

  return (
    <Shell navItems={navItems} activeView={view} onNavigate={setView}>

      {/* ── TASKS VIEW ── */}
      {view === "tasks" && (
        <div className="max-w-xl mx-auto flex flex-col gap-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold" style={{ fontFamily: "Fraunces, serif" }}>To-Do</h1>
              <p className="text-sm mt-0.5" style={{ color: "var(--muted)" }}>
                Complete tasks → earn coins → feed {pet.name}!
              </p>
            </div>
            <div
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full font-bold text-sm transition-transform ${coinAnim ? "scale-125" : "scale-100"}`}
              style={{ background: "var(--panel)", border: "1px solid var(--line)", color: "var(--warning)" }}
            >
              🪙 {pet.coins}
            </div>
          </div>

          {/* Add task */}
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
                <button onClick={renamePet} className="text-sm px-2 py-1 rounded-lg font-semibold" style={{ background: "var(--accent)", color: "#fff" }}>Save</button>
                <button onClick={() => setNamingPet(false)} className="text-sm px-2 py-1 rounded-lg" style={{ background: "var(--line)", color: "var(--ink)" }}>Cancel</button>
              </>
            ) : (
              <>
                <h1 className="text-2xl font-bold" style={{ fontFamily: "Fraunces, serif" }}>{pet.name}</h1>
                <button
                  onClick={() => { setNamingPet(true); setNameInput(pet.name); }}
                  className="text-xs px-2 py-0.5 rounded-full opacity-50 hover:opacity-100 transition-opacity"
                  style={{ border: "1px solid var(--line)", color: "var(--muted)" }}
                >rename</button>
              </>
            )}
          </div>

          {/* Pet sprite */}
          <div
            className="w-full flex flex-col items-center py-8 rounded-3xl relative overflow-hidden transition-all duration-500"
            style={{
              background: stage === "critical" ? "#fef2f2" : stage === "stuffed" ? "#fff7ed" : "var(--panel)",
              border: `1px solid ${stage === "critical" ? "#fca5a5" : stage === "stuffed" ? "#fdba74" : "var(--line)"}`,
            }}
          >
            <PetSprite
              hunger={pet.hunger}
              happiness={pet.happiness}
              alive={pet.alive}
              deathCause={pet.deathCause}
              exploding={exploding}
            />
          </div>

          {/* Stats */}
          {pet.alive && (
            <div className="w-full flex flex-col gap-3 px-1">
              <StatBar
                label="🍖 Fullness"
                value={pet.hunger}
                max={EXPLODE_THRESHOLD}
                color={hungerBarColor}
                warning={isOverfed}
              />
              <StatBar label="😊 Happiness" value={pet.happiness} color="#a78bfa" />
            </div>
          )}

          {/* Overfed warning banner */}
          {pet.alive && isOverfed && (
            <div
              className="w-full text-center text-sm font-semibold rounded-2xl px-4 py-3 animate-pulse"
              style={{
                background: stage === "critical" ? "#fef2f2" : "#fff7ed",
                border: `1px solid ${stage === "critical" ? "#fca5a5" : "#fdba74"}`,
                color: stage === "critical" ? "var(--error)" : "#f97316",
              }}
            >
              {stage === "critical"
                ? "🚨 ONE MORE FEED AND IT EXPLODES!!"
                : stage === "stuffed"
                ? "😣 Way too full — stop feeding!"
                : "😟 Getting a bit chubby… ease up!"}
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
              <span className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>Each feed costs {FEED_COST} coins</span>
            </div>
            <button
              onClick={feedPet}
              disabled={!pet.alive || pet.coins < FEED_COST}
              className="px-5 py-2.5 rounded-xl font-bold text-sm transition-all disabled:opacity-40 active:scale-95"
              style={{
                background: isOverfed ? "var(--error)" : "var(--success)",
                color: "#fff",
              }}
            >
              {isOverfed ? "⚠️ Feed" : "🍖 Feed"}
            </button>
          </div>

          {/* Hint */}
          {!isOverfed && (
            <div
              className="w-full text-center text-sm rounded-2xl px-4 py-3"
              style={{ background: "var(--panel)", border: "1px solid var(--line)", color: "var(--muted)" }}
            >
              ✅ Complete tasks → earn <strong style={{ color: "var(--warning)" }}>+{COIN_PER_TASK} coins</strong> per task.<br />
              Don't let {pet.name}'s hunger reach 0 — or overfeed them! 💥
            </div>
          )}

          {/* Stats row */}
          <div className="w-full grid grid-cols-2 gap-3">
            <div className="flex flex-col items-center py-3 rounded-2xl" style={{ background: "var(--panel)", border: "1px solid var(--line)" }}>
              <span className="text-xl font-bold">{pet.totalCompleted}</span>
              <span className="text-xs" style={{ color: "var(--muted)" }}>Tasks completed</span>
            </div>
            <div className="flex flex-col items-center py-3 rounded-2xl" style={{ background: "var(--panel)", border: "1px solid var(--line)" }}>
              <span className="text-xl font-bold" style={{ color: pet.alive ? "var(--success)" : "var(--error)" }}>
                {pet.alive ? "Alive 💚" : pet.deathCause === "exploded" ? "Exploded 💥" : "Dead 💀"}
              </span>
              <span className="text-xs" style={{ color: "var(--muted)" }}>Status</span>
            </div>
          </div>

          {/* Restart */}
          {!pet.alive && (
            <button
              onClick={restartPet}
              className="w-full py-3 rounded-2xl font-bold text-sm transition-all active:scale-95"
              style={{ background: "var(--error)", color: "#fff" }}
            >
              {pet.deathCause === "exploded" ? "💥 Adopt a New Pet" : "😢 Start Over — Adopt a New Pet"}
            </button>
          )}
        </div>
      )}
    </Shell>
  );
}
