// Refresh button: starts the "Update index data" GitHub Actions workflow and loads the new data once it is live.
// The page is public and static, so it holds no secret. Each device stores its own fine-grained GitHub token
// (only "Actions: write" on this one repo) in localStorage; without a token the button opens the setup sheet.
import { setStatus, toast, openSheet, closeSheet } from "../kit/kit.js";

const REPO = "MariusRapp/IndexDashboard";
const WORKFLOW = "update-data.yml";
const TOKEN_KEY = "index:gh-token";
const POLL_MS = 15000;
const GIVE_UP_MS = 10 * 60 * 1000; // run (~1 min) + Pages deploy (~1 min) + queue; usually done in 2–3 min

let busy = false;

const getToken = () => { try { return localStorage.getItem(TOKEN_KEY) || ""; } catch { return ""; } };
const setToken = (t) => { try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch { /* private mode */ } };

async function dispatch(token) {
  const res = await fetch(`https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW}/dispatches`, {
    method: "POST",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
    },
    body: JSON.stringify({ ref: "main" }),
  });
  if (res.status === 204) return;
  const err = new Error(`GitHub answered ${res.status}`);
  err.status = res.status;
  throw err;
}

// Polls the data file (query string bypasses the Pages CDN cache) until updated_at moves past `since`.
async function waitForNewData(dataUrl, since) {
  const sinceMs = since ? new Date(since).getTime() : 0;
  const end = Date.now() + GIVE_UP_MS;
  while (Date.now() < end) {
    await new Promise((r) => setTimeout(r, POLL_MS));
    try {
      const res = await fetch(`${dataUrl}?t=${Date.now()}`, { cache: "no-store" });
      if (!res.ok) continue;
      const data = await res.json();
      if (new Date(data.updated_at).getTime() > sinceMs) return data;
    } catch { /* offline for a moment: keep trying */ }
  }
  return null;
}

/**
 * @param {object} o
 * @param {string} o.dataUrl            path of the data file
 * @param {() => string|undefined} o.currentStamp  updated_at of the data on screen
 * @param {(data: object) => void} o.onData        render fresh data
 * @param {() => void} o.onDone         restore the normal status (fresh / stale)
 */
export function initRefresh({ dataUrl, currentStamp, onData, onDone }) {
  const btn = document.getElementById("refresh-btn");
  const sheet = document.getElementById("token-sheet");
  const input = document.getElementById("token-input");
  const error = document.getElementById("token-error");
  const removeBtn = document.getElementById("token-remove");

  const openSetup = (msg = "") => {
    input.value = "";
    input.removeAttribute("aria-invalid");
    error.textContent = msg;
    error.hidden = !msg;
    removeBtn.hidden = !getToken();
    openSheet(sheet);
    setTimeout(() => input.focus(), 50);
  };

  async function run() {
    if (busy) return;
    const token = getToken();
    if (!token) return openSetup();
    busy = true;
    btn.classList.add("busy");
    btn.disabled = true;
    const since = currentStamp();
    try {
      await dispatch(token);
      setStatus("wait", "Refreshing …");
      toast("Refresh started", "New data usually arrives in 2–3 minutes. You can keep using the page.");
      const data = await waitForNewData(dataUrl, since);
      if (data) {
        onData(data);
        toast("Data updated", "");
      } else {
        toast("Still running", "GitHub is slow right now. The page shows the new data on the next load.");
      }
    } catch (err) {
      if (err.status === 401 || err.status === 403 || err.status === 404) {
        openSetup("The saved token was rejected (expired, revoked or missing the Actions permission). Please add a new one.");
      } else {
        toast("Refresh failed", err.message);
      }
    } finally {
      busy = false;
      btn.classList.remove("busy");
      btn.disabled = false;
      onDone();
    }
  }

  btn.addEventListener("click", run);

  document.getElementById("token-form").addEventListener("submit", (ev) => {
    ev.preventDefault();
    const t = input.value.trim();
    if (!/^(github_pat_|ghp_)[A-Za-z0-9_]{20,}$/.test(t)) {
      input.setAttribute("aria-invalid", "true");
      error.textContent = "That does not look like a GitHub token (it starts with github_pat_).";
      error.hidden = false;
      return;
    }
    setToken(t);
    closeSheet(sheet);
    run();
  });

  removeBtn.addEventListener("click", () => {
    setToken("");
    closeSheet(sheet);
    toast("Token removed", "This device can no longer start a refresh.");
  });
}
