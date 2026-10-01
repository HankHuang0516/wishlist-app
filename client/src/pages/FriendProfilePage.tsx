import { useEffect,useRef,useState,type ComponentType } from 'react';
import { Link,useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api,ApiFailure } from '../lib/marketplaceApi';
import { parsePublicProfile,socialAvatar,type PublicProfile } from '../lib/socialWeb';
import { useFollowOperation } from '../lib/useFollowOperation';
import { parseFollowState,type FollowState } from '../lib/followWeb';
import FollowRecovery from '../components/FollowRecovery';
import MarketplaceDialog from '../components/MarketplaceDialog';
import { Card,CardContent,CardHeader,CardTitle } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { User,Smartphone,MapPin,Tag,Gift,UserPlus,UserMinus,EyeOff,ArrowLeft,Calendar } from 'lucide-react';
import { t } from '../utils/localization';

export default function FriendProfilePage(){
    const {id}=useParams(),{token,user}=useAuth();
    if(!id||!/^[1-9]\d{0,9}$/.test(id)||Number(id)>2147483647)return <div role="alert" className="p-4">{t('friend.invalid')}</div>;
    if(!token||!user)return <div className="p-4"><p>{t('social.loginRequired')}</p><Link className="inline-flex min-h-11 items-center text-blue-600 underline" to={'/login?next='+encodeURIComponent('/users/'+id+'/profile')}>{t('nav.login')}</Link></div>;
    return <ProfileSession key={user.id+':'+token+':'+id} token={token} userId={user.id} targetId={Number(id)} />;
}
function ProfileSession({token,userId,targetId}:{token:string;userId:number;targetId:number}){
    const [profile,setProfile]=useState<PublicProfile|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[reload,setReload]=useState(0),[confirm,setConfirm]=useState(false);
    const epoch=useRef(0);
    const confirmed=useRef<FollowState|null>(null);
    const follow=useFollowOperation(token,userId,state=>{if(state.targetUserId===targetId&&(!confirmed.current||state.followingVersion>=confirmed.current.followingVersion)){confirmed.current=state;setProfile(previous=>previous?{...previous,isFollowing:state.isFollowing}:null);}});
    useEffect(()=>{
        const generation=++epoch.current,abort=new AbortController();setLoading(true);setError('');setProfile(null);
        void(async()=>{try{
            const value=parsePublicProfile(await api(token,'/users/'+targetId,{signal:AbortSignal.any([abort.signal,AbortSignal.timeout(30000)])}),targetId);
            const state=parseFollowState(await api(token,'/users/me/follow-state/'+targetId,{signal:AbortSignal.any([abort.signal,AbortSignal.timeout(30000)])}),userId,targetId);
            if(epoch.current!==generation)return;
            if(!state.targetExists){setError('friend.missing');return;}
            if(!confirmed.current||state.followingVersion>=confirmed.current.followingVersion)confirmed.current=state;
            setProfile({...value,isFollowing:confirmed.current.isFollowing});
        }catch(err){if(epoch.current===generation&&!abort.signal.aborted)setError(err instanceof ApiFailure&&err.status===404?'friend.missing':'friend.readError');}
        finally{if(epoch.current===generation)setLoading(false);}})();
        return()=>{epoch.current++;abort.abort();};
    },[token,targetId,reload]);
    const renderField=(label:string,value:string|null,Icon:ComponentType<{className?:string}>)=><div className={'flex min-w-0 items-center gap-4 rounded-lg border p-4 '+(value===null?'bg-gray-50 border-gray-100':'bg-white border-muji-border')}>
        <Icon className="h-5 w-5 shrink-0 text-gray-500" /><div className="min-w-0"><p className="text-xs text-gray-500">{label}</p><p className="break-words font-medium">{value===null?t('friend.hidden'):value||t('friend.notSet')}</p></div></div>;
    return <div className="mx-auto max-w-2xl space-y-6 p-4 pb-20">
        <div className="flex items-center gap-3 border-b py-3"><Link aria-label={t('friend.backFriends')} className="inline-flex min-h-11 min-w-11 items-center justify-center" to="/social"><ArrowLeft className="h-6 w-6" /></Link><h1 className="text-lg font-bold">{t('friend.title')}</h1></div>
        <FollowRecovery operation={follow} />
        {loading&&<p role="status">{t('common.processing')}</p>}
        {error&&<div role="alert"><p>{t(error)}</p><Button className="mt-2 min-h-11" onClick={()=>setReload(n=>n+1)}>{t('friend.retry')}</Button></div>}
        {profile&&<Card><CardHeader><CardTitle>{t('friend.basicInfo')}</CardTitle></CardHeader><CardContent className="space-y-6">
            <div className="flex justify-center"><div className="flex h-32 w-32 flex-col items-center justify-center overflow-hidden rounded-full bg-gray-100 text-gray-500">{profile.avatarUrl?<img src={socialAvatar(profile.avatarUrl)} referrerPolicy="no-referrer" alt={profile.name??t('social.anonymous')} className="h-full w-full object-cover" />:<><EyeOff className="h-6 w-6" aria-hidden="true" /><span className="text-xs">{t('friend.photoUnavailable')}</span></>}</div></div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {renderField(t('settings.displayName'),profile.name,User)}
                {renderField(t('settings.nickname'),profile.nicknames,Tag)}
                {renderField(t('settings.realName'),profile.realName,User)}
                {renderField(t('settings.phone'),profile.phoneNumber,Smartphone)}
                {renderField(t('settings.address'),profile.address,MapPin)}
                {renderField(t('settings.birthday'),profile.birthday?.slice(0,10)??null,Calendar)}
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Link to={'/users/'+targetId+'/wishlists'} className="flex min-h-11 items-center justify-center gap-2 rounded-md bg-muji-primary p-3 text-white"><Gift className="h-5 w-5" />{t('friend.viewWishlist')}</Link>
                {userId!==targetId&&<Button className="min-h-11" variant="outline" disabled={follow.locked} onClick={()=>profile.isFollowing?setConfirm(true):void follow.change(targetId,true)}>{profile.isFollowing?<UserMinus className="mr-2 h-5 w-5" />:<UserPlus className="mr-2 h-5 w-5" />}{profile.isFollowing?t('social.unfollow'):t('social.follow')}</Button>}
            </div>
        </CardContent></Card>}
        {confirm&&<MarketplaceDialog title={t('social.unfollow')} closeLabel={t('social.closeDialog')} onClose={()=>{if(!follow.busy)setConfirm(false);}}><p>{t('social.confirmUnfollow').replace('{name}',profile?.name??t('social.anonymous'))}</p><div className="mt-4 flex flex-wrap gap-2"><Button className="min-h-11" variant="destructive" disabled={follow.locked} onClick={()=>{setConfirm(false);void follow.change(targetId,false);}}>{t('common.confirm')}</Button><Button className="min-h-11" variant="outline" onClick={()=>setConfirm(false)}>{t('common.cancel')}</Button></div></MarketplaceDialog>}
    </div>;
}
