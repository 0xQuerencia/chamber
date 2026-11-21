export type Role="principal"|"manager"|"staff";
export type Priority="low"|"medium"|"high";
export type TaskStatus="todo"|"in_progress"|"waiting"|"blocked"|"review"|"done";
export type DocumentStatus="missing"|"requested"|"received"|"verified"|"rejected"|"not_applicable";
export type View="desk"|"work"|"clients"|"documents"|"tracker"|"board"|"myday"|"import"|"requests"|"reminders"|"insights"|"compliance"|"team"|"reports"|"activity"|"security"|"onboarding"|"settings";
export type WorkFilter="all"|"mine"|"overdue"|TaskStatus;
export interface Member {id:string;name:string;email:string;role:Role;active?:number}
export interface Client {id:string;name:string;category:string;email:string|null;phone:string|null;pan:string|null;gstin:string|null;notes?:string|null;created_at:string;updated_at?:string;code?:string|null;client_group?:string|null;manager_id?:string|null}
export interface Task {id:string;client_id:string;title:string;service:string;period:string|null;due_date:string|null;assignee_id:string|null;reviewer_id:string|null;ask_by_date?:string|null;estimated_minutes?:number;completed_at?:string|null;completed_by?:string|null;priority:Priority;status:TaskStatus;notes:string|null;created_at?:string;updated_at?:string}
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

export interface WorkloadMember {id:string;name:string;role:Role;capacity_hours_per_week:number;open_tasks:number;estimated_minutes:number;load_percent:number;work_state:"busy"|"free"}
export interface WorkloadResponse {members:WorkloadMember[];unassigned:number;policy:string}
export interface TaskComment {id:string;body:string;author:string;created_at:string}
export interface TaskHistoryEvent {id:string;from_status:string|null;to_status:string;note:string|null;at:string;actor_name:string|null}
export interface TimerEntry {user_id:string;started_at:string;stopped_at:string|null;duration_minutes:number|null}

export interface ImportClientRow {source_index:number;code?:string;name:string;category?:string;client_group?:string;pan?:string;gstin?:string;email?:string;phone?:string;notes?:string}
export interface ImportRowIssue {index:number;errors:string[]}
export interface ImportPreview {accepted:number;rejected:number;rows:ImportRowIssue[]}
export interface ImportCommitResult {accepted:number;rejected:ImportRowIssue[];already:number}

export type MessageChannel="email"|"whatsapp";
export interface MessagePreviewItem {client_id:string;client_name:string;eligible:boolean;reason:string|null;recipient:string|null;contact_id:string|null;missing_count:number;body:string}
export interface MessagePreview {channel:MessageChannel;period:string;previews:MessagePreviewItem[];eligible:number;skipped:number}
export interface MessageBatch {id:string;channel:MessageChannel;period:string;status:string;recipient_count:number;created_at?:string;scheduled_at?:string|null;queued_at?:string|null}
export interface MessageBatchDetail {batch:MessageBatch;messages:Array<{id:string;client_id:string;client_name:string;recipient:string;body:string;status:string;error:string|null;sent_at?:string|null;delivered_at?:string|null;read_at?:string|null;send_attempts?:number}>;delivery_enabled:boolean}
export interface MessageTemplate {id:string;name:string;channel:MessageChannel;category:string;body:string;approval_status:string;active:number;provider_template_id?:string|null;language_code?:string}

export type ReportKind="due_soon"|"overdue"|"missing"|"unassigned"|"review"|"waiting";
export interface DashboardDeadline {id:string;title:string;client_id:string;client_name:string;service:string;period:string|null;status:string;due_date:string|null;ask_by_date:string|null;assignee_name:string|null}
export interface DashboardActivity {id:string;event:string;entity_type:string;entity_id:string;at:string;actor_name:string|null}
export interface DashboardWorkload {id:string;name:string;role:string;capacity_hours_per_week:number;open_tasks:number;estimated_minutes:number;load_percent:number}
export interface DashboardService {service:string;total:number;done:number;overdue:number}
export interface DashboardReport {today:string;through:string;kpis:Record<ReportKind,number>;team_count:number;deadlines:DashboardDeadline[];activity:DashboardActivity[];workload:DashboardWorkload[];services:DashboardService[];responsiveness:{received_count:number;avg_response_days:number|null}}
export interface DrillRow {id:string;title:string;status:string;client_id:string;client_name:string;service:string;period:string|null;due_date:string|null;ask_by_date:string|null}
export interface DrillReport {kind:ReportKind;total:number;page:number;rows:DrillRow[]}

export interface NamedDevice {id:string;label:string;user_agent:string;first_seen_at:string;last_seen_at:string;trusted:number;revoked_at:string|null;user_id:string;user_name:string}
export interface DeviceList {devices:NamedDevice[];current_device_id:string|null}

export interface SheetsStatus {connected:boolean;spreadsheet_id:string|null;last_synced_at:string|null;last_error:string|null;credentials_configured:boolean}

export type ScanStatus="pending"|"clean"|"infected"|"failed";
export interface StoredDocument {id:string;filename:string;mime_type:string;size_bytes:number;sha256:string;scan_status:ScanStatus;created_at:string;scanned_at:string|null}

export interface ReminderPolicy {enabled:number;ask_days:number;remind_days:number;escalate_days:number;max_reminders:number;quiet_start:string;quiet_end:string}
export type ReminderStatus="pending"|"prepared"|"resolved"|"dismissed";
export interface ReminderItem {id:string;client_id:string;client_name:string;client_code:string|null;period:string;stage:"ask"|"remind"|"escalate";due_date:string;missing_count:number;status:ReminderStatus;prepared_batch_id:string|null;created_at:string;paused_until:string|null}
export interface ReminderFeed {items:ReminderItem[];total:number;page:number;delivery_enabled:boolean}

export type LoginResult={ok:true}|{requires_mfa:true;enrollment_required:boolean;challenge:string;expires_in_seconds:number};
export interface MfaEnrollment {secret:string;otpauth_uri:string;expires_in_seconds:number}

export interface SecurityEvent {id:string;at:string;event:string;entity_type:string;entity_id:string;actor_name:string|null;actor_role:string|null;details:Record<string,unknown>}
export interface SecurityFeed {events:SecurityEvent[];total:number;page:number;limit:number}

export interface FirmProfile {timezone:string;financial_year_start_month:number;working_days:number[];contact_email:string;grievance_email:string;privacy_notice_url:string|null;updated_at:string|null}
export interface OnboardingStatus {
 firm:{id:string;name:string};
 profile:FirmProfile;
 counts:{users:number;clients:number;templates:number;requirements:number;enrollments:number;tasks:number;documents:number};
 stages:{profile:boolean;team:boolean;clients:boolean;services:boolean;first_tasks:boolean};
 completed_stages:number;total_stages:number;
 integrations:{email:{connected:boolean;description:string};whatsapp:{connected:boolean;description:string};sheets:{connected:boolean};storage:{configured:boolean}};
 security:{mfa_enabled:boolean};
 note:string
}

export interface DeliveryReadiness {email:boolean;whatsapp:boolean;safety:{scheduled_undo_seconds:number;quiet_hours_ist:string;template_approval_required:boolean}}
export interface QueuedSend {ok:true;status:"queued";send_after:string;undo_until:string;count:number}
