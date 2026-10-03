// Account-bound navigation intent. No persistence, provider request or auto-send.
let pending = null;
export function prepareTutorQuestion(question, context = {}) {
  pending = {question:String(question).slice(0,4000), accountId:context.accountId ?? null,
    courseId:Number.isSafeInteger(context.courseId) && context.courseId > 0 ? context.courseId : null};
}
export function takeTutorIntent(accountId) {
  const value = pending; pending = null;
  return value && value.accountId != null && String(value.accountId) === String(accountId) ? value : null;
}
// Reading during render is non-destructive (also safe under React StrictMode).
export function peekTutorIntent(accountId) {
  return pending && pending.accountId != null && String(pending.accountId) === String(accountId) ? pending : null;
}
