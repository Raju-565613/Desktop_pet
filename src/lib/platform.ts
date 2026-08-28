// Tauri injects window.__TAURI__ at runtime. Guarding every Tauri API call
// with this means the same frontend bundle also runs as a plain page under
// `vite dev` — useful for iterating on rendering/animation without spinning
// up the Rust shell each time (this sandbox in particular can't compile or
// run the Rust side at all).
export const isTauri = typeof window !== "undefined" && "__TAURI__" in window;
