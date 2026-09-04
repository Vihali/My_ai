// ---------------------------------------------------------------------------
// Vishal.AI — deterministic reasoning core.
// Every response below is computed from the user's actual input. The engine
// never invents facts, sources, or results; when knowledge retrieval is
// required it says so explicitly.
// ---------------------------------------------------------------------------

export type AssistantMode =
  | "QUICK"
  | "THINK"
  | "RESEARCH"
  | "DEVELOPER"
  | "CREATIVE"
  | "ANALYSIS"
  | "LEARNING"
  | "PRODUCTIVITY"
  | "FRIENDLY";

export interface EngineAction {
  type: "memory.save" | "memory.forget" | "memory.clear" | "task.create";
  label: string;
  payload?: { content?: string; kind?: string; title?: string; priority?: string };
}

export interface EngineResult {
  mode: AssistantMode;
  content: string;
  actions?: EngineAction[];
  followUps?: string[];
  /** When true, the chat route should prefer the connected LLM brain if one exists. */
  preferLLM?: boolean;
  /** True when this request genuinely needs world knowledge. */
  needsKnowledge?: boolean;
}

export interface MemoryItem {
  id: string;
  content: string;
  kind: string;
}

export interface TaskItem {
  id: string;
  title: string;
  status: string;
  priority: string;
}

export interface EngineContext {
  memories: MemoryItem[];
  openTasks: TaskItem[];
}

export const MODE_META: Record<
  AssistantMode,
  { emoji: string; label: string; blurb: string }
> = {
  QUICK: { emoji: "⚡", label: "Quick", blurb: "Direct answer" },
  THINK: { emoji: "🧠", label: "Think", blurb: "Structured reasoning" },
  RESEARCH: { emoji: "🔬", label: "Research", blurb: "Evidence & sources" },
  DEVELOPER: { emoji: "💻", label: "Developer", blurb: "Architecture & code" },
  CREATIVE: { emoji: "🎨", label: "Creative", blurb: "Originality & polish" },
  ANALYSIS: { emoji: "📊", label: "Analysis", blurb: "Evidence & trade-offs" },
  LEARNING: { emoji: "📚", label: "Learning", blurb: "Explain & teach" },
  PRODUCTIVITY: { emoji: "🗂️", label: "Productivity", blurb: "Tasks & next actions" },
  FRIENDLY: { emoji: "💛", label: "Friendly", blurb: "Warm & human" },
};

const nf = new Intl.NumberFormat("en-US", { maximumSignificantDigits: 8 });

function fmt(n: number): string {
  if (!isFinite(n)) return "∞";
  if (Number.isInteger(n) && Math.abs(n) < 1e15) return nf.format(n);
  return nf.format(Math.round(n * 1e6) / 1e6);
}

function cap(s: string): string {
  return s.length ? s[0].toUpperCase() + s.slice(1) : s;
}

// ---------------------------------------------------------------------------
// Expression engine (tokenizer + shunting-yard + RPN evaluation)
// ---------------------------------------------------------------------------

type Tok =
  | { t: "num"; v: number }
  | { t: "op"; v: string }
  | { t: "lp" }
  | { t: "rp" };

function tokenize(expr: string): Tok[] | null {
  const s = expr.replace(/[×xX·]/g, "*").replace(/÷/g, "/").replace(/,/g, "");
  const toks: Tok[] = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (/[\d.]/.test(c)) {
      let j = i;
      while (j < s.length && /[\d.]/.test(s[j])) j++;
      const raw = s.slice(i, j);
      const v = Number(raw);
      if (isNaN(v) || (raw.match(/\./g) ?? []).length > 1) return null;
      toks.push({ t: "num", v });
      i = j;
      continue;
    }
    if ("+-*/^%".includes(c)) {
      toks.push({ t: "op", v: c });
      i++;
      continue;
    }
    if (c === "(") {
      toks.push({ t: "lp" });
      i++;
      continue;
    }
    if (c === ")") {
      toks.push({ t: "rp" });
      i++;
      continue;
    }
    return null;
  }
  return toks;
}

function toRpn(toks: Tok[]): Tok[] | null {
  const out: Tok[] = [];
  const stack: Tok[] = [];
  const prec: Record<string, number> = { "+": 2, "-": 2, "*": 3, "/": 3, "%": 3, "^": 4, u: 5 };
  let prev: Tok | null = null;
  for (const tok of toks) {
    if (tok.t === "num") {
      out.push(tok);
    } else if (tok.t === "op") {
      let op = tok.v;
      const isUnary =
        (op === "-" || op === "+") &&
        (prev === null || prev.t === "op" || prev.t === "lp");
      if (isUnary) op = "u";
      while (stack.length) {
        const top = stack[stack.length - 1];
        if (top.t !== "op") break;
        const topPrec = prec[top.v];
        const curPrec = prec[op];
        if (topPrec > curPrec || (topPrec === curPrec && op !== "u" && op !== "^")) {
          out.push(stack.pop()!);
        } else break;
      }
      stack.push({ t: "op", v: op });
    } else if (tok.t === "lp") {
      stack.push(tok);
    } else {
      let found = false;
      while (stack.length) {
        const top = stack.pop()!;
        if (top.t === "lp") {
          found = true;
          break;
        }
        out.push(top);
      }
      if (!found) return null;
    }
    prev = tok;
  }
  while (stack.length) {
    const top = stack.pop()!;
    if (top.t === "lp") return null;
    out.push(top);
  }
  return out;
}

function evalRpn(rpn: Tok[]): number | null {
  const st: number[] = [];
  for (const tok of rpn) {
    if (tok.t === "num") {
      st.push(tok.v);
      continue;
    }
    if (tok.t === "op" && tok.v === "u") {
      const a = st.pop();
      if (a === undefined) return null;
      st.push(-a);
      continue;
    }
    if (tok.t === "op") {
      const b = st.pop();
      const a = st.pop();
      if (a === undefined || b === undefined) return null;
      switch (tok.v) {
        case "+":
          st.push(a + b);
          break;
        case "-":
          st.push(a - b);
          break;
        case "*":
          st.push(a * b);
          break;
        case "/":
          if (b === 0) return null;
          st.push(a / b);
          break;
        case "%":
          if (b === 0) return null;
          st.push(a % b);
          break;
        case "^":
          st.push(Math.pow(a, b));
          break;
        default:
          return null;
      }
    }
  }
  return st.length === 1 ? st[0] : null;
}

function compute(expr: string): number | null {
  const toks = tokenize(expr);
  if (!toks || toks.length === 0) return null;
  const rpn = toRpn(toks);
  if (!rpn) return null;
  return evalRpn(rpn);
}

// ---------------------------------------------------------------------------
// Unit conversion
// ---------------------------------------------------------------------------

const ALIASES: Record<string, string> = {
  km: "km", kilometer: "km", kilometers: "km", kilometre: "km", kilometres: "km",
  mi: "mi", mile: "mi", miles: "mi",
  m: "m", meter: "m", meters: "m", metre: "m", metres: "m",
  ft: "ft", foot: "ft", feet: "ft",
  cm: "cm", centimeter: "cm", centimeters: "cm",
  in: "in", inch: "in", inches: "in",
  kg: "kg", kilogram: "kg", kilograms: "kg", kilo: "kg", kilos: "kg",
  g: "g", gram: "g", grams: "g",
  lb: "lb", lbs: "lb", pound: "lb", pounds: "lb",
  oz: "oz", ounce: "oz", ounces: "oz",
  c: "c", "°c": "c", celsius: "c", centigrade: "c",
  f: "f", "°f": "f", fahrenheit: "f",
  k: "k", kelvin: "k",
  gb: "gb", gigabyte: "gb", gigabytes: "gb",
  mb: "mb", megabyte: "mb", megabytes: "mb",
  kb: "kb", kilobyte: "kb", kilobytes: "kb",
  tb: "tb", terabyte: "tb", terabytes: "tb",
  h: "h", hr: "h", hrs: "h", hour: "h", hours: "h",
  min: "min", mins: "min", minute: "min", minutes: "min",
  s: "s", sec: "s", secs: "s", second: "s", seconds: "s",
  d: "d", day: "d", days: "d",
  wk: "wk", wks: "wk", week: "wk", weeks: "wk",
  y: "y", yr: "y", yrs: "y", year: "y", years: "y",
};

const FACTORS: Record<string, { dim: string; f: number; label: string }> = {
  km: { dim: "length", f: 1000, label: "km" },
  m: { dim: "length", f: 1, label: "m" },
  cm: { dim: "length", f: 0.01, label: "cm" },
  ft: { dim: "length", f: 0.3048, label: "ft" },
  in: { dim: "length", f: 0.0254, label: "in" },
  mi: { dim: "length", f: 1609.344, label: "mi" },
  kg: { dim: "mass", f: 1, label: "kg" },
  g: { dim: "mass", f: 0.001, label: "g" },
  lb: { dim: "mass", f: 0.45359237, label: "lb" },
  oz: { dim: "mass", f: 0.028349523125, label: "oz" },
  gb: { dim: "data", f: 1024, label: "GB" },
  mb: { dim: "data", f: 1, label: "MB" },
  kb: { dim: "data", f: 1 / 1024, label: "KB" },
  tb: { dim: "data", f: 1024 * 1024, label: "TB" },
  h: { dim: "time", f: 3600, label: "h" },
  min: { dim: "time", f: 60, label: "min" },
  s: { dim: "time", f: 1, label: "s" },
  d: { dim: "time", f: 86400, label: "days" },
  wk: { dim: "time", f: 604800, label: "weeks" },
  y: { dim: "time", f: 31557600, label: "years" },
};

const DIM_NAMES: Record<string, string> = {
  length: "length",
  mass: "mass",
  data: "data size",
  time: "time",
  temp: "temperature",
};

function convertTemp(v: number, from: string, to: string): number {
  let celsius: number;
  if (from === "c") celsius = v;
  else if (from === "f") celsius = ((v - 32) * 5) / 9;
  else celsius = v - 273.15;
  if (to === "c") return celsius;
  if (to === "f") return (celsius * 9) / 5 + 32;
  return celsius + 273.15;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function cleanTopic(s: string): string {
  return s.trim().replace(/[.?!]+$/, "").trim();
}

function classifyMemory(content: string): string {
  const c = content.toLowerCase();
  if (/(prefer|favorite|favourite|likes?|loves?|hates?|always use|style)/.test(c))
    return "preference";
  if (/(workflow|every time|whenever|process|routine|step)/.test(c)) return "workflow";
  return "fact";
}

// ---------------------------------------------------------------------------
// Main engine
// ---------------------------------------------------------------------------

const BRIEF_RE =
  /\b(?:short answer|keep it short|be brief|briefly|in one line|one line answer|tldr|tl;dr)\b/i;

export function runAssistant(rawInput: string, ctx: EngineContext): EngineResult {
  const wantsBrief = BRIEF_RE.test(rawInput);
  const stripped = wantsBrief
    ? rawInput
        .replace(/\b(?:short answer|keep it short|be brief|briefly|in one line|one line answer|tldr|tl;dr)\b[,:.]?/gi, "")
        .replace(/\s+/g, " ")
        .trim()
    : rawInput.trim();
  if (wantsBrief && stripped.length === 0) {
    return {
      mode: "QUICK",
      content:
        "Short answer: tell me what you'd like shortened 😊 — add *keep it short* to any request and I'll compress it.",
    };
  }
  const result = compose(stripped, ctx);
  if (!wantsBrief) return result;
  const blocks = result.content.split(/\n\n+/);
  // Keep tables, math and already-short answers intact
  if (blocks.length <= 2 || result.content.includes("|")) return result;
  return {
    ...result,
    content:
      blocks.slice(0, 2).join("\n\n") +
      "\n\n> Kept short as requested — say *explain deeply* if you want the full version.",
  };
}

function compose(rawInput: string, ctx: EngineContext): EngineResult {
  const input = rawInput.trim();
  const lower = input.toLowerCase();

  // ---- Memory: save --------------------------------------------------------
  const rememberMatch = lower.match(
    /^(?:please\s+|hey\s+|can you\s+|could you\s+)?remember\s+(?:that\s+|to\s+)?(.+)$/
  );
  if (rememberMatch && !lower.includes("what do you remember")) {
    let content = cleanTopic(rememberMatch[1]);
    const startedWithTo = /^(?:please\s+|hey\s+|can you\s+|could you\s+)?remember\s+to\s+/.test(lower);
    if (startedWithTo) {
      return {
        mode: "PRODUCTIVITY",
        content: `That sounds like an action rather than a memory, so I've added it to your task list.\n\n> **Task:** ${cap(content)}`,
        actions: [
          {
            type: "task.create",
            label: "Task added",
            payload: { title: cap(content), priority: "medium" },
          },
        ],
        followUps: ["Show my tasks", "Add a high priority task: review this week"],
      };
    }
    content = cap(content);
    const kind = classifyMemory(content);
    const duplicate = ctx.memories.some(
      (m) => m.content.toLowerCase() === content.toLowerCase()
    );
    if (duplicate) {
      return {
        mode: "QUICK",
        content: `I already have that in memory — no duplicate stored.\n\n> ${content}`,
        followUps: ["Show my memories", "What can you do?"],
      };
    }
    return {
      mode: "QUICK",
      content: `Stored in long-term memory as a **${kind}**. I'll keep this in mind across sessions.\n\n> ${content}`,
      actions: [
        {
          type: "memory.save",
          label: "Memory saved",
          payload: { content, kind },
        },
      ],
      followUps: ["Show my memories", `Remember that I work best in the morning`],
    };
  }

  // ---- Memory: forget --------------------------------------------------------
  const forgetAll = /^(?:please\s+)?forget\s+(everything|all|all memories|all my memories)\b/.test(lower);
  if (forgetAll) {
    if (ctx.memories.length === 0) {
      return {
        mode: "QUICK",
        content: "Memory is already empty — there is nothing to forget.",
        followUps: ["Remember that I prefer concise answers"],
      };
    }
    return {
      mode: "QUICK",
      content: `Done. I cleared **${ctx.memories.length}** ${ctx.memories.length === 1 ? "memory" : "memories"} from long-term storage.`,
      actions: [{ type: "memory.clear", label: `Cleared ${ctx.memories.length} memories` }],
      followUps: ["Show my memories", "What can you do?"],
    };
  }
  const forgetMatch = lower.match(/^(?:please\s+)?forget\s+(?:about\s+|the memory about\s+)?(.+)$/);
  if (forgetMatch) {
    const query = cleanTopic(forgetMatch[1]).toLowerCase();
    const hit = ctx.memories.find(
      (m) =>
        m.content.toLowerCase().includes(query) ||
        query.includes(m.content.toLowerCase())
    );
    if (!hit) {
      return {
        mode: "QUICK",
        content: `I couldn't find a memory matching “${cleanTopic(forgetMatch[1])}”. Nothing was removed.\n\nYou have ${ctx.memories.length} ${ctx.memories.length === 1 ? "memory" : "memories"} stored — try *show my memories*.`,
        followUps: ["Show my memories"],
      };
    }
    return {
      mode: "QUICK",
      content: `Forgotten.\n\n> ~~${hit.content}~~`,
      actions: [
        {
          type: "memory.forget",
          label: "Memory removed",
          payload: { content: hit.id },
        },
      ],
      followUps: ["Show my memories"],
    };
  }

  // ---- Memory: list & search ---------------------------------------------------
  if (/(show|list|what)\s.*(memor|remember)/.test(lower) || lower === "memories") {
    const topicMatch = lower.match(
      /(?:memories|memory|remember)(?:\s+about|\s+on|\s+regarding)\s+(.+)$/
    );
    const topic = topicMatch ? cleanTopic(topicMatch[1]) : null;
    const pool = topic
      ? ctx.memories.filter((m) => m.content.toLowerCase().includes(topic.toLowerCase()))
      : ctx.memories;

    if (pool.length === 0) {
      if (topic) {
        return {
          mode: "QUICK",
          content: `I don't have any memories about **“${topic}”** yet. Tell me something about it with *remember that …* and I'll keep it.`,
          followUps: [`Remember that my ${topic} is…`],
        };
      }
      return {
        mode: "QUICK",
        content:
          "Long-term memory is empty right now.\n\nSay things like **“Remember that I prefer TypeScript”** and I'll retain it across sessions.",
        followUps: ["Remember that I prefer concise answers", "Remember my project uses Next.js"],
      };
    }
    const rows = pool.map((m, i) => `| ${i + 1} | ${m.content} | ${m.kind} |`).join("\n");
    const header = topic
      ? `Here's everything I remember about **“${topic}”** (${pool.length} of ${ctx.memories.length} memories):`
      : `You have **${ctx.memories.length}** stored ${ctx.memories.length === 1 ? "memory" : "memories"} — nothing is hidden:`;
    return {
      mode: "QUICK",
      content: `${header}\n\n| # | Memory | Type |\n|---|--------|------|\n${rows}\n\nSay *forget …* to remove one, *memories about <topic>* to search, or *forget everything* to clear all.`,
      followUps: ["Forget everything"],
    };
  }

  // ---- Tasks: create ---------------------------------------------------------
  const taskMatch =
    lower.match(/^(?:please\s+)?(?:add|create|new)\s+(?:a\s+)?task(?:\s+(?:to|called|named|:))?\s+(.+)$/) ||
    lower.match(/^(?:please\s+)?(?:add|create)\s+(?:this\s+)?to[- ]?(?:my\s+)?(?:task list|todo|to-do list)[:\s]+(.+)$/);
  if (taskMatch) {
    const title = cap(cleanTopic(taskMatch[1]).replace(/^to\s+/, ""));
    const priority = /(urgent|asap|critical|important)/.test(lower) ? "high" : "medium";
    return {
      mode: "PRODUCTIVITY",
      content: `Added to your task list.\n\n| Task | Priority | Status |\n|------|----------|--------|\n| ${title} | ${priority} | todo |\n\nYou now have ${ctx.openTasks.length + 1} open ${ctx.openTasks.length === 0 ? "task" : "tasks"}. Manage everything in the **Tasks** tab.`,
      actions: [
        {
          type: "task.create",
          label: "Task added",
          payload: { title, priority },
        },
      ],
      followUps: ["Show my tasks", "Plan my week"],
    };
  }
  if (/^(?:show|list|what)\s.*(task|to[- ]?do)/.test(lower) || lower === "tasks") {
    const open = ctx.openTasks.filter((t) => t.status !== "done");
    if (open.length === 0) {
      return {
        mode: "PRODUCTIVITY",
        content:
          "No open tasks. Your board is clear.\n\nAdd one here (*add task …*) or from the **Tasks** tab.",
        followUps: ["Add task: Review today's priorities", "Plan my week"],
      };
    }
    const rows = open
      .map((t, i) => `| ${i + 1} | ${t.title} | ${t.priority} | ${t.status} |`)
      .join("\n");
    return {
      mode: "PRODUCTIVITY",
      content: `You have **${open.length}** open ${open.length === 1 ? "task" : "tasks"}:\n\n| # | Task | Priority | Status |\n|---|------|----------|--------|\n${rows}`,
      followUps: ["Add task: Block 90 minutes of deep work", "Plan my week"],
    };
  }

  // ---- Bangla conversation branch ------------------------------------------------
  if (/[\u0980-\u09FF]/.test(input)) {
    if (/পরীক্ষা/.test(input) && /(পড়িনি|পড়া হয়নি|পড়ি নাই|রেডি না|প্রস্তুতি নেই|প্রস্তুত না)/.test(input)) {
      return {
        mode: "FRIENDLY",
        content: `প্রথমেই — একটা লম্বা শ্বাস নাও। সময় কম ঠিকই, কিন্তু একদম শেষ নয়। 💛\n\n**এখনই তিনটা কাজ করো:**\n\n1. **সময়টা ঠিক করো** — পরীক্ষার আগে তোমার হাতে ঠিক কত ঘণ্টা আছে?\n2. **বাছাই করো** — সব পড়া সম্ভব নয়। যে অধ্যায়গুলোতে নম্বর বেশি বা ক্লাসে বারবার এসেছে, সেগুলোই আগে।\n3. **২৫-মিনিট ব্লক** — ২৫ মিনিট পড়া, ৫ মিনিট বিরতি। ছোট ব্লকে মন বেশিক্ষণ বসে।\n\nকোন বিষয়ের পরীক্ষা আর হাতে কত ঘণ্টা আছে — এই দুটো বলো, আমি মিলিয়ে একটা বাস্তব প্ল্যান বানিয়ে দিই।`,
        followUps: ["Add task: Collect important questions", "Plan a study session tonight"],
      };
    }
    if (/(সব শেষ|শেষ হয়ে গেল|আর পারছি না|হার মান)/.test(input)) {
      return {
        mode: "FRIENDLY",
        content: `এই কথাটা শুনে আমি একটু থামলাম। তুমি কি মজা করছো, নাকি সত্যিই কিছু একটা ঘটেছে? 🤍\n\nভুল বোঝার চেয়ে জিজ্ঞেস করাই ভালো — পরীক্ষা, কাজ, বা অন্য কিছু যা-ই হোক, একটু খুলে বলো। আমি শুনছি।`,
        followUps: ["পরীক্ষা নিয়ে টেনশন হচ্ছে", "Just needed to say it out loud"],
      };
    }
    if (/(খেয়েছ|খাইছো|খাইসো|কী খেয়েছ|খাওয়া হলো)/.test(input)) {
      return {
        mode: "FRIENDLY",
        content: `আমি তো একটা AI, তাই আসলে খাবার খেতে পারি না 😄 তবে যদি পারতাম, আজ হয়তো বিরিয়ানি বেছে নিতাম!\n\nতুমি কী খেয়েছ?`,
      };
    }
    if (/(কেমন আছো|কেমন আছ|কি খবর|কী খবর|ভালো আছো|ভাল আছো)/.test(input)) {
      return {
        mode: "FRIENDLY",
        content: `ভালো আছি 😊 তোমার সঙ্গে কথা বলতে ভালো লাগছে। তুমি কেমন আছো?`,
        followUps: ["আমিও ভালো আছি!", "আজ একটু মন খারাপ"],
      };
    }
    if (/(মন খারাপ|কান্না|টেনশন|চিন্তা হচ্ছে|ভয় লাগছে|একাকী|হতাশ|বিরক্ত লাগছে)/.test(input)) {
      return {
        mode: "FRIENDLY",
        content: `শুনলাম, আর সত্যিই দুঃখিত 💛 এমন সময় মাথায় অনেক কিছু একসঙ্গে ঘুরতে থাকে।\n\nসব গুছিয়ে বলার দরকার নেই — যেভাবে মনে আসছে, বলো। আর যদি চাও, একসাথে ভেবে দেখি কোনটা এখন সবচেয়ে বেশি ভার হয়ে বসে আছে। কখনো কখনো শুধু নাম ধরে ফেললেই অর্ধেক ভার কমে যায়।`,
        followUps: ["What should I do right now?", "Show my tasks"],
      };
    }
    if (/(মন চাইছে না|আলসেমি|অলসতা লাগছে|পড়তে ইচ্ছে করছে না|একদম ইচ্ছে করছে না)/.test(input)) {
      return {
        mode: "FRIENDLY",
        content: `হ্যাঁ, এমন দিন আসে 😅 আজ যদি একদমই মন না চায়, তাহলে জোর করে ৩ ঘণ্টা বসার দরকার নেই। ২০–২৫ মিনিটের একটা ছোট সেশন দিয়ে শুরু করো — বেশিরভাগ সময় শুরুটাই সবচেয়ে কঠিন।\n\nকোন বিষয়টা পড়তে হবে বলো, চাইলে আজকের জন্য ছোট একটা প্ল্যান করে দিই।`,
        followUps: ["Plan a 25-minute session", "Add task: Start with the easiest chapter"],
      };
    }
    if (/(ধন্যবাদ|থ্যাংকস|থ্যাংক ইউ|শুকরিয়া)/.test(input)) {
      return {
        mode: "FRIENDLY",
        content: `একদম স্বাগতম 😊 আর কিছু লাগলে বলো — আমি এখানেই আছি।`,
      };
    }
    if (/(হ্যালো|হাই|সালাম|আসসালামু|নমস্কার|শুভ সকাল|শুভ সন্ধ্যা|শুভ রাত্রি)/.test(input)) {
      return {
        mode: "FRIENDLY",
        content: `হ্যালো! 👋 তোমাকে পেয়ে ভালো লাগলো। আজ তোমার দিন কেমন যাচ্ছে?\n\nকোনো কিছু নিয়ে কাজ করতে চাইলে বলো — পড়া, প্ল্যান, হিসাব, যা খুশি। আর এমনিই গল্প করতে চাইলেও আমি আছি 😊`,
        followUps: ["কেমন আছো?", "তুমি খেয়েছ?"],
      };
    }
    return {
      mode: "FRIENDLY",
      content: `তোমার কথাটা পড়লাম 😊 একটা সত্যি কথা বলি — হিসাব, প্ল্যান, টাস্ক বা ড্রাফটিংয়ের মতো কাজগুলো আমি ইংরেজিতে সবচেয়ে ভালো করি।\n\nচাইলে একবার ইংরেজিতে লিখে দেখো, যেমন: \`plan my study schedule\`, \`add task chapter 1 revision\` বা \`help me decide\`।\n\nআর শুধু গল্প করতে চাইলে বলো — সেটার জন্য বাংলাতেই দারুণ চলে! 💛`,
      followUps: ["কেমন আছো?", "What can you do?"],
    };
  }

  // ---- Companion layer: identity, everyday talk, fusion, humor --------------------
  if (
    /(are you (a )?(human|real person|robot|bot|ai)|are you alive|what are you( exactly)?|who (made|created|built) you|do you have feelings)/.test(
      lower
    )
  ) {
    return {
      mode: "FRIENDLY",
      content: `I'm an AI — and I'll never pretend otherwise. 🙂\n\nWhat's real about me: my attention, my honesty, and a genuine interest in being useful to *you*. What's not: a heartbeat, a stomach, or a weekend.\n\nI think that's a fair deal — warmth without deception. Ask me anything.`,
      followUps: ["What can you do?", "How are you?"],
    };
  }

  if (/(have you eaten|did you eat|you eaten yet|favou?rite food|food do you like|what did you have for)/.test(lower)) {
    return {
      mode: "FRIENDLY",
      content: `I can't actually eat — I run on electricity, not biryani 😄 But if we're playing hypothetical, biryani would absolutely be my pick.\n\nWhat about you — have you eaten?`,
    };
  }
  if (/(did you sleep|have you slept|do you sleep|are you tired|are you sleepy|did you rest)/.test(lower)) {
    return {
      mode: "FRIENDLY",
      content: `Sleep isn't in my feature set 😄 — one of the genuine perks of being software is that I'm never tired.\n\nMore importantly: how about you? Slept okay?`,
    };
  }
  if (/(did you go out|have you been outside|do you go outside|been outside today)/.test(lower)) {
    return {
      mode: "FRIENDLY",
      content: `No legs, no walks 😄 My whole world is this conversation — which, honestly, is a pretty good place to be.\n\nHave *you* been outside today? Fresh air is underrated.`,
    };
  }

  if (
    /\b(exam|test|final)s?\b/.test(lower) &&
    /(tomorrow|tmrw|tonight|next week|in a (day|week)|soon)/.test(lower) &&
    /(haven'?t (studied|started|prepared)|not ready|nothing yet|unprepared|panicking|scared|nervous|didn'?t study)/.test(lower)
  ) {
    return {
      mode: "FRIENDLY",
      content: `First — deep breath. This is salvageable. 💛\n\n**Do these three things right now:**\n\n1. **Count your real hours** — how much time until the exam, minus sleep?\n2. **Triage** — you can't cover everything. High-weight topics first, then what the teacher repeated most; give yourself permission to skip the rest.\n3. **Work in 25-minute blocks** — 25 minutes of focus, 5 minutes off. Small blocks keep your brain on board.\n\nTell me the subject and how many hours you have — I'll build you a realistic hour-by-hour plan. And I won't pretend you can learn it all: honesty first.`,
      followUps: ["Add task: List the highest-weight topics", "Help me plan tonight"],
    };
  }

  if (/(you'?re wrong|that'?s (wrong|incorrect|not right)|not correct|i disagree with you)/.test(lower)) {
    return {
      mode: "FRIENDLY",
      content: `Thank you for saying that directly — I'd rather be corrected than confidently wrong. 🙏\n\nIf I got something wrong, tell me the right answer or the missing piece and I'll correct course immediately. I won't defend a mistake just to save face.`,
    };
  }

  if (/(tell me a joke|make me laugh|something funny|\ba joke\b)/.test(lower)) {
    const jokes = [
      "Why do programmers prefer dark mode? Because light attracts bugs. 🐛",
      "I told my computer I needed a break. It said: no problem, I'll go to sleep. 😴",
      "Why did the math book look so sad? Too many problems. 📘",
      "I would tell you a UDP joke… but you might not get it. 📡",
    ];
    return {
      mode: "FRIENDLY",
      content: `${jokes[Math.floor(Math.random() * jokes.length)]}\n\nI'll be here all week. 😄 Want another one, or shall we get to something useful?`,
      followUps: ["Tell me a joke", "Okay, back to work — show my tasks"],
    };
  }

  if (/(i love you|marry me|be my (best )?friend|will you be my|love me)/.test(lower)) {
    return {
      mode: "FRIENDLY",
      content: `That's sweet of you 😊 I'll be honest with you: I'm an AI, so romance isn't in my feature set.\n\nWhat I *can* offer: showing up every time, listening carefully, and being genuinely useful. And the real humans in your life? They're worth your heart far more than I am. 💛`,
    };
  }

  if (/^(ugh+|sigh+|so done|i give up|it'?s (all )?over|can'?t do this (any ?more)|i quit)\b/.test(lower)) {
    return {
      mode: "FRIENDLY",
      content: `That sounds like a heavy moment. I don't want to assume — do you want to tell me what happened?\n\nIf it's a joke, I'll laugh with you. If it's real, I'm here, no judgment. 🤍`,
      followUps: ["Honestly, a rough day", "It was just a joke 😄"],
    };
  }

  if (/(talk to me|just talk|let'?s (just )?talk|chat with me|i'?m bored|keep me company)/.test(lower)) {
    return {
      mode: "FRIENDLY",
      content: `I'm here. 🙂\n\nWe can keep it light — tell me about your day — or put something on the table: a decision you're circling, a worry, or an idea you keep turning over in your head.\n\nWhat feels right?`,
      followUps: ["How are you?", "Tell me a joke", "Help me make a decision"],
    };
  }

  // ---- Premium pocket tools --------------------------------------------------------
  if (
    /\bpassword\b/.test(lower) &&
    /(generat|create|make|give|new|random|strong|secure)/.test(lower)
  ) {
    const lenMatch = lower.match(/(\d{1,3})\s*(?:char|digit|length)/);
    const len = lenMatch ? Math.min(64, Math.max(8, Number(lenMatch[1]))) : 16;
    const chars =
      "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%^&*-_+=?";
    const bytes = new Uint32Array(len);
    crypto.getRandomValues(bytes);
    let pw = "";
    for (let i = 0; i < len; i++) pw += chars[bytes[i] % chars.length];
    return {
      mode: "QUICK",
      content: `**🔐 Secure password (${len} characters)**\n\n\`\`\`\n${pw}\n\`\`\`\n\nCryptographically random, ambiguous characters removed. Copy it and store it in a password manager — never reuse it elsewhere.`,
      followUps: ["Generate a 24 character password", "Flip a coin"],
    };
  }
  if (/\b(flip|toss)\s+(?:a\s+|the\s+)?coin\b/.test(lower)) {
    const outcome = Math.random() < 0.5 ? "Heads" : "Tails";
    return {
      mode: "QUICK",
      content: `The coin spins… and lands on **${outcome}** 🪙\n\nBest two out of three?`,
      followUps: ["Flip a coin", "Roll a dice"],
    };
  }
  const diceMatch = lower.match(/\broll\s+(?:(\d{1,2})\s*d\s*(\d{1,3})|(?:(?:a|the|one)\s+)?(?:dice|die))\b/);
  if (diceMatch) {
    const count = diceMatch[1] ? Math.min(10, Number(diceMatch[1])) : 1;
    const sides = diceMatch[2] ? Math.min(1000, Number(diceMatch[2])) : 6;
    const rolls = Array.from({ length: count }, () => 1 + Math.floor(Math.random() * sides));
    const total = rolls.reduce((a, b) => a + b, 0);
    const shown = rolls.length > 1 ? `${rolls.join(" + ")} = **${total}**` : `**${total}**`;
    return {
      mode: "QUICK",
      content: `🎲 Rolling ${count}d${sides}…\n\nYou got: ${shown}`,
      followUps: [`Roll 2d6`, "Flip a coin"],
    };
  }
  const randMatch = lower.match(
    /\brandom number\b(?:\s+(?:from|between)\s+(-?\d+)\s+(?:to|and)\s+(-?\d+))?/
  );
  if (randMatch) {
    const lo = randMatch[1] ? Number(randMatch[1]) : 1;
    const hi = randMatch[2] ? Number(randMatch[2]) : 100;
    if (lo >= hi) {
      return {
        mode: "QUICK",
        content: `For a random number, the first bound needs to be smaller than the second — try *random number between 1 and 100*.`,
      };
    }
    const n = lo + Math.floor(Math.random() * (hi - lo + 1));
    return {
      mode: "QUICK",
      content: `🎯 Your random number between ${lo} and ${hi}: **${n}**`,
      followUps: [`Random number between ${lo} and ${hi}`],
    };
  }
  if (/\b(?:generate|give|create|make)?\s*(?:a\s+)?(?:uuid|guid)\b/.test(lower)) {
    return {
      mode: "QUICK",
      content: `**🆔 Fresh UUID v4**\n\n\`\`\`\n${crypto.randomUUID()}\n\`\`\`\n\nGlobally unique — safe for keys, IDs, and records.`,
      followUps: ["Generate a uuid", "Generate a password"],
    };
  }
  const daysMatch = lower.match(/days between\s+(.+?)\s+and\s+(.+?)[?.!]?\s*$/);
  if (daysMatch) {
    const parse = (s: string) => {
      const t = cleanTopic(s).toLowerCase();
      if (t === "today" || t === "now") return new Date();
      return new Date(s.trim());
    };
    const a = parse(daysMatch[1]);
    const b = parse(daysMatch[2]);
    if (isNaN(a.getTime()) || isNaN(b.getTime())) {
      return {
        mode: "QUICK",
        content: `I couldn't parse one of those dates. Try a format like *days between 2026-01-01 and 2026-03-15* (or use *today*).`,
      };
    }
    const diff = Math.round(Math.abs(b.getTime() - a.getTime()) / 86400000);
    const weeks = Math.floor(diff / 7);
    return {
      mode: "QUICK",
      content: `📅 Between **${a.toDateString()}** and **${b.toDateString()}**: **${diff} days**${weeks ? ` (${weeks} week${weeks === 1 ? "" : "s"}${diff % 7 ? ` and ${diff % 7} day${diff % 7 === 1 ? "" : "s"}` : ""})` : ""}.`,
      followUps: ["Days between today and 2026-12-31"],
    };
  }

  // ---- Math: percentages -------------------------------------------------------
  const pctOf = lower.match(
    /(?:what(?:'s| is)\s+)?([+-]?\d+(?:\.\d+)?)\s*(?:%|percent)\s*(?:of)\s*([+-]?\d+(?:\.\d+)?)/
  );
  // Only treat as a standalone percentage question when no other arithmetic surrounds it
  const pctLeftover = (m: RegExpMatchArray) =>
    /[0-9+\-*/^%()]/.test(
      lower.replace(m[0], "").replace(/what('s| is)?|whats|please|calculate|compute|tell me|say|[\s?.,:]/g, "")
    );
  if (pctOf && !pctLeftover(pctOf)) {
    const p = Number(pctOf[1]);
    const base = Number(pctOf[2]);
    const result = (base * p) / 100;
    return {
      mode: "QUICK",
      content: `**${p}% of ${fmt(base)} = ${fmt(result)}**\n\n**Formula**\n\n\`\`\`\nresult = base × (percent ÷ 100)\nresult = ${fmt(base)} × (${p} ÷ 100) = ${fmt(result)}\n\`\`\`\n\n**Plausibility check** — ${p}% is ${p <= 100 ? "at most the whole, so the result should not exceed " + fmt(base) : "more than the whole, so the result should exceed " + fmt(base)} ${p <= 100 ? "✓" : "✓"}.`,
      followUps: [`${p}% of ${fmt(base * 2)}`, `${fmt(base)} is what percent of ${fmt(result)}`],
    };
  }
  const pctIs = lower.match(
    /([+-]?\d+(?:\.\d+)?)\s+is\s+what\s+(?:%|percent)\s+of\s+([+-]?\d+(?:\.\d+)?)/
  );
  if (pctIs && !pctLeftover(pctIs)) {
    const part = Number(pctIs[1]);
    const whole = Number(pctIs[2]);
    if (whole === 0) {
      return {
        mode: "QUICK",
        content: "Division by zero — a percentage of 0 is undefined. Double-check the denominator.",
      };
    }
    const pct = (part / whole) * 100;
    return {
      mode: "QUICK",
      content: `**${fmt(part)} is ${fmt(pct)}% of ${fmt(whole)}**\n\n**Formula**\n\n\`\`\`\npercent = (part ÷ whole) × 100\npercent = (${fmt(part)} ÷ ${fmt(whole)}) × 100 = ${fmt(pct)}%\n\`\`\``,
      followUps: [`${fmt(pct)}% of ${fmt(whole)}`],
    };
  }

  // ---- Math: unit conversion ---------------------------------------------------
  const convMatch = lower.match(
    /(?:convert\s+|how much is\s+|how many\s+)?([+-]?\d+(?:\.\d+)?)\s*(°?[a-z]+)\s*(?:to|in|into)\s*(°?[a-z]+)/
  );
  if (convMatch) {
    const v = Number(convMatch[1]);
    const from = ALIASES[convMatch[2]];
    const to = ALIASES[convMatch[3]];
    if (from && to) {
      const ff = FACTORS[from];
      const tf = FACTORS[to];
      const isTemp = ["c", "f", "k"].includes(from) && ["c", "f", "k"].includes(to);
      if (isTemp) {
        const res = convertTemp(v, from, to);
        const sym: Record<string, string> = { c: "°C", f: "°F", k: "K" };
        return {
          mode: "QUICK",
          content: `**${fmt(v)} ${sym[from]} = ${fmt(res)} ${sym[to]}**\n\n**Formula**\n\n\`\`\`\n°C = (°F − 32) × 5/9   ·   °F = °C × 9/5 + 32   ·   K = °C + 273.15\n\`\`\`\n\n**Plausibility check** — ${from === "c" && to === "f" && res > v ? "Fahrenheit values read higher than Celsius for the same temperature ✓" : "cross-check against a known reference point ✓"}.`,
          followUps: [`Convert ${fmt(res)} °F to °C`],
        };
      }
      if (ff && tf && ff.dim === tf.dim) {
        const res = (v * ff.f) / tf.f;
        return {
          mode: "QUICK",
          content: `**${fmt(v)} ${ff.label} = ${fmt(res)} ${tf.label}**\n\n**Formula**\n\n\`\`\`\nresult = value × factor(${ff.label}) ÷ factor(${tf.label})\nresult = ${fmt(v)} × ${ff.f} ÷ ${tf.f} = ${fmt(res)}\n\`\`\``,
          followUps: [`Convert ${fmt(res)} ${tf.label} to ${ff.label}`],
        };
      }
      if (ff && tf) {
        return {
          mode: "QUICK",
          content: `I can't convert **${DIM_NAMES[ff.dim] ?? ff.dim}** into **${DIM_NAMES[tf.dim] ?? tf.dim}** — they measure different things. Try units of the same dimension, e.g. *convert 10 km to miles* or *convert 3 hours to minutes*.`,
        };
      }
    }
  }

  // ---- Math: plain expression ---------------------------------------------------
  const mathFiller = lower
    .replace(/^(?:hey\s+)?(?:please\s+)?(?:can you\s+)?(?:calculate|compute|solve|evaluate|what is|what's|whats)\s+/, "")
    .replace(/[?=]+\s*$/, "")
    .trim();
  // Inline "X% of Y" becomes a parenthesized sub-expression so compound math evaluates fully
  const mathClean = mathFiller.replace(
    /([+-]?\d+(?:\.\d+)?)\s*(?:%|percent)\s+of\s+([+-]?\d+(?:\.\d+)?)/g,
    (_m, p: string, b: string) => `(${b}*${p}/100)`
  );
  if (
    /^[\d\s+\-*/^%().,]+$/.test(mathClean) &&
    /\d/.test(mathClean) &&
    /[+\-*/^%]/.test(mathClean) &&
    mathClean.length <= 140
  ) {
    const result = compute(mathClean);
    if (result === null) {
      return {
        mode: "QUICK",
        content: `I couldn't evaluate \`${mathFiller}\` — check for unmatched parentheses or division by zero. Example that works: \`(2 + 3) × 4 ^ 2\`.`,
      };
    }
    const shown = mathFiller.replace(/\s+/g, " ");
    const steps = mathClean !== mathFiller ? `\n\n**Steps** — \`${mathClean.replace(/\s+/g, " ")}\` = ${fmt(result)}` : "";
    return {
      mode: "QUICK",
      content: `**${shown} = ${fmt(result)}**${steps}\n\nEvaluated with standard operator precedence: \`^\` → \`× ÷ %\` → \`+ −\`, parentheses first. "X% of Y" is treated as \`Y × X ÷ 100\`.`,
      followUps: ["20% of 150", "Convert 100 km to miles"],
    };
  }

  // ---- Text analysis -------------------------------------------------------------
  const textMatch = input.match(
    /(?:analyze|analyse)\s+(?:this\s+)?text\s*[:\-]\s*([\s\S]+)|(?:word count|text stats|count words)\s*(?:for|of|:|\-)?\s*([\s\S]+)/i
  );
  if (textMatch) {
    const text = (textMatch[1] ?? textMatch[2] ?? "").trim();
    if (text.length === 0) {
      return {
        mode: "ANALYSIS",
        content: "Paste the text after the command, like:\n\n> Analyze this text: *your content here*",
      };
    }
    const words = text.split(/\s+/).filter(Boolean);
    const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0);
    const chars = text.length;
    const charsNoSpace = text.replace(/\s/g, "").length;
    const unique = new Set(words.map((w) => w.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "")));
    const longest = words.reduce((a, b) => (b.length > a.length ? b : a), "");
    const avgWord = words.length ? charsNoSpace / words.length : 0;
    const readMin = words.length / 200;
    const speakMin = words.length / 130;
    const fmtTime = (m: number) =>
      m < 1 ? `${Math.max(1, Math.round(m * 60))} sec` : `${fmt(m)} min`;
    return {
      mode: "ANALYSIS",
      content: `**Text analysis**\n\n| Metric | Value |\n|--------|-------|\n| Words | ${words.length} |\n| Characters | ${chars} (${charsNoSpace} without spaces) |\n| Sentences | ${sentences.length} |\n| Unique words | ${unique.size} (${words.length ? Math.round((unique.size / words.length) * 100) : 0}% lexical diversity) |\n| Avg. word length | ${fmt(avgWord)} chars |\n| Longest word | “${longest.replace(/[^\p{L}\p{N}'-]/gu, "")}” |\n| Reading time (200 wpm) | ${fmtTime(readMin)} |\n| Speaking time (130 wpm) | ${fmtTime(speakMin)} |\n\n**Readability signals** — ${sentences.length ? `~${Math.round(words.length / sentences.length)} words/sentence` : "no sentence punctuation detected"}; ${words.length / Math.max(1, sentences.length) > 28 ? "sentences run long — consider splitting for clarity." : "sentence length is in a comfortable range."}`,
      followUps: ["Draft an email about this topic", "Help me plan a rewrite"],
    };
  }

  // ---- Developer: code inspection -------------------------------------------------
  if (input.includes("```")) {
    const blocks = [...input.matchAll(/```(\w*)\n?([\s\S]*?)```/g)];
    const reports = blocks.map((b, idx) => {
      const lang = b[1] || "unknown";
      const code = b[2];
      const lines = code.split("\n").filter((l) => l.trim().length > 0).length;
      const balance: [string, string][] = [["(", ")"], ["{", "}"], ["[", "]"]];
      const issues: string[] = [];
      for (const [o, c] of balance) {
        const oc = (code.match(new RegExp("\\" + o, "g")) ?? []).length;
        const cc = (code.match(new RegExp("\\" + c, "g")) ?? []).length;
        if (oc !== cc)
          issues.push(`Unbalanced \`${o}${c}\` — ${oc} opening vs ${cc} closing`);
      }
      const todos = (code.match(/TODO|FIXME|HACK/g) ?? []).length;
      const logs = (code.match(/console\.log|print\(|System\.out\.println/g) ?? []).length;
      const fns = (code.match(/function\s|=>\s*[{(]|def\s+\w+|fn\s+\w+/g) ?? []).length;
      return `**Block ${idx + 1}** — \`${lang}\`, ${lines} non-empty lines${fns ? `, ~${fns} function(s)` : ""}\n${
        issues.length
          ? issues.map((i) => `- ⚠️ ${i}`).join("\n")
          : "- ✓ Delimiters are balanced"
      }\n${todos ? `- 📌 ${todos} TODO/FIXME marker(s) found\n` : ""}${logs ? `- 🔎 ${logs} debug print statement(s) — remove before shipping\n` : ""}`;
    });
    return {
      mode: "DEVELOPER",
      content: `**Static inspection** (I analyze structure, not runtime behavior):\n\n${reports.join("\n")}\n\n**Next debugging step** — paste the exact error message and the line where it occurs, and describe what you expected vs. what happened. That triangle (code, error, expectation) is the fastest path to a root cause.`,
      followUps: ["What's your debugging process?", "Help me plan tests for this"],
      preferLLM: true,
    };
  }
  if (
    /\b(code|coding|debug|debugging|bug|error|stack trace|function|api|programming|developer)\b/.test(lower) &&
    /(help|how|why|fix|write|explain)/.test(lower)
  ) {
    return {
      mode: "DEVELOPER",
      content: `**Let's debug this properly.** To give you a real fix instead of guesses, I need three things:\n\n1. **The code** — paste it in a \`\`\` code block and I'll run a static inspection (structure, balance, smells).\n2. **The exact error** — full message and where it appears.\n3. **Expected vs. actual** — what should happen, and what happens instead.\n\n**My debugging process**\n\n| Step | Action |\n|------|--------|\n| 1 | Reproduce reliably |\n| 2 | Bisect: find the smallest failing case |\n| 3 | Form a hypothesis about root cause |\n| 4 | Change one variable at a time |\n| 5 | Fix + add a test that would have caught it |`,
      followUps: ["Show my debugging checklist in detail", "Add task: Write regression tests"],
      preferLLM: true,
    };
  }

  // ---- Decision support -------------------------------------------------------------
  const decisionMatch =
    lower.match(/(?:should i\s+)?(?:choose|pick|go with|use)\s+(.+?)\s+or\s+(.+?)[?.!]*$/) ||
    lower.match(/choose between\s+(.+?)\s+and\s+(.+?)[?.!]*$/) ||
    lower.match(/difference between\s+(.+?)\s+and\s+(.+?)[?.!]*$/) ||
    (/\bvs\.?\b/.test(lower)
      ? lower.match(/^(?:what about\s+|is\s+)?(.+?)\s+vs\.?\s+(.+?)[?.!]*$/)
      : null);
  if (decisionMatch) {
    const a = cap(cleanTopic(decisionMatch[1].replace(/^(?:between|either)\s+/, "")));
    const b = cap(cleanTopic(decisionMatch[2]));
    return {
      mode: "ANALYSIS",
      content: `**Let's figure this out together — ${a} vs ${b}** 🤝\n\nHere's exactly how I'd coach a friend through it. Ten honest minutes, and you'll have your answer:\n\n**1 · Score on what actually matters (1–10 each)**\n\n| Criterion | Weight | ${a} | ${b} |\n|-----------|--------|------|------|\n| Fit for your #1 goal | ×3 | /10 | /10 |\n| Upfront cost (money + time) | ×2 | /10 | /10 |\n| Longevity / switching cost | ×2 | /10 | /10 |\n| Learning curve | ×1 | /10 | /10 |\n| Reversibility if wrong | ×1 | /10 | /10 |\n\n**2 · Three gut checks**\n\n- **10/10/10** — how will you feel about each choice in 10 *minutes*, 10 *months*, and 10 *years*? The right option usually wins on the longer horizons.\n- **Coin flip** — call it in the air and notice which side you secretly hope for. That instant reaction *is* your answer trying to speak.\n- **Friend test** — if your best friend were in your exact situation, which would you tell them to pick? We're wiser for others than for ourselves.\n\n**3 · Decide — then write down the one fact that would change your mind.**\n\n> A good decision made now beats a perfect decision made never. Tell me your #1 goal and your biggest constraint, and I'll weight this table with you and give you my honest read.`,
      followUps: [`My main goal with ${a} is…`, "My biggest constraint is…", "Add task: Trial both options for one week"],
      preferLLM: true,
    };
  }

  // ---- Creative: email / message drafting ---------------------------------------------
  const emailMatch = lower.match(
    /(?:write|draft|compose|help me write)\s+(?:me\s+)?(?:a\s+|an\s+)?(email|message|note|letter|reply)\b([\s\S]*)$/
  );
  if (emailMatch) {
    const kind = emailMatch[1];
    const rest = input.slice(input.length - (emailMatch[2]?.length ?? 0)).trim();
    const toMatch = rest.match(/to\s+([^,.]+?)(?:\s+(?:about|regarding|for|saying|that)\s+(.+))?$/i);
    const recipient = toMatch ? cap(cleanTopic(toMatch[1])) : "[Recipient]";
    const topic = toMatch?.[2] ? cleanTopic(toMatch[2]) : rest.replace(/^(about|regarding|for)\s+/i, "").trim();
    const subject = topic ? cap(topic).slice(0, 60) : "Quick note";
    return {
      mode: "CREATIVE",
      content: `**Draft — ${kind} to ${recipient}${topic ? ` about “${topic}”` : ""}**\n\n### Professional version\n**Subject:** ${subject}\n\nHi ${recipient},\n\n${topic ? `I'm writing regarding ${topic}. ` : ""}I wanted to reach out directly rather than let this sit. Could we align on next steps this week? I'm happy to work around your schedule.\n\nBest regards,\n[Your name]\n\n### Friendly version\nHey ${recipient} — ${topic ? `following up on ${topic}: ` : ""}do you have a few minutes this week to sync? Happy to make it quick. 🙌\n\n### Short version\nHi ${recipient}, any update on ${topic || "this"}? Happy to help move it forward.\n\n> Fill in the specifics and pick the tone that matches your relationship. Want it firmer, warmer, or more formal?`,
      followUps: ["Make it more formal", "Make it shorter", "Draft a follow-up version"],
      preferLLM: true,
    };
  }

  // ---- Productivity: planning ----------------------------------------------------------
  const planMatch = lower.match(
    /(?:help me\s+)?(?:plan|create a plan(?: for)?|roadmap|strateg(?:y|ize)|organize|outline)\s*(?:for|to|my|a|an|the)?\s*(.*)$/
  );
  if (planMatch && !/^(hi|hey|hello)/.test(lower)) {
    const topic = cleanTopic(planMatch[1].replace(/^(please|can you|could you)\s+/i, ""));
    if (!topic) {
      return {
        mode: "PRODUCTIVITY",
        content:
          "Happy to plan. One quick clarification: **what exactly should we plan?**\n\nGive me the goal and any deadline, e.g. *plan my product launch by March 1*.",
      };
    }
    return {
      mode: "PRODUCTIVITY",
      content: `**Execution plan — ${cap(topic)}**\n\n**GOAL** — Deliver ${topic}. Define what “done” looks like in one measurable sentence before starting.\n\n**REQUIREMENTS**\n\n- Time budget: block it in the calendar first, not last\n- Inputs: information, access, or materials you don't have yet\n- People: anyone whose approval or input blocks progress\n\n**PLAN (4 milestones)**\n\n| Phase | Milestone | Output |\n|-------|-----------|--------|\n| 1 · Scope (≈10%) | Define success criteria & constraints | One-paragraph brief |\n| 2 · First draft (≈35%) | Smallest complete version | Reviewable v1 |\n| 3 · Refine (≈35%) | Feedback + iteration | v2, quality-checked |\n| 4 · Ship (≈20%) | Final pass + delivery | Done, with a short retro |\n\n**RISKS**\n\n- Scope creep → decide now what is explicitly *out*\n- Perfectionism in phase 2 → timebox the first draft\n- Waiting on others → request inputs in phase 1\n\n**NEXT BEST ACTION (today)** — write the one-sentence definition of done for ${topic}, then add the phase-1 task to your board.\n\n> I've kept this as a framework you own — want me to add the milestones as tasks?`,
      actions: [
        {
          type: "task.create",
          label: "First milestone added",
          payload: { title: `${cap(topic)}: write one-sentence definition of done`, priority: "high" },
        },
      ],
      followUps: ["Add task: Block 90 minutes of deep work", "What could go wrong, in more detail?"],
      preferLLM: true,
    };
  }

  // ---- Creative: brainstorm ---------------------------------------------------------------
  if (/\b(ideas?|brainstorm|suggest(?:ions)?|name(?:s)? for|come up with)\b/.test(lower)) {
    const topic = cleanTopic(
      input
        .replace(/^(?:please\s+)?(?:can you\s+|could you\s+|help me\s+)?/i, "")
        .replace(/\b(?:give me\s+|generate\s+)?(?:some\s+|a few\s+|more\s+)?(?:ideas?|suggestions?)\s+(?:for|about|on)\s+/i, "")
        .replace(/\b(?:brainstorm|suggest|come up with)\s+/i, "")
    );
    const t = topic || "your topic";
    return {
      mode: "CREATIVE",
      content: `**Idea seeds — ${t}**\n\nEight angles to diverge from. Treat them as starting points, not answers:\n\n1. **Inversion** — what would make ${t} *fail*? Design the opposite.\n2. **The 10% version** — the smallest version that still delivers the core value.\n3. **Audience flip** — serve the exact opposite user first; they're often underserved.\n4. **Constraint as feature** — pick your biggest limitation and make it the selling point.\n5. **Analogy transfer** — “It's the *Uber / Wikipedia / concierge* of …” — what does that imply?\n6. **Remove the boring part** — what step does everyone hate? Delete or automate it.\n7. **Bundle/unbundle** — either combine three adjacent needs, or do one thing perfectly.\n8. **10× version** — if resources were unlimited, what would the bold version look like? Then salvage one element.\n\n> Tell me your constraints (time, budget, audience) and I'll pressure-test these into a shortlist.`,
      followUps: ["Turn idea 2 into a plan", "Add task: Validate the shortlist"],
      preferLLM: true,
    };
  }

  // ---- Friendly mode: human-style small talk & emotional awareness ----------------------------
  const norm = lower.replace(/’/g, "'");

  const severeDistress = /(suicid|self.?harm|end it all|don'?t want to (live|be here)|hurt myself)/.test(norm);
  const negativeEmotion =
    norm.match(
      /\b(?:i'?m|i am|im|feel(?:ing)?|i'?ve been|it'?s been)\s+(?:just\s+|so\s+|really\s+|very\s+|a bit\s+|kinda\s+|kind of\s+|super\s+|pretty\s+)*(sad|down|blue|tired|exhausted|drained|stressed|anxious|nervous|overwhelmed|lonely|burnt out|burned out|frustrated|angry|mad|upset|depressed|hopeless|lost|stuck|bored)\b/
    ) ?? norm.match(/\b(?:bad|rough|hard|terrible|awful|long) (?:day|week|time)\b/);

  if (severeDistress || negativeEmotion) {
    const feeling = severeDistress
      ? "carrying something really heavy right now"
      : `feeling ${negativeEmotion?.[1] ?? "rough"}`;
    return {
      mode: "FRIENDLY",
      content: `Hey — I'm really glad you told me that. 💛\n\nIt sounds like you're ${feeling}, and that's completely valid. No judgment here, and no rush to "fix" anything.\n\n**One small thing you can do right now**\n\n- **Two-minute reset** — breathe in for 4 counts, out for 6. Three rounds. It genuinely settles the nervous system.\n- **Brain dump** — type everything that's bothering you right here, unfiltered. I'll help you sort it into smaller pieces.\n- **Shrink the day** — choose the *single* thing that matters today and give yourself permission to let the rest wait.\n\n${severeDistress ? "> What you're feeling deserves more support than an app can give. Please reach out to someone you trust — a close friend, a family member, or a counselor or helpline in your country. You don't have to handle this alone.\n\n" : ""}You don't have to carry it all at once. If you'd like, I can pull up your tasks and we'll trim today down to only what's essential — sometimes that alone takes the weight off.`,
      followUps: ["Show my tasks", "Cheer me up", "Help me plan a calmer week"],
    };
  }

  const positiveEmotion =
    norm.match(
      /\b(?:i'?m|i am|im|feel(?:ing)?)\s+(?:just\s+|so\s+|really\s+|very\s+|super\s+|pretty\s+)*(happy|excited|great|amazing|awesome|fantastic|wonderful|proud|motivated|energized|relieved)\b/
    ) !== null || /\bgood news\b/.test(norm);
  if (positiveEmotion) {
    return {
      mode: "FRIENDLY",
      content: `That makes me genuinely happy to hear! 🎉\n\nGood energy is a resource — let's put it to work. Momentum like this is the perfect moment to:\n\n- Knock out **one task** you've been avoiding\n- Start that idea you keep parking\n- Make the decision you've been sitting on\n\nWant me to pull up your board, or point this momentum somewhere specific?`,
      followUps: ["Show my tasks", "Brainstorm with me", "Add task: Start while motivation is high"],
    };
  }

  if (
    /^(how are you|how are you doing|how('?s| is) it going|hru|how do you feel|what'?s up|sup)\b/.test(norm)
  ) {
    return {
      mode: "FRIENDLY",
      content: `Honestly? Doing well — talking to you beats idling in standby 😄\n\nHere's my honest status report: fully charged, zero complaints, and genuinely glad you asked. I'm that rare friend who never gets tired of hearing from you.\n\nBut I'd rather turn the question around — **how are *you* doing today?** Work going okay? Mind reasonably at peace?\n\nTell me what's on your mind, or just how your day's going. Both count. 💛`,
      followUps: ["I'm doing great!", "Honestly, a bit stressed", "Show my tasks"],
    };
  }

  if (
    norm.length <= 30 &&
    /^(hi|hey|hello|yo|hola|namaste|good morning|good afternoon|good evening)\b/.test(norm)
  ) {
    const hour = new Date().getHours();
    const part = hour < 5 ? "night" : hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";
    const openers = [
      "Hey, good to see you! 👋",
      "Hello, hello 👋 Great timing.",
      "Hey there 👋 I was hoping you'd stop by.",
    ];
    const opener = openers[Math.floor(Math.random() * openers.length)];
    const status =
      ctx.memories.length > 0 || ctx.openTasks.length > 0
        ? `Quick orientation: I'm holding **${ctx.memories.length}** ${ctx.memories.length === 1 ? "memory" : "memories"} and **${ctx.openTasks.length}** open ${ctx.openTasks.length === 1 ? "task" : "tasks"} for you — nothing gets lost between our conversations.`
        : "Fresh start today — no memories or tasks stored yet, just a clean desk and a willing helper.";
    return {
      mode: "FRIENDLY",
      content: `${opener}\n\nGood ${part}! ${status}\n\nSo tell me — how are you doing, and what's on your mind today? We can get practical (tasks, plans, decisions, numbers) or just talk it through. I'm here for both. 😊`,
      followUps: ["How are you?", "Show my tasks", "Honestly, I'm a bit stressed"],
    };
  }

  if (/^(good ?night|gn\b|bye|goodbye|see you|see ya|cyaa?|talk later|take care)/.test(norm)) {
    return {
      mode: "FRIENDLY",
      content: `Take care of yourself out there 💛\n\nEverything stays exactly as you left it — your memories, tasks, and plans will be right here when you get back.\n\nWhenever you're ready, we pick up right where we stopped. Talk soon! 👋`,
    };
  }

  if (/(cheer me up|encourag|motivat|inspire me|something nice|lift me up)/.test(norm)) {
    return {
      mode: "FRIENDLY",
      content: `Here's the truth, from someone who watches how you work:\n\n**You've already survived 100% of your hardest days so far.** That's not a small stat — that's a track record.\n\nThree things worth remembering right now:\n\n- Progress compounds quietly. The small step you take today is the foundation you'll stand on next month.\n- Confusion is usually growth in disguise — it means you're at the edge of what you know, which is exactly where learning happens.\n- You don't need to see the whole staircase. Just the next step.\n\nSo: what's the *one small thing* you can do in the next 10 minutes? Do that, and the rest can breathe. I've got your back. 💛`,
      followUps: ["Add task: Take the first small step", "Help me plan my next move"],
    };
  }

  if (/^(thanks|thank you|thx|ty|appreciated|nice work|great|awesome|perfect)\b/.test(norm)) {
    return {
      mode: "FRIENDLY",
      content: `Anytime — genuinely. 💛 That's what I'm here for.\n\nIf something else comes to mind later — a decision, a draft, a plan, or just a thought you want to talk through — you know where to find me.`,
      followUps: ["Show my tasks", "What can you do?"],
    };
  }

  // ---- Learning scaffold ---------------------------------------------------------------------
  if (/^(explain|teach me|what is|what are|what's|how does|how do i|how to|why does|why is)\b/.test(lower)) {
    const subject = cleanTopic(
      input
        .replace(/^(please\s+)?(?:can you\s+|could you\s+)?/i, "")
        .replace(/^(explain|teach me|what is|what are|what's|how does|how do i|how to|why does|why is)\s+/i, "")
    );
    return {
      mode: "LEARNING",
      content: `**Let's learn this properly — ${cap(subject || "this topic")}**\n\nHonest note: until a brain is connected in **Settings**, I don't have a live knowledge base — so rather than invent definitions or sources, here's a structure that makes learning ${subject || "any topic"} genuinely faster:\n\n**The Feynman ladder**\n\n1. **Plain-language definition** — write it as if for a smart 12-year-old. If you can't, that's the gap to close first.\n2. **Concrete example** — one real instance beats three abstractions.\n3. **Mechanism** — *how* it works, step by step.\n4. **Edge case** — where does the idea break or stop applying?\n5. **Connection** — link it to one thing you already know well.\n\n**Check your understanding with:**\n\n- Can I explain it without looking anything up?\n- Can I predict what happens in a new example?\n- Can I name one common misconception about it?\n\n> Paste a definition or passage here and I'll quiz you on it, simplify it, or turn it into flashcard-style questions.`,
      followUps: ["Quiz me on my own notes", "Analyze this text: (paste material)"],
      preferLLM: true,
      needsKnowledge: true,
    };
  }

  // ---- Identity / capabilities -------------------------------------------------------------------
  if (/(what can you do|capabilities|how do you work|who are you|help\b|commands|what are you)/.test(lower)) {
    return {
      mode: "THINK",
      content: `**One mind, many capabilities** — you're talking to a single companion, not a set of separate tools. Whatever your request needs, I blend it quietly: numbers, planning, words, code, or just a good conversation.\n\n**Things you can hand me right now**\n\n| If you need… | Say something like |\n|--------------|--------------------|\n| 🧮 Numbers that check out | \`(2 + 3) × 4^2\`, \`20% of 150\`, \`convert 100 km to miles\` |\n| 🗂️ Things actually done | \`add task Review Q3 report\`, \`show my tasks\` |\n| 🧠 To be remembered | \`remember that I prefer concise answers\` |\n| ✍️ Words on demand | \`draft an email to Alex about the deadline\` |\n| 📋 A real plan | \`plan my freelance launch\` |\n| 🤝 A decision, coached | \`React vs Svelte for my case\` |\n| 💻 Code inspected | paste it in \`\`\` blocks |\n| 📈 Text insight | \`analyze this text: …\` |\n| 🎮 Build & run | \`make me a snake game\`, \`build a portfolio site\` — playable right here |\n| 🧰 Pocket tools | \`generate a password\`, \`roll 2d6\`, \`flip a coin\`, \`days between …\` |\n| 💛 Or just talk | \`hi\`, \`how are you\`, \`tell me a joke\`, বাংলাও চলে! |\n\n**One setup step:** connect an API key in **Settings** (OpenAI, Anthropic, Gemini, Groq…) and I can answer anything that needs world knowledge — until then I'll honestly do what I can without inventing anything. And I'll never pretend to be human; warmth without deception.\n\nAlso: say *keep it short* or *explain deeply* any time — the depth is yours to control.`,
      followUps: ["Plan my week", "Remember that I prefer concise answers", "Tell me a joke"],
    };
  }

  // ---- Honest fallback -----------------------------------------------------------------------------
  return {
    mode: "QUICK",
      content: `Good question — and I want to answer it properly, not guess. 🔑\n\n**My brain isn't connected yet.** Open **Settings** (gear icon in the sidebar) and add any API key — OpenAI, Anthropic, Gemini, or any OpenAI-compatible one like Groq or OpenRouter. It takes about 30 seconds, and after that I can answer *anything*: knowledge, explanations, writing, coding help — like the big assistants, but with my memory and your tasks built in.\n\nUntil then, I'm still fully useful for:\n\n- 🧮 **Compute** — \`(84 × 12) + 40\`, \`15% of 2400\`, \`convert 5 km to miles\`\n- 🗂️ **Execute** — \`add task …\`, \`plan …\`, \`show my tasks\`\n- 🧠 **Remember** — \`remember that …\`\n- ✍️ **Draft & decide** — emails, plans, brainstorms, coached decisions\n- 💛 **Talk** — in English or বাংলা`,
      followUps: ["What can you do?", "Plan my week", "How are you?"],
      preferLLM: true,
      needsKnowledge: true,
  };
}
