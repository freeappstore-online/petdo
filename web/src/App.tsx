import { useState, useEffect, useCallback } from "react";
import { Shell } from "./components/Shell";

// ── Types ──────────────────────────────────────────────────────────────────
interface Task {
  id: string;
  text: string;
  completed: boolean;
  createdAt: number;
  coins: number; // 1–20, set by user
}

interface PetDefinition {
  id: string;
  name: string;
  emoji: string;
  bodyColor: (stage: HungerStage, alive: boolean) => string;
  cost: number;
  description: string;
}

interface PetState {
  petTypeId: string;
  nickname: string;
  coins: number;
  hunger: number;
  happiness: number;
  alive: boolean;
  deathCause: "starved" | "exploded" | null;
  lastTick: number;
  totalCompleted: number;
  unlockedPetIds: string[];
}

type View = "tasks" | "pet" | "shop";
type HungerStage = "starving" | "hungry" | "content" | "full" | "overfed" | "stuffed" | "critical";

// ── Constants ──────────────────────────────────────────────────────────────
const STORAGE_TASKS = "petodo_tasks";
const STORAGE_PET   = "petodo_pet";
const DEFAULT_TASK_COINS = 5;
const MIN_TASK_COINS     = 1;
const MAX_TASK_COINS     = 20;
const HUNGER_TICK_MS   = 5_000;
const HUNGER_DECAY_MS  = 60_000 * 2;  // decay every 2 min for urgency
const FEED_COST        = 10;
const FEED_HUNGER      = 20;
const OVERFED_THRESHOLD  = 110;
const STUFFED_THRESHOLD  = 125;
const EXPLODE_THRESHOLD  = 145;
const PET_UNLOCK_COST    = 100;

// ── Pet catalogue ──────────────────────────────────────────────────────────
const PET_CATALOGUE: PetDefinition[] = [
  {
    id: "cat", name: "Cat", emoji: "🐱", cost: 0,
    description: "Your classic starter companion.",
    bodyColor: (stage, alive) =>
      !alive ? "#9ca3af" : stage === "critical" ? "#ef4444" : stage === "stuffed" ? "#f97316" :
      stage === "overfed" ? "#eab308" : stage === "hungry" ? "#fbbf24" : stage === "starving" ? "#f87171" : "#86efac",
  },
  {
    id: "dog", name: "Dog", emoji: "🐶", cost: PET_UNLOCK_COST,
    description: "Loyal and energetic. Costs 100 coins.",
    bodyColor: (stage, alive) =>
      !alive ? "#9ca3af" : stage === "critical" ? "#ef4444" : stage === "stuffed" ? "#f97316" :
      stage === "overfed" ? "#eab308" : stage === "hungry" ? "#fbbf24" : stage === "starving" ? "#f87171" : "#93c5fd",
  },
  {
    id: "bunny", name: "Bunny", emoji: "🐰", cost: PET_UNLOCK_COST,
    description: "Fluffy and fast. Costs 100 coins.",
    bodyColor: (stage, alive) =>
      !alive ? "#9ca3af" : stage === "critical" ? "#ef4444" : stage === "stuffed" ? "#f97316" :
      stage === "overfed" ? "#eab308" : stage === "hungry" ? "#fbbf24" : stage === "starving" ? "#f87171" : "#f9a8d4",
  },
  {
    id: "frog", name: "Frog", emoji: "🐸", cost: PET_UNLOCK_COST,
    description: "Chill and green. Costs 100 coins.",
    bodyColor: (stage, alive) =>
      !alive ? "#9ca3af" : stage === "critical" ? "#ef4444" : stage === "stuffed" ? "#f97316" :
      stage === "overfed" ? "#eab308" : stage === "hungry" ? "#fbbf24" : stage === "starving" ? "#f87171" : "#4ade80",
  },
  {
    id: "bear", name: "Bear", emoji: "🐻", cost: PET_UNLOCK_COST,
    description: "Big and cuddly. Costs 100 coins.",
    bodyColor: (stage, alive) =>
      !alive ? "#9ca3af" : stage === "critical" ? "#ef4444" : stage === "stuffed" ? "#f97316" :
      stage === "overfed" ? "#eab308" : stage === "hungry" ? "#fbbf24" : stage === "starving" ? "#f87171" : "#d97706",
  },
  {
    id: "alien", name: "Alien", emoji: "👾", cost: PET_UNLOCK_COST,
    description: "Out of this world. Costs 100 coins.",
    bodyColor: (stage, alive) =>
      !alive ? "#9ca3af" : stage === "critical" ? "#ef4444" : stage === "stuffed" ? "#f97316" :
      stage === "overfed" ? "#eab308" : stage === "hungry" ? "#fbbf24" : stage === "starving" ? "#f87171" : "#a78bfa",
  },
];

const DEFAULT_PET: PetState = {
  petTypeId: "cat",
  nickname: "Biscuit",
  coins: 0,
  hunger: 50,
  happiness: 80,
  alive: true,
  deathCause: null,
  lastTick: Date.now(),
  totalCompleted: 0,
  unlockedPetIds: ["cat"],
};

// ── Helpers ────────────────────────────────────────────────────────────────
function getHungerStage(hunger: number): HungerStage {
  if (hunger <= 0)                return "starving";
  if (hunger < 30)                return "hungry";
  if (hunger < OVERFED_THRESHOLD) return hunger < 70 ? "content" : "full";
  if (hunger < STUFFED_THRESHOLD) return "overfed";
  if (hunger < EXPLODE_THRESHOLD) return "stuffed";
  return "critical";
}

function decayAmount(totalTasks: number): number {
  if (totalTasks <= 0) return 12;
  const raw = 8 / Math.sqrt(totalTasks);
  return Math.min(12, Math.max(1, raw));
}

function coinColor(coins: number): string {
  if (coins >= 15) return "#ef4444";   // hard — red
  if (coins >= 10) return "#f97316";   // medium-hard — orange
  if (coins >= 6)  return "#eab308";   // medium — yellow
  return "#22c55e";                    // easy — green
}

function coinLabel(coins: number): string {
  if (coins >= 15) return "Hard";
  if (coins >= 10) return "Medium";
  if (coins >= 6)  return "Easy+";
  return "Easy";
}

// ── Pet Sprite ─────────────────────────────────────────────────────────────
function PetSprite({
  petDef, hunger, alive, deathCause, exploding,
}: {
  petDef: PetDefinition; hunger: number; happiness: number;
  alive: boolean; deathCause: "starved" | "exploded" | null; exploding: boolean;
}) {
  const stage = getHungerStage(hunger);
  const dead  = !alive;
  const sizeScale =
    stage === "overfed"  ? 1.15 :
    stage === "stuffed"  ? 1.30 :
    stage === "critical" ? 1.45 : 1;
  const bodyW = Math.round(120 * sizeScale);
  const bodyH = Math.round(110 * sizeScale);
  const bodyColor = petDef.bodyColor(stage, alive);

  const eyeLeft =
    dead && deathCause === "exploded" ? "💥" : dead ? "✕" :
    stage === "critical" ? "😵" : stage === "stuffed" ? "😣" : stage === "overfed" ? "😟" :
    stage === "full" || stage === "content" ? "●" : stage === "hungry" ? ">" : "×";

  const eyeRight =
    dead && deathCause === "exploded" ? "" : dead ? "✕" :
    stage === "critical" || stage === "stuffed" || stage === "overfed" ? "" :
    stage === "full" || stage === "content" ? "●" : stage === "hungry" ? "<" : "×";

  const mouth =
    dead && deathCause === "exploded" ? "💀" : dead ? "——" :
    stage === "critical" ? "≋" : stage === "stuffed" ? "o" : stage === "overfed" ? "⌒" :
    stage === "full" || stage === "content" ? "‿" : stage === "hungry" ? "︵" : "___";

  const statusLabel =
    dead && deathCause === "exploded" ? "💥 Your pet exploded!" : dead ? "💀 Your pet starved…" :
    stage === "critical" ? "🚨 About to explode!!" : stage === "stuffed" ? "😣 Way too full…" :
    stage === "overfed" ? "😟 Getting too full" :
    stage === "full" || stage === "content" ? "😊 Happy & healthy!" :
    stage === "hungry" ? "😟 Feeling hungry…" : "😰 Starving!";

  const statusColor =
    dead || stage === "critical" ? "var(--error)" :
    stage === "stuffed" ? "#f97316" : stage === "overfed" ? "var(--warning)" :
    stage === "hungry" || stage === "starving" ? "var(--warning)" : "var(--success)";

  const wiggle = !dead && (stage === "content" || stage === "full") ? "animate-bounce" : "";
  const shakeClass = stage === "critical" || exploding ? "animate-pulse" : "";

  const earStyle = petDef.id === "bunny"
    ? { width: Math.round(14 * sizeScale), height: Math.round(40 * sizeScale) }
    : petDef.id === "bear"
    ? { width: Math.round(26 * sizeScale), height: Math.round(22 * sizeScale) }
    : { width: Math.round(20 * sizeScale), height: Math.round(28 * sizeScale) };

  return (
    <div className={`flex flex-col items-center select-none transition-all duration-500 ${shakeClass}`}>
      {exploding && <div className="text-8xl animate-ping absolute">💥</div>}

      {!exploding && (
        <div className="flex mb-[-8px]" style={{ gap: `${Math.round(32 * sizeScale)}px` }}>
          <div className={`rounded-full ${wiggle}`} style={{ ...earStyle, background: bodyColor, transform: "rotate(-15deg)" }} />
          <div className={`rounded-full ${wiggle}`} style={{ ...earStyle, background: bodyColor, transform: "rotate(15deg)", animationDelay: "0.15s" }} />
        </div>
      )}

      {!exploding && (
        <div className="relative flex flex-col items-center justify-center rounded-full shadow-lg transition-all duration-500"
          style={{ width: bodyW, height: bodyH, background: bodyColor }}>
          <div className="absolute top-2 right-3 text-base opacity-60">{petDef.emoji}</div>
          <div className="flex items-center" style={{ gap: Math.round(28 * sizeScale), marginTop: -8 }}>
            <span style={{ fontSize: stage === "critical" || stage === "stuffed" ? 22 : 20, lineHeight: 1 }}>{eyeLeft}</span>
            {eyeRight && <span style={{ fontSize: 20, lineHeight: 1 }}>{eyeRight}</span>}
          </div>
          <div className="absolute" style={{ bottom: Math.round(26 * sizeScale), fontSize: stage === "stuffed" || stage === "critical" ? 22 : 18, left: "50%", transform: "translateX(-50%)" }}>
            {mouth}
          </div>
          {(stage === "overfed" || stage === "stuffed" || stage === "critical") && (
            <div className="absolute text-sm" style={{ top: 8, right: 8, fontSize: 16 }}>💧</div>
          )}
          {!dead && (stage === "content" || stage === "full") && (
            <>
              <div className="absolute rounded-full opacity-30" style={{ width: 22, height: 12, background: "#f43f5e", bottom: 34, left: 12 }} />
              <div className="absolute rounded-full opacity-30" style={{ width: 22, height: 12, background: "#f43f5e", bottom: 34, right: 12 }} />
            </>
          )}
          {(stage === "stuffed" || stage === "critical") && (
            <div className="absolute bottom-4 flex gap-1">
              <div style={{ width: 20, height: 2, borderRadius: 2, background: "rgba(0,0,0,0.15)" }} />
              <div style={{ width: 20, height: 2, borderRadius: 2, background: "rgba(0,0,0,0.15)" }} />
            </div>
          )}
        </div>
      )}

      {!exploding && (
        <div className="rounded-b-3xl rounded-t-xl flex items-end justify-center gap-3 pb-2 transition-all duration-500"
          style={{ width: Math.round(100 * sizeScale), height: Math.round(70 * sizeScale), background: bodyColor, marginTop: -4 }}>
          <div className="rounded-full" style={{ width: Math.round(28 * sizeScale), height: Math.round(20 * sizeScale), background: bodyColor, filter: "brightness(0.85)" }} />
          <div className="rounded-full" style={{ width: Math.round(28 * sizeScale), height: Math.round(20 * sizeScale), background: bodyColor, filter: "brightness(0.85)" }} />
        </div>
      )}

      {!exploding && (
        <div className="flex justify-between px-1 pointer-events-none"
          style={{ marginTop: Math.round(-44 * sizeScale), width: Math.round(140 * sizeScale) }}>
          <div className="rounded-full" style={{ width: Math.round(20 * sizeScale), height: Math.round(40 * sizeScale), background: bodyColor, transform: "rotate(20deg)", transformOrigin: "top center" }} />
          <div className="rounded-full" style={{ width: Math.round(20 * sizeScale), height: Math.round(40 * sizeScale), background: bodyColor, transform: "rotate(-20deg)", transformOrigin: "top center" }} />
        </div>
      )}

      {!dead && (stage === "stuffed" || stage === "critical") && (
        <div className="mt-4">
          <div className="text-xs font-bold animate-pulse" style={{ color: "var(--error)" }}>⚠️ STOP FEEDING! ⚠️</div>
        </div>
      )}

      <div className="mt-5 text-sm font-semibold text-center" style={{ color: statusColor }}>{statusLabel}</div>
    </div>
  );
}

// ── Stat bar ───────────────────────────────────────────────────────────────
function StatBar({ label, value, max = 100, color, warning }: {
  label: string; value: number; max?: number; color: string; warning?: boolean;
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
        <div className={`h-full rounded-full transition-all duration-500 ${warning ? "animate-pulse" : ""}`}
          style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

// ── Coin Stepper ───────────────────────────────────────────────────────────
function CoinStepper({ value, onChange, disabled }: {
  value: number; onChange: (v: number) => void; disabled?: boolean;
}) {
  return (
    <div className="flex items-center gap-1 shrink-0">
      <button
        onClick={() => onChange(Math.max(MIN_TASK_COINS, value - 1))}
        disabled={disabled || value <= MIN_TASK_COINS}
        className="w-6 h-6 rounded-full flex items-center justify-center text-sm font-bold transition-all disabled:opacity-30 active:scale-90"
        style={{ background: "var(--line)", color: "var(--ink)" }}
        aria-label="Decrease coins"
      >−</button>

      <div className="flex items-center gap-0.5 min-w-[52px] justify-center px-2 py-0.5 rounded-full text-xs font-bold"
        style={{ background: coinColor(value) + "22", color: coinColor(value), border: `1px solid ${coinColor(value)}44` }}>
        🪙{value}
      </div>

      <button
        onClick={() => onChange(Math.min(MAX_TASK_COINS, value + 1))}
        disabled={disabled || value >= MAX_TASK_COINS}
        className="w-6 h-6 rounded-full flex items-center justify-center text-sm font-bold transition-all disabled:opacity-30 active:scale-90"
        style={{ background: "var(--line)", color: "var(--ink)" }}
        aria-label="Increase coins"
      >+</button>
    </div>
  );
}

// ── Task row ───────────────────────────────────────────────────────────────
function TaskRow({ task, onToggle, onDelete, onCoinChange }: {
  task: Task;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onCoinChange: (id: string, coins: number) => void;
}) {
  return (
    <div className="flex items-center gap-2 px-3 py-3 rounded-2xl transition-colors"
      style={{ background: "var(--panel)", border: "1px solid var(--line)" }}>

      {/* Tick circle */}
      <button
        onClick={() => onToggle(task.id)}
        aria-label={task.completed ? "Mark incomplete" : "Mark complete"}
        className="shrink-0 flex items-center justify-center rounded-full border-2 transition-all duration-200 focus:outline-none"
        style={{
          width: 26, height: 26,
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
      <span className="flex-1 text-sm leading-snug transition-all duration-200 min-w-0 truncate"
        style={{ color: task.completed ? "var(--muted)" : "var(--ink)", textDecoration: task.completed ? "line-through" : "none" }}>
        {task.text}
      </span>

      {/* Coin stepper */}
      <CoinStepper
        value={task.coins}
        onChange={(v) => onCoinChange(task.id, v)}
        disabled={task.completed}
      />

      {/* Delete */}
      <button onClick={() => onDelete(task.id)} aria-label="Delete task"
        className="shrink-0 opacity-30 hover:opacity-80 transition-opacity text-lg leading-none ml-1"
        style={{ color: "var(--muted)" }}>×</button>
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
      if (saved) {
        const parsed = JSON.parse(saved);
        if (!parsed.unlockedPetIds) parsed.unlockedPetIds = ["cat"];
        return { ...DEFAULT_PET, ...parsed };
      }
      return DEFAULT_PET;
    } catch { return DEFAULT_PET; }
  });
  const [newText, setNewText]     = useState("");
  const [newCoins, setNewCoins]   = useState(DEFAULT_TASK_COINS);
  const [namingPet, setNamingPet] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [coinAnim, setCoinAnim]   = useState(false);
  const [exploding, setExploding] = useState(false);
  const [shopMsg, setShopMsg]     = useState<string | null>(null);

  const petDef = PET_CATALOGUE.find((p) => p.id === pet.petTypeId) ?? PET_CATALOGUE[0];

  useEffect(() => { localStorage.setItem(STORAGE_TASKS, JSON.stringify(tasks)); }, [tasks]);
  useEffect(() => { localStorage.setItem(STORAGE_PET,   JSON.stringify(pet));   }, [pet]);

  // Hunger decay
  useEffect(() => {
    const interval = setInterval(() => {
      setPet((prev) => {
        if (!prev.alive) return prev;
        const now   = Date.now();
        const ticks = Math.floor((now - prev.lastTick) / HUNGER_DECAY_MS);
        if (ticks <= 0) return prev;
        const totalTasks   = tasks.length;
        const decay        = decayAmount(totalTasks) * ticks;
        const newHunger    = Math.max(0, prev.hunger - decay);
        const newHappiness = Math.max(0, prev.happiness - ticks * 2);
        const alive        = newHunger > 0;
        return { ...prev, hunger: newHunger, happiness: newHappiness, alive, deathCause: alive ? prev.deathCause : "starved", lastTick: now };
      });
    }, HUNGER_TICK_MS);
    return () => clearInterval(interval);
  }, [tasks]);

  // Explosion check
  useEffect(() => {
    if (pet.alive && pet.hunger >= EXPLODE_THRESHOLD && !exploding) {
      setExploding(true);
      setTimeout(() => {
        setPet((prev) => ({ ...prev, alive: false, deathCause: "exploded" }));
        setExploding(false);
      }, 1200);
    }
  }, [pet.hunger, pet.alive, exploding]);

  const addTask = useCallback(() => {
    const text = newText.trim();
    if (!text) return;
    setTasks((prev) => [{ id: crypto.randomUUID(), text, completed: false, createdAt: Date.now(), coins: newCoins }, ...prev]);
    setNewText("");
    setNewCoins(DEFAULT_TASK_COINS);
  }, [newText, newCoins]);

  const toggleTask = useCallback((id: string) => {
    setTasks((prev) =>
      prev.map((t) => {
        if (t.id !== id) return t;
        const completing = !t.completed;
        if (completing && pet.alive) {
          setPet((p) => ({ ...p, coins: p.coins + t.coins, happiness: Math.min(100, p.happiness + 5), totalCompleted: p.totalCompleted + 1 }));
          setCoinAnim(true);
          setTimeout(() => setCoinAnim(false), 800);
        } else if (!completing && pet.alive) {
          setPet((p) => ({ ...p, coins: Math.max(0, p.coins - t.coins) }));
        }
        return { ...t, completed: completing };
      })
    );
  }, [pet.alive]);

  const deleteTask = useCallback((id: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const updateTaskCoins = useCallback((id: string, coins: number) => {
    setTasks((prev) => prev.map((t) => t.id === id ? { ...t, coins } : t));
  }, []);

  const feedPet = useCallback(() => {
    setPet((prev) => {
      if (!prev.alive || prev.coins < FEED_COST) return prev;
      return { ...prev, coins: prev.coins - FEED_COST, hunger: prev.hunger + FEED_HUNGER, happiness: Math.min(100, prev.happiness + 5) };
    });
  }, []);

  const restartPet = useCallback(() => {
    setPet((prev) => ({ ...DEFAULT_PET, nickname: prev.nickname, petTypeId: prev.petTypeId, unlockedPetIds: prev.unlockedPetIds, lastTick: Date.now() }));
    setTasks([]);
  }, []);

  const renamePet = useCallback(() => {
    const name = nameInput.trim();
    if (!name) return;
    setPet((prev) => ({ ...prev, nickname: name }));
    setNamingPet(false);
    setNameInput("");
  }, [nameInput]);

  const selectPet = useCallback((def: PetDefinition) => {
    setPet((prev) => {
      const owned = prev.unlockedPetIds.includes(def.id);
      if (!owned) {
        if (prev.coins < def.cost) {
          setShopMsg(`You need ${def.cost} coins to unlock ${def.name}!`);
          setTimeout(() => setShopMsg(null), 2500);
          return prev;
        }
        setShopMsg(`🎉 ${def.name} unlocked! Switching…`);
        setTimeout(() => setShopMsg(null), 2500);
        return { ...prev, coins: prev.coins - def.cost, petTypeId: def.id, unlockedPetIds: [...prev.unlockedPetIds, def.id] };
      }
      setShopMsg(`Switched to ${def.name}!`);
      setTimeout(() => setShopMsg(null), 1500);
      return { ...prev, petTypeId: def.id };
    });
  }, []);

  const incompleteTasks = tasks.filter((t) => !t.completed);
  const completedTasks  = tasks.filter((t) => t.completed);
  const stage = getHungerStage(pet.hunger);
  const isOverfed = stage === "overfed" || stage === "stuffed" || stage === "critical";
  const hungerBarColor =
    stage === "critical" ? "#ef4444" : stage === "stuffed" ? "#f97316" :
    stage === "overfed"  ? "#eab308" : "var(--success)";

  const decayRate  = decayAmount(tasks.length);
  const speedLabel =
    tasks.length === 0 ? "⚡ Extremely fast" :
    tasks.length === 1 ? "🔥 Very fast" :
    tasks.length <= 3  ? "💨 Fast" :
    tasks.length <= 7  ? "🐢 Moderate" : "🐌 Slow";

  const navItems = [
    { id: "tasks", label: "Tasks",    icon: "✅" },
    { id: "pet",   label: "My Pet",   icon: "🐾" },
    { id: "shop",  label: "Pet Shop", icon: "🏪" },
  ];

  return (
    <Shell navItems={navItems} activeView={view} onNavigate={(v) => setView(v as View)}>

      {/* ── TASKS VIEW ── */}
      {view === "tasks" && (
        <div className="max-w-xl mx-auto flex flex-col gap-5">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold" style={{ fontFamily: "Fraunces, serif" }}>To-Do</h1>
              <p className="text-sm mt-0.5" style={{ color: "var(--muted)" }}>
                Complete tasks → earn coins → feed {pet.nickname}!
              </p>
            </div>
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full font-bold text-sm transition-transform ${coinAnim ? "scale-125" : "scale-100"}`}
              style={{ background: "var(--panel)", border: "1px solid var(--line)", color: "var(--warning)" }}>
              🪙 {pet.coins}
            </div>
          </div>

          {/* Decay speed */}
          <div className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-medium"
            style={{ background: "var(--panel)", border: "1px solid var(--line)", color: "var(--muted)" }}>
            <span>Hunger drain:</span>
            <span className="font-bold" style={{ color: decayRate > 6 ? "var(--error)" : decayRate > 3 ? "var(--warning)" : "var(--success)" }}>
              {speedLabel}
            </span>
            <span className="ml-auto opacity-60">({tasks.length} task{tasks.length !== 1 ? "s" : ""})</span>
          </div>

          {/* Add task row */}
          <div className="flex flex-col gap-2 px-4 py-3 rounded-2xl"
            style={{ background: "var(--panel)", border: "1px solid var(--line)" }}>
            <input
              className="w-full bg-transparent text-sm outline-none placeholder:text-[var(--muted)]"
              style={{ color: "var(--ink)" }}
              placeholder="Add a new task…"
              value={newText}
              onChange={(e) => setNewText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addTask()}
            />
            <div className="flex items-center justify-between gap-3">
              {/* Coin picker for new task */}
              <div className="flex items-center gap-2">
                <span className="text-xs" style={{ color: "var(--muted)" }}>Reward:</span>
                <CoinStepper value={newCoins} onChange={setNewCoins} />
                <span className="text-xs font-semibold" style={{ color: coinColor(newCoins) }}>
                  {coinLabel(newCoins)}
                </span>
              </div>
              <button onClick={addTask} disabled={!newText.trim()}
                className="px-4 py-1.5 rounded-xl text-sm font-semibold transition-opacity disabled:opacity-40"
                style={{ background: "var(--accent)", color: "#fff" }}>
                Add
              </button>
            </div>
          </div>

          {/* Task list */}
          {tasks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 rounded-2xl"
              style={{ border: "1.5px dashed var(--line)" }}>
              <span className="text-4xl">📝</span>
              <p className="text-sm" style={{ color: "var(--muted)" }}>No tasks yet — add one above!</p>
              <p className="text-xs font-semibold animate-pulse" style={{ color: "var(--error)" }}>
                ⚠️ No tasks = hunger drains super fast!
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {incompleteTasks.map((t) => (
                <TaskRow key={t.id} task={t} onToggle={toggleTask} onDelete={deleteTask} onCoinChange={updateTaskCoins} />
              ))}
              {completedTasks.length > 0 && (
                <>
                  <p className="text-xs font-semibold mt-2 px-1" style={{ color: "var(--muted)" }}>
                    COMPLETED · {completedTasks.length}
                  </p>
                  {completedTasks.map((t) => (
                    <TaskRow key={t.id} task={t} onToggle={toggleTask} onDelete={deleteTask} onCoinChange={updateTaskCoins} />
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
          <div className="flex items-center gap-2">
            {namingPet ? (
              <>
                <input autoFocus
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
                <h1 className="text-2xl font-bold" style={{ fontFamily: "Fraunces, serif" }}>
                  {pet.nickname} {petDef.emoji}
                </h1>
                <button onClick={() => { setNamingPet(true); setNameInput(pet.nickname); }}
                  className="text-xs px-2 py-0.5 rounded-full opacity-50 hover:opacity-100 transition-opacity"
                  style={{ border: "1px solid var(--line)", color: "var(--muted)" }}>rename</button>
              </>
            )}
          </div>

          <div className="w-full flex flex-col items-center py-8 rounded-3xl relative overflow-hidden transition-all duration-500"
            style={{
              background: stage === "critical" ? "#fef2f2" : stage === "stuffed" ? "#fff7ed" : "var(--panel)",
              border: `1px solid ${stage === "critical" ? "#fca5a5" : stage === "stuffed" ? "#fdba74" : "var(--line)"}`,
            }}>
            <PetSprite petDef={petDef} hunger={pet.hunger} happiness={pet.happiness}
              alive={pet.alive} deathCause={pet.deathCause} exploding={exploding} />
          </div>

          {pet.alive && (
            <div className="w-full flex flex-col gap-3 px-1">
              <StatBar label="🍖 Fullness" value={pet.hunger} max={EXPLODE_THRESHOLD} color={hungerBarColor} warning={isOverfed} />
              <StatBar label="😊 Happiness" value={pet.happiness} color="#a78bfa" />
            </div>
          )}

          {pet.alive && (
            <div className="w-full text-xs rounded-xl px-4 py-2 flex items-center justify-between"
              style={{ background: "var(--panel)", border: "1px solid var(--line)", color: "var(--muted)" }}>
              <span>Hunger drain speed</span>
              <span className="font-bold" style={{ color: decayRate > 6 ? "var(--error)" : decayRate > 3 ? "var(--warning)" : "var(--success)" }}>
                {speedLabel}
              </span>
            </div>
          )}

          {pet.alive && isOverfed && (
            <div className="w-full text-center text-sm font-semibold rounded-2xl px-4 py-3 animate-pulse"
              style={{
                background: stage === "critical" ? "#fef2f2" : "#fff7ed",
                border: `1px solid ${stage === "critical" ? "#fca5a5" : "#fdba74"}`,
                color: stage === "critical" ? "var(--error)" : "#f97316",
              }}>
              {stage === "critical" ? "🚨 ONE MORE FEED AND IT EXPLODES!!" :
               stage === "stuffed"  ? "😣 Way too full — stop feeding!" :
                                      "😟 Getting a bit chubby… ease up!"}
            </div>
          )}

          <div className="w-full flex items-center justify-between px-5 py-4 rounded-2xl"
            style={{ background: "var(--panel)", border: "1px solid var(--line)" }}>
            <div className="flex flex-col">
              <span className="text-xs font-semibold" style={{ color: "var(--muted)" }}>YOUR COINS</span>
              <span className="text-2xl font-bold" style={{ color: "var(--warning)" }}>🪙 {pet.coins}</span>
              <span className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>Each feed costs {FEED_COST} coins</span>
            </div>
            <button onClick={feedPet} disabled={!pet.alive || pet.coins < FEED_COST}
              className="px-5 py-2.5 rounded-xl font-bold text-sm transition-all disabled:opacity-40 active:scale-95"
              style={{ background: isOverfed ? "var(--error)" : "var(--success)", color: "#fff" }}>
              {isOverfed ? "⚠️ Feed" : "🍖 Feed"}
            </button>
          </div>

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

          {!pet.alive && (
            <button onClick={restartPet}
              className="w-full py-3 rounded-2xl font-bold text-sm transition-all active:scale-95"
              style={{ background: "var(--error)", color: "#fff" }}>
              {pet.deathCause === "exploded" ? "💥 Adopt a New Pet" : "😢 Start Over — Adopt a New Pet"}
            </button>
          )}
        </div>
      )}

      {/* ── SHOP VIEW ── */}
      {view === "shop" && (
        <div className="max-w-xl mx-auto flex flex-col gap-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold" style={{ fontFamily: "Fraunces, serif" }}>Pet Shop 🏪</h1>
              <p className="text-sm mt-0.5" style={{ color: "var(--muted)" }}>
                Unlock new pets for {PET_UNLOCK_COST} coins each.
              </p>
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full font-bold text-sm"
              style={{ background: "var(--panel)", border: "1px solid var(--line)", color: "var(--warning)" }}>
              🪙 {pet.coins}
            </div>
          </div>

          {shopMsg && (
            <div className="text-center text-sm font-semibold px-4 py-3 rounded-2xl animate-pulse"
              style={{ background: "var(--panel)", border: "1px solid var(--accent)", color: "var(--accent)" }}>
              {shopMsg}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            {PET_CATALOGUE.map((def) => {
              const owned     = pet.unlockedPetIds.includes(def.id);
              const active    = pet.petTypeId === def.id;
              const canAfford = pet.coins >= def.cost;
              return (
                <button key={def.id} onClick={() => selectPet(def)}
                  className="flex flex-col items-center gap-2 py-5 px-3 rounded-2xl transition-all active:scale-95"
                  style={{
                    background: active ? "var(--accent)" : "var(--panel)",
                    border: `2px solid ${active ? "var(--accent)" : owned ? "var(--success)" : "var(--line)"}`,
                    opacity: !owned && !canAfford ? 0.55 : 1,
                    cursor: "pointer",
                  }}>
                  <span className="text-5xl">{def.emoji}</span>
                  <span className="font-bold text-sm" style={{ color: active ? "#fff" : "var(--ink)" }}>{def.name}</span>
                  <span className="text-xs text-center" style={{ color: active ? "rgba(255,255,255,0.8)" : "var(--muted)" }}>{def.description}</span>
                  <div className="mt-1 px-3 py-1 rounded-full text-xs font-bold"
                    style={{
                      background: active ? "rgba(255,255,255,0.2)" : owned ? "rgba(22,163,74,0.12)" : canAfford ? "rgba(37,99,235,0.1)" : "var(--line)",
                      color: active ? "#fff" : owned ? "var(--success)" : canAfford ? "var(--accent)" : "var(--muted)",
                    }}>
                    {active ? "✓ Active" : owned ? "✓ Owned" : `🪙 ${def.cost}`}
                  </div>
                </button>
              );
            })}
          </div>

          <p className="text-xs text-center" style={{ color: "var(--muted)" }}>
            Complete tasks to earn coins. Harder tasks earn more coins!
          </p>
        </div>
      )}
    </Shell>
  );
}
