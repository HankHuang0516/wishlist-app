export class ManagerFailure extends Error {readonly status:number;readonly code:string;constructor(status:number,code:string){super(code);this.status=status;this.code=code;}}
export type ManagerSession={expiresAt:string;csrfToken:string;publishAllowed:false};
export async function managerRequest<T>(path:string,csrf?:string,body?:unknown):Promise<T>{
 const response=await fetch('/api/source-manager'+path,{method:body===undefined?'GET':'POST',credentials:'same-origin',cache:'no-store',headers:{...(body===undefined?{}:{'Content-Type':'application/json'}),...(csrf?{'X-CSRF-Token':csrf}:{})},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(30000)});
 if(response.status===204)return undefined as T;
 const value=await response.json();
 if(!response.ok)throw new ManagerFailure(response.status,typeof value?.errorCode==='string'&&/^[A-Z_]{1,120}$/.test(value.errorCode)?value.errorCode:'MANAGER_REQUEST_UNCONFIRMED');
 return value as T;
}
export const managerIssue=(e:unknown)=>e instanceof ManagerFailure?e.status===401?'管理登入已失效，請重新登入。':e.status===403?'此操作沒有授權或安全驗證未通過。':e.status===409?'資料版本或驗證條件不符，請先讀回最新資料。':e.status===429?'操作過於頻繁，請稍後再查核。':'服務暫時無法確認結果。':'連線結果未確認，請先查核原操作，不重複提交。';
