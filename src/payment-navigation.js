// Only the authenticated server may supply a signed official cashier link.
export function officialAlipayUrl(value){
  try{const url=new URL(value);return url.origin==='https://openapi.alipay.com'&&url.pathname==='/gateway.do'&&!url.username&&!url.password&&!url.hash&&url.searchParams.get('method')==='alipay.trade.page.pay'?url.href:null;}catch{return null;}
}
export function paymentReturnId(search){
  const id=new URLSearchParams(search).get('paymentReturn');
  return /^[1-9]\d{0,14}$/.test(id||'')&&Number.isSafeInteger(Number(id))?Number(id):null;
}
