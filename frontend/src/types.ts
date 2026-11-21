export type Role="principal"|"manager"|"staff";
export type Priority="low"|"medium"|"high";
export type TaskStatus="todo"|"in_progress"|"waiting"|"blocked"|"review"|"done";
export type DocumentStatus="missing"|"requested"|"received"|"verified"|"rejected"|"not_applicable";
export type View="desk"|"work"|"clients"|"documents"|"tracker"|"compliance"|"team"|"reports"|"activity"|"settings";
export type WorkFilter="all"|"mine"|"overdue"|TaskStatus;
export interface Member {id:string;name:string;email:string;role:Role;active?:number}
export interface Client {id:string;name:string;category:string;email:string|null;phone:string|null;pan:string|null;gstin:string|null;notes?:string|null;created_at:string;updated_at?:string;code?:string|null;client_group?:string|null;manager_id?:string|null}
export interface Task {id:string;client_id:string;title:string;service:string;period:string|null;due_date:string|null;assignee_id:string|null;reviewer_id:string|null;ask_by_date?:string|null;priority:Priority;status:TaskStatus;notes:string|null;created_at?:string;updated_at?:string}
export interface Requirement {id:string;task_id:string;client_id:string;name:string;status:DocumentStatus;requested_at:string|null;received_at?:string|null;verified_at?:string|null;updated_at:string}
export interface Activity {id:string;actor_name?:string|null;event:string;entity_type:string;entity_id:string;at:string}
export interface Template {id:string;name:string;service:string;frequency:"monthly"|"quarterly"|"annual";due_day:number;ask_by_lead_days?:number;active:number}
export interface Enrollment {id:string;client_id:string;template_id:string;assignee_id?:string|null;active:number}
export interface Workspace {firm:{id:string;name:string};user:Member;staff:Member[];clients:Client[];tasks:Task[];documents:Requirement[];activity:Activity[];templates:Template[];enrollments:Enrollment[];requirements?:RequirementTemplate[]}
export interface Session {authenticated:boolean;needs_setup:boolean;user:Pick<Member,"id"|"name"|"role">|null}
export interface GenerationResult {created:number;already:number;checked:number}

export interface RequirementTemplate {id:string;template_id:string;name:string;required:number;sort_order:number}
export type DataCellState="complete"|"partial"|"missing"|"not_due"|"unconfigured";
export interface TrackerCell {period:string;state:DataCellState;tasks:number;total:number;received:number;waived:number}
export interface TrackerClient {id:string;name:string;category:string;cells:TrackerCell[]}
export interface TrackerSummary {periods:string[];clients:TrackerClient[];page:number;has_more:boolean;service:string|null}
export interface TrackerDocument {id:string;task_id:string;name:string;status:DocumentStatus;requested_at:string|null;received_at:string|null;verified_at:string|null;received_via:string|null;receipt_note:string|null}
export interface TrackerTask {id:string;title:string;service:string;status:TaskStatus;due_date:string|null;ask_by_date:string|null}
export interface TrackerDetail {client:{id:string;name:string};period:string;tasks:TrackerTask[];documents:TrackerDocument[]}

export interface ClientContact {id:string;name:string;title:string|null;email:string|null;phone:string|null;preferred_channel:string;whatsapp_opt_in_at?:string|null;whatsapp_opt_in_source?:string|null}
export interface ClientGstin {id:string;gstin:string;state_code:string}
export interface ClientProfileData {client:Client;contacts:ClientContact[];gstins:ClientGstin[]}
