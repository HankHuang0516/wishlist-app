import React,{useRef,useState} from 'react';
import {Pressable,ScrollView,StyleSheet,Text,View,useWindowDimensions} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import {ListingPhoto} from './ListingPhoto';
import {NativeDisclosure} from './NativeDisclosure';
import {ProductInterest} from './ProductInterestView';
import {sourceLocationLabel,type SourceLead} from './sourceLeadData';
import {iosColors,iosRadius,iosType} from './iosTheme';

export function SourceLeadDetailContent({detail,error,onBack,onOriginal,onContact,onAttribution}:{detail:SourceLead;error:string;onBack:()=>void;onOriginal:()=>Promise<void>;onContact:()=>void;onAttribution:()=>void}){
 const {width}=useWindowDimensions(),[page,setPage]=useState(0),[opening,setOpening]=useState(false),lock=useRef(false);
 const photos=detail.media??[],facts=detail.publicFacts,location=[detail.county,detail.district].filter(Boolean).join(' ');
 async function original(){if(lock.current)return;lock.current=true;setOpening(true);try{await onOriginal();}finally{lock.current=false;setOpening(false);}}
 return <View style={s.screen}>
  <View style={s.header}><Pressable accessibilityRole="button" accessibilityLabel="返回探索" style={s.back} onPress={onBack}><Ionicons name="chevron-back" size={25} color={iosColors.tint}/></Pressable><Text accessibilityRole="header" style={s.heading}>商品詳情</Text><Text style={s.badge}>公開來源</Text></View>
  <ScrollView contentContainerStyle={s.content}>
   <View><ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} onMomentumScrollEnd={event=>setPage(Math.max(0,Math.min(photos.length-1,Math.round(event.nativeEvent.contentOffset.x/width))))}>
    {photos.length?photos.map((photo,i)=><ListingPhoto key={photo.id} uri={photo.imageUrl} label={`${photo.alt} · ${i+1}/${photos.length}`} detail style={{width,height:Math.min(width*.78,340),borderRadius:0}}/>):<ListingPhoto label={detail.title} detail missing="尚無可公開的商品照片" style={{width,height:Math.min(width*.35,140),borderRadius:0}}/>}
   </ScrollView>{photos.length>1&&<Text style={s.counter}>{page+1}/{photos.length}</Text>}</View>
   <View style={s.body}>
    <Text style={s.badge}>{new URL(detail.canonicalUrl).hostname.replace(/^www\./,'')} · 庫存待確認</Text>
    <Text accessibilityRole="header" style={s.title}>{detail.title}</Text><Text style={s.price}>{facts?.priceText||'售價待詢問'}</Text>
    <Text style={s.secondary}>{location?location+' · ':''}{sourceLocationLabel(detail)}，非現貨所在地</Text>
    <View style={s.interest}><ProductInterest kind="source" id={detail.id}/></View>
    <View style={s.notice}><Ionicons name="information-circle-outline" size={21} color={iosColors.warning}/><Text style={s.noticeText}>這是公開商品線索。現貨、品況與交易方式需向原賣家確認。</Text></View>
    <Text style={s.label}>商品說明</Text><Text style={s.text}>{detail.summary}</Text>
    <NativeDisclosure title="價格與來源資訊">
     {facts&&<><Text style={s.text}>計價單位：{facts.priceUnitStatus==='unknown'?'原帖未明示，待詢問':'依原帖標示，仍需確認交付數量'}。</Text><Text style={s.text}>{facts.currencyStatus.includes('infer')?'幣別為情境推定，待原賣家確認。':'幣別依原帖證據標示。'}</Text><Text style={s.secondary}>{facts.sourceAccessNotice}</Text>{detail.dateBasis!=='FIRST_OBSERVED'&&<Text style={s.secondary}>{facts.originalDateLabel}</Text>}</>}
     {detail.dateBasis==='FIRST_OBSERVED'?<Text style={s.secondary}>刊登日期未提供；首次查核 {new Date(detail.firstObservedAt!).toLocaleString('zh-TW',{timeZone:'Asia/Taipei'})}</Text>:<Text style={s.secondary}>原始發布日期區間：{new Date(detail.postedEarliestAt!).toLocaleDateString('zh-TW',{timeZone:'Asia/Taipei'})}～{new Date(detail.postedLatestAt!).toLocaleDateString('zh-TW',{timeZone:'Asia/Taipei'})}</Text>}<Text style={s.secondary}>來源最後查核：{new Date(detail.checkedAt).toLocaleString('zh-TW',{timeZone:'Asia/Taipei'})}</Text>
     {detail.photoCompleteness&&<Text style={s.secondary}>已提供 {detail.photoCompleteness.importedCount} 張可公開照片；{detail.photoCompleteness.status==='IMPORTED_COMPLETE'?'匯入時與來源照片數相符。':'照片完整性仍待確認，請核對原始來源。'}</Text>}
    </NativeDisclosure>
    <NativeDisclosure title="位置與交易提醒">
     <Text style={s.text}>{sourceLocationLabel(detail)}{detail.publicPlaceName?'：'+detail.publicPlaceName:''}{detail.publicAddress?'／'+detail.publicAddress:''}</Text>
     {facts&&<><Text style={s.secondary}>{facts.locationRelation}</Text>{facts.coordinateQualityNotes.map((note,i)=><Text key={i} style={s.secondary}>{note}</Text>)}</>}
     {detail.coordinateAttribution&&<Pressable accessibilityRole="link" style={s.link} onPress={onAttribution}><Text style={s.linkText}>{detail.coordinateAttribution.text} · ODbL</Text></Pressable>}
     <Text style={s.secondary}>{detail.notice}</Text><Text style={s.secondary}>不顯示未授權圖片，不提供下訂或付款。</Text>
    </NativeDisclosure>
    <NativeDisclosure title="Wishlist AI 代問方式"><Text style={s.text}>{detail.contactRouting?.reason||'原賣家收訊路由待核實；原帖不能代替私訊收件人。'}</Text><Text style={s.secondary}>問題與轉送同意會在下一步確認；開啟聊聊不代表已聯絡賣家。</Text></NativeDisclosure>

   </View>
  </ScrollView>
  <View style={s.footer}>{!!error&&<Text accessibilityRole="alert" style={[s.error,{width:'100%'}]}>{error}</Text>}<Pressable accessibilityRole="button" accessibilityLabel="前往原始來源" disabled={opening} style={s.original} onPress={()=>void original()}><Ionicons name="open-outline" size={20} color={iosColors.tint}/><Text style={s.linkText}>{opening?'確認來源中…':'原始來源'}</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel="Wishlist AI 代問" style={s.contact} onPress={onContact}><Ionicons name="chatbubble-outline" size={20} color="white"/><Text style={s.contactText}>Wishlist AI 代問</Text></Pressable></View>
 </View>;
}
const s=StyleSheet.create({screen:{flex:1,backgroundColor:iosColors.surface},header:{minHeight:56,paddingRight:16,flexDirection:'row',alignItems:'center',gap:8,borderBottomWidth:StyleSheet.hairlineWidth,borderBottomColor:iosColors.separator},back:{minHeight:48,minWidth:48,alignItems:'center',justifyContent:'center'},heading:{...iosType.headline,color:iosColors.label,flex:1},badge:{...iosType.footnote,fontWeight:'600',color:iosColors.warning},content:{paddingBottom:24},body:{padding:16,gap:12},title:{...iosType.title2,color:iosColors.label},price:{fontSize:25,lineHeight:32,fontWeight:'800',color:iosColors.tint},secondary:{...iosType.subheadline,color:iosColors.secondaryLabel},text:{...iosType.body,color:iosColors.label},label:{...iosType.headline,color:iosColors.label},interest:{paddingHorizontal:12,borderWidth:StyleSheet.hairlineWidth,borderColor:iosColors.separator,borderRadius:iosRadius.control},notice:{padding:12,backgroundColor:'#FFF7E8',borderRadius:12,flexDirection:'row',gap:8,alignItems:'flex-start'},noticeText:{...iosType.subheadline,color:iosColors.warning,flex:1},counter:{position:'absolute',right:16,bottom:12,backgroundColor:'rgba(0,0,0,.6)',color:'white',paddingHorizontal:10,paddingVertical:5,borderRadius:16,...iosType.caption},footer:{padding:12,borderTopWidth:StyleSheet.hairlineWidth,borderTopColor:iosColors.separator,flexDirection:'row',flexWrap:'wrap',gap:10},original:{minHeight:52,padding:12,borderWidth:1,borderColor:iosColors.tint,borderRadius:12,flexDirection:'row',gap:6,alignItems:'center',justifyContent:'center'},contact:{flex:1,minWidth:170,minHeight:52,padding:12,borderRadius:12,backgroundColor:iosColors.tint,flexDirection:'row',gap:8,alignItems:'center',justifyContent:'center'},contactText:{...iosType.headline,color:'white'},link:{minHeight:48,justifyContent:'center'},linkText:{...iosType.subheadline,fontWeight:'600',color:iosColors.tint},error:{...iosType.body,color:iosColors.danger}});
