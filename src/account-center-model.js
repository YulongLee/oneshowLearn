export const ACCOUNT_SECTIONS = ['profile','security','preferences','orders'];
export function accountSection(value) { return ACCOUNT_SECTIONS.includes(value) ? value : 'profile'; }
export function accountOrderState(order) {
  if (order.status === 'paid') return {label:'已支付',tone:'success'};
  if (order.status === 'pending') return {label:order.expired?'待核验':'待支付',tone:'pending'};
  if (order.status === 'cancelled') return {label:'已关闭',tone:'quiet'};
  if (order.status === 'refunded') return {label:'已退款',tone:'quiet'};
  return {label:'状态待确认',tone:'quiet'};
}
export function accountOrderPath(order) {
  return Number.isSafeInteger(order.id) && order.id > 0 ? `/membership?paymentReturn=${order.id}` : null;
}
export function accountOrderMatches(order,filter) {
  return filter==='all'||(filter==='closed'?['cancelled','refunded'].includes(order.status):order.status===filter);
}
