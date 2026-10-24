import React, {useRef, useState} from 'react';
import {Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import {ListingPhoto} from './ListingPhoto';
import {NativeDisclosure} from './NativeDisclosure';
import {ProductInterest} from './ProductInterestView';
import {listingPrice, type PublicListing} from './listingSearch';
import {iosColors, iosRadius, iosType} from './iosTheme';

type Props = {
  listing: PublicListing;
  userId: number;
  error: string;
  reasons: string[];
  onBack: () => void;
  onStorefront: () => void;
  onReport: () => void;
  onContact: () => Promise<void>;
};

export function ListingDetailContent({listing, userId, error, reasons, onBack, onStorefront, onReport, onContact}: Props) {
  const {width} = useWindowDimensions();
  const [page, setPage] = useState(0), [contacting, setContacting] = useState(false);
  const contactLock = useRef(false);
  const own = listing.owner.id === userId;
  async function contact() {
    if (contactLock.current) return;
    contactLock.current = true;
    setContacting(true);
    try { await onContact(); } finally { contactLock.current = false; setContacting(false); }
  }
  return <View style={s.screen}>
    <View style={s.header}>
      <Pressable accessibilityRole="button" accessibilityLabel="返回探索" style={s.headerButton} onPress={onBack}><Ionicons name="chevron-back" color={iosColors.tint} size={25}/></Pressable>
      <Text accessibilityRole="header" style={s.headerTitle}>商品詳情</Text>
      {!own ? <Pressable accessibilityRole="button" accessibilityLabel="檢舉商品" style={s.headerButton} onPress={onReport}><Ionicons name="flag-outline" color={iosColors.label} size={24}/></Pressable> : <View style={s.headerButton}/>}
    </View>
    <ScrollView style={s.scroll} contentContainerStyle={s.content}>
      <View>
        <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} onMomentumScrollEnd={event => setPage(Math.max(0, Math.min(listing.media.length-1, Math.round(event.nativeEvent.contentOffset.x/width))))}>
          {listing.media.map((photo, index) => <ListingPhoto key={photo.id} uri={photo.imageUrl} label={`${listing.title} · ${photo.capturePurpose==='AI_MARKETING'?'AI 行銷圖片':'商品照片'} ${index+1}/${listing.media.length}`} detail style={{width, height:Math.min(width*.78, 340), borderRadius:0}} missing="尚未提供商品照片"/>)}
        </ScrollView>
        {listing.media.length>1 && <Text style={s.page}>{page+1}/{listing.media.length}</Text>}
        {listing.media[page]?.capturePurpose==='AI_MARKETING' && <Text style={s.aiNotice}>AI 行銷圖片；請向賣家確認實際商品狀況。</Text>}
      </View>
      <View style={s.body}>
        <Text accessibilityRole="header" style={s.title}>{listing.title}</Text>
        <Text style={s.price}>{listingPrice(listing)}</Text>
        <Text style={s.secondary}>{listing.condition==='NEW'?'新品':'二手'} · {listing.location.county} {listing.location.district}{listing.status==='RESERVED'?' · 已保留':''}</Text>
        <View style={s.interest}><ProductInterest kind="listing" id={listing.id} readOnly={own}/></View>
        <View style={s.seller}>
          <View style={s.avatar}><Text style={s.avatarText}>{(listing.owner.name||'用戶').slice(0,1)}</Text></View>
          <View style={s.sellerName}><Text style={s.label}>{listing.owner.name||'用戶'}</Text><Text style={s.secondary}>查看公開資訊與販售中的商品</Text></View>
          <Pressable accessibilityRole="button" accessibilityLabel={`查看${listing.owner.name||'用戶'}的賣場`} style={s.storeButton} onPress={onStorefront}><Text style={s.storeText}>查看賣場</Text></Pressable>
        </View>
        <Text style={s.label}>商品說明</Text><Text style={s.description}>{listing.description}</Text>
        <NativeDisclosure title="商品與交易資訊">
          <Text style={s.description}>品牌：{listing.brand||'未標示'}</Text>
          <Text style={s.description}>{listing.deliveryMethods.map(method=>method==='MEETUP'?'面交':'寄送').join('／')}{listing.negotiable?' · 可議價':' · 不議價'}</Text>
          <Text style={s.secondary}>地圖位置已模糊化約2公里；不是面交地址。</Text>
          <Text style={s.secondary}>刊登至 {new Date(listing.expiresAt).toLocaleDateString('zh-TW',{timeZone:'Asia/Taipei'})}</Text>
        </NativeDisclosure>
        {reasons.map(reason=><Text key={reason} style={s.secondary}>{reason}</Text>)}
        {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
      </View>
    </ScrollView>
    {!own && <View style={s.footer}><Pressable accessibilityRole="button" disabled={contacting} accessibilityState={{disabled:contacting,busy:contacting}} style={[s.contact,contacting&&s.disabled]} onPress={()=>void contact()}><Ionicons name="chatbubble-outline" color="white" size={21}/><Text style={s.contactText}>{contacting?'正在開啟聊天…':'聊聊詢問'}</Text></Pressable></View>}
  </View>;
}

const s=StyleSheet.create({
  screen:{flex:1,backgroundColor:iosColors.surface},scroll:{flex:1},content:{paddingBottom:24},
  header:{minHeight:52,flexDirection:'row',alignItems:'center',paddingHorizontal:8,borderBottomWidth:StyleSheet.hairlineWidth,borderBottomColor:iosColors.separator},headerButton:{minWidth:48,minHeight:48,alignItems:'center',justifyContent:'center'},headerTitle:{...iosType.headline,color:iosColors.label,flex:1},
  page:{position:'absolute',right:16,bottom:12,color:'white',backgroundColor:'rgba(0,0,0,.58)',paddingHorizontal:10,paddingVertical:5,borderRadius:16,...iosType.caption},aiNotice:{padding:12,backgroundColor:iosColors.tintSoft,color:iosColors.label,...iosType.subheadline},
  body:{padding:16,gap:12},title:{...iosType.title2,color:iosColors.label},price:{fontSize:25,lineHeight:31,fontWeight:'700',color:iosColors.tint},secondary:{...iosType.subheadline,color:iosColors.secondaryLabel},description:{...iosType.body,color:iosColors.label},label:{...iosType.headline,color:iosColors.label},interest:{borderWidth:StyleSheet.hairlineWidth,borderColor:iosColors.separator,borderRadius:iosRadius.control,paddingHorizontal:12},
  seller:{flexDirection:'row',alignItems:'center',flexWrap:'wrap',gap:12,paddingVertical:12,borderBottomWidth:StyleSheet.hairlineWidth,borderBottomColor:iosColors.separator},avatar:{width:44,height:44,borderRadius:22,backgroundColor:iosColors.surfaceSecondary,alignItems:'center',justifyContent:'center'},avatarText:{...iosType.title2,color:iosColors.secondaryLabel},sellerName:{flex:1,minWidth:120,gap:4},storeButton:{minHeight:48,borderWidth:1,borderColor:iosColors.tint,borderRadius:iosRadius.control,paddingHorizontal:12,justifyContent:'center'},storeText:{...iosType.headline,color:iosColors.tint},
  footer:{paddingHorizontal:16,paddingVertical:12,borderTopWidth:StyleSheet.hairlineWidth,borderTopColor:iosColors.separator,backgroundColor:iosColors.surface},contact:{minHeight:52,backgroundColor:iosColors.tint,borderRadius:iosRadius.control,flexDirection:'row',gap:10,alignItems:'center',justifyContent:'center',padding:12},contactText:{...iosType.headline,color:'white'},disabled:{opacity:.5},error:{...iosType.body,color:iosColors.danger},
});
