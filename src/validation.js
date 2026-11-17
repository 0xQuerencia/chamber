export function clean(value, max = 200) {
  if (value === null || value === undefined) return "";
  if (typeof value !== "string" && typeof value !== "number") return "";
  return String(value).replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max);
}
export function validEmail(value) {
  return typeof value === "string" && value.length <= 200 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}
const TASK_STATUSES = ["todo", "in_progress", "waiting", "blocked", "review", "done"];
export function safeStatus(value) {
  return TASK_STATUSES.includes(value) ? value : null;
}
export function statusForRole(role, status) {
  return TASK_STATUSES.includes(status) && (role === "principal" || role === "manager" || (role === "staff" && status !== "done"));
}
export function csvCell(value) {
  let str = String(value ?? "");
  if (/^[\s]*[=+\-@]/.test(str)) str = "'" + str;
  return '"' + str.replace(/"/g, '""') + '"';
}
