import type {Workspace,Session,GenerationResult,TrackerSummary,TrackerDetail,ClientProfileData,WorkloadResponse,TaskComment,TaskHistoryEvent,TimerEntry,ImportClientRow,ImportPreview,ImportCommitResult,MessagePreview,MessageBatch,MessageBatchDetail,MessageChannel,MessageTemplate,DashboardReport,DrillReport,ReportKind,DeviceList,SheetsStatus,StoredDocument,ReminderPolicy,ReminderFeed,ReminderStatus,LoginResult,MfaEnrollment,SecurityFeed,OnboardingStatus,FirmProfile} from "./types";
export class ApiError extends Error { constructor(message:string,public readonly status:number){super(message);this.name="ApiError"} }
type Payload=Record<string,unknown>;
export async function api<T>(path:string,method:"GET"|"POST"|"PATCH"|"PUT"="GET",data?:Payload,extra:Record<string,string>={}):Promise<T>{
 const headers=new Headers(extra);if(data!==undefined)headers.set("Content-Type","application/json");
 const response=await fetch(path,{method,headers,credentials:"same-origin",body:data===undefined?undefined:JSON.stringify(data)});
 const result:unknown=await response.json().catch(()=>({}));
 if(!response.ok){const error=typeof result==="object"&&result!==null&&"error" in result&&typeof result.error==="string"?result.error:"Request failed ("+response.status+")";throw new ApiError(error,response.status)}
 return result as T;
}
export const getSession=()=>api<Session>("/api/session");
export const getWorkspace=()=>api<Workspace>("/api/bootstrap");
export const login=(email:string,password:string,deviceLabel="")=>api<LoginResult>("/api/login","POST",{email,password,device_label:deviceLabel});
export const logout=()=>api<{ok:boolean}>("/api/logout","POST",{});
export const setup=(values:Payload,token:string)=>api<{ok:boolean}>("/api/setup","POST",values,{"X-Setup-Token":token});
export const createRecord=(kind:"clients"|"tasks"|"documents"|"staff"|"templates"|"enrollments"|"requirements"|"overrides",values:Payload)=>api<{id?:string;ok?:boolean}>("/api/"+kind,"POST",values);
export const patchTask=(id:string,status:string)=>api<{ok:boolean}>("/api/tasks/"+encodeURIComponent(id),"PATCH",{status});
export const patchDocument=(id:string,status:string)=>api<{ok:boolean}>("/api/documents/"+encodeURIComponent(id),"PATCH",{status});
export const generatePeriod=(period:string)=>api<GenerationResult>("/api/recurrence","POST",{period});
export const exportUrl=(kind:"clients"|"tasks"|"documents")=>"/api/export?kind="+encodeURIComponent(kind);

export const getTracker=(from:string,service="",page=0)=>api<TrackerSummary>("/api/tracker?from="+encodeURIComponent(from)+"&page="+page+"&size=100"+(service?"&service="+encodeURIComponent(service):""));
export const getTrackerDetail=(clientId:string,period:string)=>api<TrackerDetail>("/api/tracker/detail?client_id="+encodeURIComponent(clientId)+"&period="+encodeURIComponent(period));
export const saveInwardReceipt=(clientId:string,period:string,documentIds:string[],receivedVia:string,note:string)=>api<{received:number;already_received:number}>("/api/inward","POST",{client_id:clientId,period,document_ids:documentIds,received_via:receivedVia,note});

export const getClientProfile=(id:string)=>api<ClientProfileData>("/api/clients/"+encodeURIComponent(id)+"/profile");
export const updateClient=(id:string,values:Payload)=>api<{ok:boolean}>("/api/clients/"+encodeURIComponent(id),"PATCH",values);
export const archiveClient=(id:string)=>api<{ok:boolean}>("/api/clients/"+encodeURIComponent(id)+"/archive","POST",{});
export const addClientContact=(id:string,values:Payload)=>api<{id:string}>("/api/clients/"+encodeURIComponent(id)+"/contacts","POST",values);
export const addClientGstin=(id:string,gstin:string)=>api<{id:string}>("/api/clients/"+encodeURIComponent(id)+"/gstins","POST",{gstin});

export const getWorkload=()=>api<WorkloadResponse>("/api/workload");
export const assignTask=(id:string,assigneeId:string|null,reviewerId:string|null)=>api<{ok:boolean}>("/api/tasks/"+encodeURIComponent(id)+"/assignment","PATCH",{assignee_id:assigneeId,reviewer_id:reviewerId});
export const reviewTask=(id:string,decision:"approve"|"return",note:string)=>api<{ok:boolean;status:string}>("/api/tasks/"+encodeURIComponent(id)+"/review","POST",{decision,note});
export const getTaskComments=(id:string)=>api<{comments:TaskComment[]}>("/api/tasks/"+encodeURIComponent(id)+"/comments");
export const addTaskComment=(id:string,body:string)=>api<{id:string}>("/api/tasks/"+encodeURIComponent(id)+"/comments","POST",{body});
export const getTaskHistory=(id:string)=>api<{events:TaskHistoryEvent[]}>("/api/tasks/"+encodeURIComponent(id)+"/history");
export const toggleTaskTimer=(id:string,action:"start"|"stop")=>api<{ok:boolean;running:boolean;minutes?:number}>("/api/tasks/"+encodeURIComponent(id)+"/timer","POST",{action});
export const getTaskTime=(id:string)=>api<{entries:TimerEntry[]}>("/api/tasks/"+encodeURIComponent(id)+"/time");

export const importTemplateUrl="/api/imports/template";
export const importErrorsUrl=(id:string)=>"/api/imports/"+encodeURIComponent(id)+"/errors";
export const validateImportRows=(rows:ImportClientRow[])=>api<ImportPreview>("/api/imports/validate","POST",{rows});
export const startClientImport=()=>api<{id:string}>("/api/imports","POST",{kind:"clients"});
export const addImportRows=(id:string,rows:ImportClientRow[])=>api<ImportCommitResult>("/api/imports/"+encodeURIComponent(id)+"/rows","POST",{rows});
export const completeClientImport=(id:string)=>api<{ok:boolean;imported:number;errors:number}>("/api/imports/"+encodeURIComponent(id)+"/complete","POST",{});
export const undoClientImport=(id:string)=>api<{ok:boolean}>("/api/imports/"+encodeURIComponent(id)+"/undo","POST",{});

export const previewBulkMessages=(clientIds:string[],period:string,channel:MessageChannel,body?:string,templateId?:string)=>
 api<MessagePreview>("/api/messages/preview","POST",{client_ids:clientIds,period,channel,...(templateId?{template_id:templateId}:{body})});
export const draftBulkMessages=(clientIds:string[],period:string,channel:MessageChannel,confirmCount:number,body?:string,templateId?:string)=>
 api<{id:string;recipient_count:number;status:string;delivery_enabled:boolean}>("/api/messages/batches","POST",{client_ids:clientIds,period,channel,confirm_count:confirmCount,...(templateId?{template_id:templateId}:{body})});
export const getMessageBatch=(id:string)=>api<MessageBatchDetail>("/api/messages/batches/"+encodeURIComponent(id));
export const getMessageBatches=()=>api<{batches:MessageBatch[];delivery_enabled:boolean}>("/api/messages/batches");
export const cancelMessageBatch=(id:string)=>api<{ok:boolean}>("/api/messages/batches/"+encodeURIComponent(id)+"/cancel","POST",{});
export const getMessageTemplates=()=>api<{templates:MessageTemplate[]}>("/api/messages/templates");
export const createMessageTemplate=(name:string,channel:MessageChannel,body:string)=>api<{id:string}>("/api/messages/templates","POST",{name,channel,body});

export const getInsights=()=>api<DashboardReport>("/api/reports/dashboard");
export const getInsightDrill=(kind:ReportKind,page=0)=>api<DrillReport>("/api/reports/drilldown?kind="+encodeURIComponent(kind)+"&page="+page);

export const getDevices=()=>api<DeviceList>("/api/devices");
export const revokeDevice=(id:string)=>api<{ok:boolean}>("/api/devices/"+encodeURIComponent(id)+"/revoke","POST",{});

export const getSheetsStatus=()=>api<SheetsStatus>("/api/sheets/status");
export const connectSheets=(spreadsheetId:string)=>api<{ok:boolean}>("/api/sheets/connect","POST",{spreadsheet_id:spreadsheetId});
export const disconnectSheets=()=>api<{ok:boolean}>("/api/sheets/disconnect","POST",{});

export const getEvidenceFiles=(requirementId:string)=>api<{files:StoredDocument[];download_policy:string}>("/api/files?requirement_id="+encodeURIComponent(requirementId));
export const evidenceDownloadUrl=(id:string)=>"/api/files/"+encodeURIComponent(id)+"/download";
export async function uploadEvidence(requirementId:string,file:File):Promise<{id:string;status:"pending";filename:string;size_bytes:number;message:string}>{
 const response=await fetch("/api/files/upload?requirement_id="+encodeURIComponent(requirementId),{
  method:"POST",credentials:"same-origin",headers:{"Content-Type":file.type,"X-File-Name":encodeURIComponent(file.name)},body:file
 });
 const result=await response.json().catch(()=>({}));
 if(!response.ok)throw new ApiError(typeof result.error==="string"?result.error:"Upload failed",response.status);
 return result;
}

export const getReminderConfig=()=>api<{config:ReminderPolicy;delivery_enabled:boolean}>("/api/reminders/config");
export const saveReminderConfig=(config:ReminderPolicy)=>api<{config:ReminderPolicy;delivery_enabled:boolean}>("/api/reminders/config","PUT",{...config});
export const refreshReminders=()=>api<{result:{created:number;already:number;resolved:number;blocked:number;checked:number};delivery_enabled:boolean}>("/api/reminders/refresh","POST",{});
export const getReminders=(status:ReminderStatus,page=0)=>api<ReminderFeed>("/api/reminders?status="+status+"&page="+page);
export const pauseClientReminders=(id:string,until:string,reason:string)=>api<{ok:boolean}>("/api/reminders/clients/"+encodeURIComponent(id)+"/pause","POST",{paused_until:until,reason});
export const resumeClientReminders=(id:string)=>api<{ok:boolean}>("/api/reminders/clients/"+encodeURIComponent(id)+"/resume","POST",{});
export const markReminderPrepared=(id:string,batchId:string)=>api<{ok:boolean}>("/api/reminders/"+encodeURIComponent(id)+"/prepared","POST",{batch_id:batchId});
export const dismissReminder=(id:string,reason:string)=>api<{ok:boolean}>("/api/reminders/"+encodeURIComponent(id)+"/dismiss","POST",{reason});

export const startMfaEnrollment=(challenge:string)=>api<MfaEnrollment>("/api/mfa/setup","POST",{challenge});
export const verifyMfa=(challenge:string,code:string,deviceLabel:string)=>api<{ok:true}>("/api/mfa/verify","POST",{challenge,code,device_label:deviceLabel});

export const getSecurityEvents=(page=0,event="")=>api<SecurityFeed>("/api/security/events?page="+page+(event?"&event="+encodeURIComponent(event):""));

export const getOnboarding=()=>api<OnboardingStatus>("/api/onboarding");
export const saveFirmProfile=(name:string,profile:FirmProfile)=>api<{ok:boolean}>("/api/onboarding/profile","PUT",{name,...profile});
