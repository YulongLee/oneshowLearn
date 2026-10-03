import {validatePaymentConfig} from './payment-configuration.mjs';
import {probePaymentConnection} from './payment-providers.mjs';

const labels={appId:'AppID',mchId:'微信商户号',serialNo:'商户 API 证书序列号',publicKeyId:'微信支付公钥 ID',publicKey:'支付平台公钥',sellerId:'支付宝卖家 UID',wechatPrivateKey:'微信商户 API 私钥',wechatApiV3Key:'微信 APIv3 密钥',alipayPrivateKey:'支付宝应用私钥'};
const alipayFailures={
  INVALID_PARAMETER:'支付宝返回 HTTP 400：测试请求参数无效（INVALID_PARAMETER）。这不代表密钥格式错误，请联系管理员检查测试接口参数。',
};
const failures={
  PAYMENT_WECHAT_KEY_CONFLICT:'微信支付公钥填成了商户公钥。请替换为微信商户平台「API 安全 → 微信支付公钥」下载的 PEM 文件；现有商户私钥无需更换。',
  PAYMENT_RESPONSE_SIGNATURE_INVALID:'微信返回的签名与已保存的微信支付公钥不匹配。请核对该公钥 ID 对应的原始 PEM 文件；连接尚未通过验证。',
  PAYMENT_RESPONSE_SIGNATURE_MISSING:'微信响应缺少签名信息，无法验证来源；连接尚未通过验证。',
  PAYMENT_REQUEST_AUTH_REJECTED:'接口返回 HTTP 401，且未提供完整响应签名。请检查商户私钥、商户 API 证书序列号及服务器时间；该错误响应未经验签，具体原因尚未确认。',
  PAYMENT_RESPONSE_SIGNATURE_FORMAT:'微信响应的签名信息格式异常，连接尚未通过验证。',
  PAYMENT_RESPONSE_TIMESTAMP_INVALID:'微信响应时间与服务器时间相差超过 5 分钟，请检查服务器时间同步。',
  PAYMENT_RESPONSE_KEY_ID_MISMATCH:'微信响应使用的公钥 ID 与已保存的 ID 不一致，请核对当前微信支付公钥及 ID。',
  PAYMENT_RESPONSE_CERTIFICATE_MODE:'微信响应使用平台证书签名，当前配置使用公钥模式。请核对商户平台模式；共享商户号请先确认其他产品兼容情况。',
  PAYMENT_RESPONSE_SIGNATURE_PROBE:'微信返回了验签探测签名，本次已按安全要求拒绝，请稍后重试。',
  'response-signature-verify-error':'支付宝响应验签未通过，请核对支付宝公钥（不是应用公钥）。',
  'response-alipay-sn-verify-error':'支付宝响应证书不匹配，本功能使用 RSA2 公钥模式。',
  SIGN_ERROR:'平台拒绝请求签名，请核对商户 / 应用私钥、证书序列号及服务器时间。',
  'isv.invalid-signature':'支付宝拒绝请求签名，请核对应用私钥与平台登记的应用公钥。',
  'isv.invalid-app-id':'支付宝 AppID 无效，请核对已上线应用的 AppID。',
  'isv.insufficient-isv-permissions':'支付宝接口权限不足，请检查应用状态及接口授权。',
  MCH_NOT_EXISTS:'微信商户号不存在，请核对商户号。',
  NO_AUTH:'支付接口权限不足，请检查商户 / 应用的接口授权。',
  FREQUENCY_LIMITED:'平台请求过于频繁，请稍后重试。',
  RULE_LIMIT:'平台限制了本次请求，请检查商户状态或稍后重试。',
  PARAM_ERROR:'平台拒绝请求参数，请核对商户 / 应用信息。',
  PAYMENT_PROBE_UNEXPECTED:'平台返回了非预期的测试结果，未将其判定为通过。'
};
export async function diagnosePaymentConnection(provider,c){
  const started=Date.now(),s=c.settings[provider];
  const fields=provider==='wechat'?['appId','mchId','serialNo','publicKeyId','publicKey']:['appId','sellerId','publicKey'];
  const secretFields=provider==='wechat'?['wechatPrivateKey','wechatApiV3Key']:['alipayPrivateKey'];
  const missing=[...fields.filter(k=>!s[k]?.trim()),...secretFields.filter(k=>!c.secrets[k]?.trim())];
  const result={provider,version:c.version,status:'incomplete',checkedAt:new Date().toISOString(),channelEnabled:s.enabled,checks:[],limitations:provider==='wechat'?['本次仅验证查单接口通信与响应签名；未验证 Native 下单权限、AppID 绑定、APIv3 解密、支付回调或课程开通。']:['新订单使用电脑网站支付（alipay.trade.page.pay），不是当面付。','本次仅验证支付宝基础接口通信与响应签名；未验证电脑网站支付签约、应用与商户绑定、真实付款、支付回调或课程开通。']};
  const finish=()=>({...result,durationMs:Date.now()-started});
  if(missing.length){result.message=`请先补充并保存：${missing.map(k=>labels[k]).join('、')}`;result.checks.push({label:'已保存的配置',status:'failed',detail:result.message});return finish();}
  try{
    // Check this provider independently, even while its public switch is off.
    const settings={...c.settings,productId:c.settings.productId||1,wechat:{...c.settings.wechat,enabled:provider==='wechat'},alipay:{...c.settings.alipay,enabled:provider==='alipay'}};
    validatePaymentConfig(settings,c.secrets);
  }catch(error){
    result.message=failures[error.code]||(error.isPaymentError?error.message:`${provider==='wechat'?'微信':'支付宝'}配置格式未通过，请核对该平台的密钥及商户字段。`);
    result.checks.push({label:'配置格式',status:'failed',detail:result.message});return finish();
  }
  result.checks.push({label:'已保存的配置与格式',status:'passed',detail:`已检查版本 ${c.version}；未回显任何密钥。`});
  try{await probePaymentConnection(provider,c);result.status='passed';result.message='接口连接与响应验签通过';result.checks.push({label:'平台接口通信与响应验签',status:'passed',detail:provider==='wechat'?'平台已签名确认随机测试订单不存在；未创建订单。':'支付宝基础配置验证接口返回成功，SDK 响应验签通过。'});}
  catch(error){
    result.status='failed';
    const code=error.providerCode||error.code||error.cause?.code;
    result.message=(provider==='alipay'?alipayFailures[code]:undefined)||failures[code]||(['TimeoutError','AbortError'].includes(error.name)||/TIMEOUT|ETIMEDOUT/.test(String(code))?'平台连接超时，请稍后重试或检查服务器网络。':['ENOTFOUND','EAI_AGAIN'].includes(code)?'支付平台域名解析失败，请检查服务器 DNS 后重试。':['ECONNREFUSED','ECONNRESET'].includes(code)?'支付平台网络连接失败，请检查服务器网络后重试。':'暂未通过平台连接测试，请核对配置、平台权限与服务器网络后重试。');
    result.checks.push({label:'平台接口通信与响应验签',status:'failed',detail:result.message});
  }
  return finish();
}
