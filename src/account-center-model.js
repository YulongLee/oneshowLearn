export const ACCOUNT_SECTIONS = ['profile','security','preferences','orders'];
export function accountSection(value) { return ACCOUNT_SECTIONS.includes(value) ? value : 'profile'; }
export function accountMenuRequest(search) {
  const params=new URLSearchParams(search);
  return {section:accountSection(params.get('section')),logout:params.get('section')==='security'&&params.get('confirmLogout')==='current'?'current':''};
}
export function profileNameError(value) {
  const length=String(value??'').trim().length;
  return length<2||length>80?'昵称需为 2–80 个字，不能只填写空格。':'';
}
export function profileSaveLabel({busy,conflict,dirty,failed,saved}) {
  if(busy)return '正在处理…';
  if(conflict)return '资料已更新，你的输入已保留';
  if(failed)return '保存失败，你的输入已保留';
  if(dirty)return '有未保存的修改，请点击保存';
  return saved?'修改已保存':'资料已同步';
}
export function accountOrderState(order) {
  if (order.status === 'paid') return {label:'已支付',tone:'success'};
  if (order.status === 'pending') return {label:order.expired?'待核验':'待支付',tone:'pending'};
  if (order.status === 'cancelled') return {label:'已关闭',tone:'quiet'};
  if (order.status === 'refunded') return {label:'已退款',tone:'quiet'};
  return {label:'状态待确认',tone:'quiet'};
}
export function accountOrderPath(order) {
  if(order.provider==='manual')return Number.isSafeInteger(order.id)&&order.id>0?'/support':null;
  return Number.isSafeInteger(order.id) && order.id > 0 ? `/membership?paymentReturn=${order.id}` : null;
}
export function accountOrderMatches(order,filter) {
  return filter==='all'||(filter==='closed'?['cancelled','refunded'].includes(order.status):order.status===filter);
}
