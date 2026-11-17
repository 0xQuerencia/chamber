import type {Workspace,Session,GenerationResult} from "./types";
export class ApiError extends Error { constructor(message:string,public readonly status:number){super(message);this.name="ApiError"} }
type Payload=Record<string,unknown>;
export async function api<T>(path:string,method:"GET"|"POST"|"PATCH"="GET",data?:Payload,extra:Record<string,string>={}):Promise<T>{
 const headers=new Headers(extra);if(data!==undefined)headers.set("Content-Type","application/json");
 const response=await fetch(path,{method,headers,credentials:"same-origin",body:data===undefined?undefined:JSON.stringify(data)});
 const result:unknown=await response.json().catch(()=>({}));
 if(!response.ok){const error=typeof result==="object"&&result!==null&&"error" in result&&typeof result.error==="string"?result.error:"Request failed ("+response.status+")";throw new ApiError(error,response.status)}
 return result as T;
}
export const getSession=()=>api<Session>("/api/session");
export const getWorkspace=()=>api<Workspace>("/api/bootstrap");
export const login=(email:string,password:string)=>api<{ok:boolean}>("/api/login","POST",{email,password});
export const logout=()=>api<{ok:boolean}>("/api/logout","POST",{});
export const setup=(values:Payload,token:string)=>api<{ok:boolean}>("/api/setup","POST",values,{"X-Setup-Token":token});
export const createRecord=(kind:"clients"|"tasks"|"documents"|"staff"|"templates"|"enrollments",values:Payload)=>api<{id?:string;ok?:boolean}>("/api/"+kind,"POST",values);
export const patchTask=(id:string,status:string)=>api<{ok:boolean}>("/api/tasks/"+encodeURIComponent(id),"PATCH",{status});
export const patchDocument=(id:string,status:string)=>api<{ok:boolean}>("/api/documents/"+encodeURIComponent(id),"PATCH",{status});
export const generatePeriod=(period:string)=>api<GenerationResult>("/api/recurrence","POST",{period});
export const exportUrl=(kind:"clients"|"tasks"|"documents")=>"/api/export?kind="+encodeURIComponent(kind);
