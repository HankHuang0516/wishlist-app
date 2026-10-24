import React,{useState} from 'react';
import {Pressable,StyleSheet,Text,View} from 'react-native';
import {Map as NativeMap,Camera,GeoJSONSource,Layer} from '@maplibre/maplibre-react-native';
import {NativeActionMenu} from './NativeActionMenu';
import {TAIWAN_DISTRICTS} from './taiwanAdministrativeDistricts';
import {libertyZhHantStyle} from './libertyZhHantStyle';
import {approximateListingPoint,type ListingLocation} from './listingLocation';
import {iosColors,iosType} from './iosTheme';
export function ListingLocationPicker({value,onChange,disabled}:{value:ListingLocation;onChange:(value:ListingLocation)=>void;disabled:boolean}){
 const [choice,setChoice]=useState<'county'|'district'|null>(null),[error,setError]=useState(''),[failed,setFailed]=useState(false),[attempt,setAttempt]=useState(0);
 const selected=!!value.latitude&&!!value.longitude&&Number.isFinite(Number(value.latitude))&&Number.isFinite(Number(value.longitude));
 const point:[number,number]|null=selected?[Number(value.longitude),Number(value.latitude)]:null;
 return <View style={s.body}><View style={s.row}><Pressable accessibilityRole="button" style={s.button} disabled={disabled} onPress={()=>setChoice('county')}><Text style={s.text}>{value.county||'選擇縣市'} ▾</Text></Pressable><Pressable accessibilityRole="button" style={s.button} disabled={disabled||!TAIWAN_DISTRICTS[value.county]} onPress={()=>setChoice('district')}><Text style={s.text}>{value.district||'選擇行政區'} ▾</Text></Pressable>
 {(value.county||selected)&&<Pressable accessibilityRole="button" disabled={disabled} style={s.button} onPress={()=>onChange({county:'',district:'',latitude:'',longitude:''})}><Text style={s.text}>清除地點</Text></Pressable>}</View>
 <Text style={s.small}>在地圖點選商品大約位置，請核對與行政區一致。選位後立即轉為約2公里網格，不是面交地址；不會自動公開。</Text>
 {!disabled&&<NativeMap key={attempt} style={s.map} mapStyle={libertyZhHantStyle} attribution onDidFailLoadingMap={()=>setFailed(true)} onDidFinishLoadingMap={()=>setFailed(false)} onPress={event=>{try{const [longitude,latitude]=event.nativeEvent.lngLat;const next=approximateListingPoint(longitude,latitude);onChange({...value,...next});setError('');}catch{setError('請選擇台灣範圍內的商品位置。');}}}><Camera initialViewState={{center:point??[120.9,23.7],zoom:point?11:6}} {...(point?{center:point as [number,number],zoom:11}:{})}/>{point&&<GeoJSONSource id="listing-private-selection" data={{type:'FeatureCollection',features:[{type:'Feature',properties:{},geometry:{type:'Point',coordinates:point}}]}}><Layer id="listing-private-point" type="circle" paint={{'circle-radius':12,'circle-color':'#0066CC','circle-stroke-color':'#FFFFFF','circle-stroke-width':3}}/></GeoJSONSource>}</NativeMap>}
 <Text style={s.small}>{selected?'已選擇商品約略位置；仍需核對縣市與行政區。':'尚未選位；可以先儲存不含地點的草稿。'}</Text>{failed&&<><Text style={s.small}>地圖暫時無法載入；可重試，或用目前位置協助選位。</Text><Pressable accessibilityRole="button" style={s.button} onPress={()=>{setFailed(false);setAttempt(n=>n+1);}}><Text style={s.text}>重新載入地圖</Text></Pressable></>}{!!error&&<Text accessibilityRole="alert" style={s.error}>{error}</Text>}

 {choice&&<NativeActionMenu title={choice==='county'?'選擇縣市':'選擇行政區'} onClose={()=>setChoice(null)} actions={(choice==='county'?Object.keys(TAIWAN_DISTRICTS):[...(TAIWAN_DISTRICTS[value.county]??[])]).map(label=>({label,selected:value[choice]===label,onPress:()=>{onChange(choice==='county'?{county:label,district:'',latitude:'',longitude:''}:{...value,district:label,latitude:'',longitude:''});setChoice(null);}}))}/>}
 </View>;
}
const s=StyleSheet.create({body:{gap:12},row:{flexDirection:'row',flexWrap:'wrap',gap:8},button:{minHeight:48,padding:12,borderRadius:12,backgroundColor:iosColors.surface,justifyContent:'center'},text:{...iosType.body,color:iosColors.tint},small:{...iosType.subheadline,color:iosColors.secondaryLabel},map:{height:280,borderRadius:16,overflow:'hidden'},error:{...iosType.body,color:iosColors.danger}});
