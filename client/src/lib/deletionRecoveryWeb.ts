import { createDeletionRecoveryVault,deletionRecoveryKey,type PendingStore } from './webPendingStore';
import { PENDING_DELETION_KEY,parsePendingDeletion,type PendingDeletion } from './accountDeletionWeb';
export class DeletionRecoveryError extends Error { constructor(){super('STORAGE');} }
export const deletionRecoveryVault=createDeletionRecoveryVault();
/** Stable exact original evidence; no password or typed confirmation. The
 * original session is encrypted only in this purpose-specific recovery vault. */
export function deletionJournal(journal:PendingDeletion){
 return JSON.stringify({version:journal.version,apiUrl:journal.apiUrl,userId:journal.userId,clientActionId:journal.clientActionId,originalToken:journal.originalToken});
}
export async function recoverDeletionJournal(apiUrl:string,vault:PendingStore=deletionRecoveryVault,legacy:Storage=localStorage){
 try{
  const key=await deletionRecoveryKey(apiUrl),legacyRaw=legacy.getItem(PENDING_DELETION_KEY);
  const old=parsePendingDeletion(legacyRaw,apiUrl),storedRaw=await vault.get(key),stored=parsePendingDeletion(storedRaw,apiUrl);
  if(!old)return {key,raw:storedRaw,journal:stored};
  const original=deletionJournal(old);
  if(stored&&deletionJournal(stored)!==original)throw new DeletionRecoveryError();
  if(!stored)await vault.save(key,original);
  // Migration must round-trip before clearing the old record. If it changed
  // during the async save, retain both records and stop rather than overwrite.
  if(await vault.get(key)!==original)throw new DeletionRecoveryError();
  const latest=legacy.getItem(PENDING_DELETION_KEY);
  if(latest!==null&&latest!==legacyRaw)throw new DeletionRecoveryError();
  if(latest===legacyRaw)legacy.removeItem(PENDING_DELETION_KEY);
  return {key,raw:original,journal:old};
 }catch{throw new DeletionRecoveryError();}
}
export async function publishDeletionJournal(journal:PendingDeletion,active:()=>boolean,vault:PendingStore=deletionRecoveryVault,legacy:Storage=localStorage){
 const prior=await recoverDeletionJournal(journal.apiUrl,vault,legacy);
 if(!active()||prior.journal)throw new DeletionRecoveryError();
 const raw=deletionJournal(journal);await vault.save(prior.key,raw);
 // save is an immutable IndexedDB transaction: another tab cannot overwrite
 // this original operation, even when both passed their earlier empty read.
 return {key:prior.key,raw};
}
export async function verifyDeletionJournal(journal:PendingDeletion,active:()=>boolean,vault:PendingStore=deletionRecoveryVault,legacy:Storage=localStorage){
 const original=await recoverDeletionJournal(journal.apiUrl,vault,legacy);
 if(!active()||original.raw!==deletionJournal(journal))throw new DeletionRecoveryError();
}
export async function clearDeletionJournal(journal:PendingDeletion,vault:PendingStore=deletionRecoveryVault,legacy:Storage=localStorage){
 const original=await recoverDeletionJournal(journal.apiUrl,vault,legacy),raw=deletionJournal(journal);
 if(original.raw!==null&&original.raw!==raw)throw new DeletionRecoveryError();
 if(original.raw!==null&&!await vault.clear(original.key,raw))throw new DeletionRecoveryError();
 // Do not treat a lost CAS or a newly published operation as cleanup success.
 if(await vault.get(original.key)!==null||legacy.getItem(PENDING_DELETION_KEY)!==null)throw new DeletionRecoveryError();
}
