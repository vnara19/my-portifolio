export function quoteChange(current:number|null,previous:number|null):number|null {
 return current!==null&&previous!==null&&Number.isFinite(current)&&Number.isFinite(previous)&&previous>0?(current/previous-1)*100:null;
}
