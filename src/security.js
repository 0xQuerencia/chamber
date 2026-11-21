// The principal is the only role permitted to inspect the firm's security trail.
// This read API never exposes user passwords, TOTP secrets, device tokens or client PANs.
export async function handleSecurity(request,env,user,deps){
 const {output,fail,clean}=deps;
 if(user.role!=="principal")return fail("Only the principal can view security events",403);
 const url=new URL(request.url),method=request.method,path=url.pathname;
 if(path==="/api/security/events"&&method==="GET"){
  const event=clean(url.searchParams.get("event"),40),size=50;
  if(event&&!/^[a-z_]{2,40}$/.test(event))return fail("Invalid event filter");
  const page=Math.max(0,Math.min(200,Math.floor(Number(url.searchParams.get("page"))||0)));
  const where="WHERE a.firm_id=? AND a.event_class='security' "+(event?"AND a.event=? ":"");
  const values=event?[user.firm_id,event]:[user.firm_id];
  const [total,rows]=await Promise.all([
   env.DB.prepare("SELECT COUNT(*) AS n FROM activity a "+where).bind(...values).first(),
   env.DB.prepare("SELECT a.id,a.at,a.event,a.entity_type,a.entity_id,a.details,u.name AS actor_name,u.role AS actor_role FROM activity a "+
    "LEFT JOIN users u ON u.id=a.actor_id AND u.firm_id=a.firm_id "+where+" ORDER BY a.at DESC,a.id DESC LIMIT ? OFFSET ?")
    .bind(...values,size,page*size).all()
  ]);
  // Do not put raw HTTP URLs or session identifiers in this response.
  return output({events:rows.results.map(r=>({...r,details:JSON.parse(r.details||"{}")})),
   total:Number(total.n),page,limit:size});
 }
 return fail("Not found",404);
}
