// Central client-visibility contract. Every caller MUST also bind firm_id.
export function clientScope(user,alias="c"){
 if(user.role==="principal")return {sql:"1=1",args:[]};
 if(user.role==="manager")return {
  sql:"("+alias+".manager_id=? OR EXISTS (SELECT 1 FROM tasks assigned "+
   "LEFT JOIN users member ON member.id=assigned.assignee_id AND member.firm_id=assigned.firm_id "+
   "WHERE assigned.firm_id="+alias+".firm_id AND assigned.client_id="+alias+".id "+
   "AND assigned.status!='done' AND (assigned.assignee_id=? OR member.manager_id=?)))",
  args:[user.id,user.id,user.id]
 };
 return {
  sql:"EXISTS (SELECT 1 FROM tasks assigned WHERE assigned.firm_id="+alias+".firm_id "+
   "AND assigned.client_id="+alias+".id AND assigned.status!='done' AND assigned.assignee_id=?)",
  args:[user.id]
 };
}
export async function canReadClient(db,user,clientId){
 const scope=clientScope(user,"c");
 const row=await db.prepare("SELECT c.id FROM clients c WHERE c.firm_id=? AND c.id=? AND c.archived_at IS NULL AND "+scope.sql)
  .bind(user.firm_id,clientId,...scope.args).first();
 return !!row;
}
export async function canManageClient(db,user,clientId){
 if(user.role!=="principal"&&user.role!=="manager")return false;
 return canReadClient(db,user,clientId);
}
export async function validClientManager(db,firmId,managerId){
 if(!managerId)return true;
 const user=await db.prepare("SELECT id FROM users WHERE firm_id=? AND id=? AND role IN ('principal','manager') AND active=1")
  .bind(firmId,managerId).first();
 return !!user;
}
