/** Keep post-login navigation on this application, including browser backslash normalization. */
export function safeSignInTarget(value:string|undefined){
 if(!value || !value.startsWith('/') || value.startsWith('//') || /[\\\u0000-\u001f\u007f]/.test(value))return '/';
 try{const url=new URL(value,'https://portfolio.invalid');return url.origin==='https://portfolio.invalid' && !url.pathname.startsWith('/entrar')?url.pathname+url.search+url.hash:'/';}catch{return '/';}
}
