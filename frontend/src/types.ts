export type Role="principal"|"manager"|"staff";
export type Priority="low"|"medium"|"high";
export type TaskStatus="todo"|"in_progress"|"waiting"|"blocked"|"review"|"done";
export type DocumentStatus="missing"|"requested"|"received"|"verified"|"rejected"|"not_applicable";
export type View="desk"|"work"|"clients"|"documents"|"compliance"|"team"|"reports"|"activity"|"settings";
export type WorkFilter="all"|"mine"|"overdue"|TaskStatus;
export interface Member {id:string;name:string;email:string;role:Role;active?:number}
export interface Client {id:string;name:string;category:string;email:string|null;phone:string|null;pan:string|null;gstin:string|null;notes?:string|null;created_at:string}
export interface Task {id:string;client_id:string;title:string;service:string;period:string|null;due_date:string|null;assignee_id:string|null;reviewer_id:string|null;priority:Priority;status:TaskStatus;notes:string|null;created_at?:string;updated_at?:string}
export interface Requirement {id:string;task_id:string;client_id:string;name:string;status:DocumentStatus;requested_at:string|null;received_at?:string|null;verified_at?:string|null;updated_at:string}
export interface Activity {id:string;actor_name?:string|null;event:string;entity_type:string;entity_id:string;at:string}
export interface Template {id:string;name:string;service:string;frequency:"monthly"|"quarterly"|"annual";due_day:number;active:number}
export interface Enrollment {id:string;client_id:string;template_id:string;assignee_id?:string|null;active:number}
export interface Workspace {firm:{id:string;name:string};user:Member;staff:Member[];clients:Client[];tasks:Task[];documents:Requirement[];activity:Activity[];templates:Template[];enrollments:Enrollment[]}
export interface Session {authenticated:boolean;needs_setup:boolean;user:Pick<Member,"id"|"name"|"role">|null}
export interface GenerationResult {created:number;already:number;checked:number}
