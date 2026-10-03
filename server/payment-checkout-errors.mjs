const messages={
  'alipay-permission':'支付宝下单接口暂不可用，请管理员检查当面付签约及应用接口权限。请保留订单，勿重复付款。',
  'alipay-parameters':'支付宝拒绝了下单参数，请管理员检查下单请求及商户配置。请保留订单，勿重复付款。',
  'alipay-signature':'支付宝请求签名或响应验签未通过，请管理员核对密钥配置。请保留订单，勿重复付款。',
  'wechat-signature':'微信支付响应核验未通过，请管理员检查支付配置。请保留订单，勿重复付款。',
  'wechat-permission':'微信下单接口暂不可用，请管理员检查 Native 支付权限和商户状态。请保留订单，勿重复付款。',
  'wechat-parameters':'微信拒绝了下单参数，请管理员检查 AppID 绑定及商户配置。请保留订单，勿重复付款。',
  'provider-timeout':'支付平台连接超时，尚不能确认下单结果。请保留订单并查询状态，勿重复付款。',
  'provider-network':'暂时无法连接支付平台，请稍后查询订单状态，勿重复付款。',
  'provider-unavailable':'支付平台暂未返回二维码，请保留订单并查询状态，勿重复付款',
};
export const checkoutFailureMessage=code=>messages[code]||messages['provider-unavailable'];
export function checkoutFailureCode(provider,error){
  const code=error.providerCode||error.code||error.cause?.code;
  if(provider==='alipay'){
    if(['ACQ.ACCESS_FORBIDDEN','isv.insufficient-isv-permissions'].includes(code))return 'alipay-permission';
    if(['INVALID_PARAMETER','ACQ.INVALID_PARAMETER','ACQ.PARTNER_ERROR','isv.invalid-app-id'].includes(code))return 'alipay-parameters';
    if(['response-signature-verify-error','response-alipay-sn-verify-error','isv.invalid-signature','INVALID_SIGNATURE'].includes(code))return 'alipay-signature';
  }
  if(provider==='wechat'&&String(code).startsWith('PAYMENT_RESPONSE_'))return 'wechat-signature';
  if(provider==='wechat'&&['SIGN_ERROR','PAYMENT_REQUEST_AUTH_REJECTED'].includes(code))return 'wechat-signature';
  if(provider==='wechat'&&['NO_AUTH','MCH_NOT_EXISTS'].includes(code))return 'wechat-permission';
  if(provider==='wechat'&&code==='PARAM_ERROR')return 'wechat-parameters';
  if(['TimeoutError','AbortError'].includes(error.name)||/TIMEOUT|ETIMEDOUT/.test(String(code)))return 'provider-timeout';
  if(['ENOTFOUND','EAI_AGAIN','ECONNREFUSED','ECONNRESET'].includes(code))return 'provider-network';
  return 'provider-unavailable';
}
