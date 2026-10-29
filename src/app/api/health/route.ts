/** Public liveness must not disclose infrastructure details or trigger database work. */
export const dynamic = "force-dynamic";
export async function GET(){
 return Response.json({application:"online"},{headers:{"Cache-Control":"no-store"}});
}
