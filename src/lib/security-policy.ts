/** Styles remain inline-compatible for charts; executable scripts require a fresh nonce in production. */
export function contentSecurityPolicy(nonce:string,development=false){
  if(!/^[A-Za-z0-9+/=]+$/.test(nonce))throw new Error("Invalid nonce");
  return ["default-src 'self'",`script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${development?" 'unsafe-eval'":""}`,"style-src 'self' 'unsafe-inline'","img-src 'self' data: blob: https:","font-src 'self'","connect-src 'self'"+(development?" ws: wss:":""),"object-src 'none'","base-uri 'self'","form-action 'self'","frame-ancestors 'none'","frame-src 'none'","worker-src 'self' blob:",...(development?[]:["upgrade-insecure-requests"])].join('; ');
}
