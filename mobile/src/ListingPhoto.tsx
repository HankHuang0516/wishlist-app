import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Image, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { iosColors, iosRadius, iosSpacing, iosType } from './iosTheme';
export function ListingPhoto({uri,label,style,detail=false,missing='原圖尚未取得展示許可'}:{uri?:string;label:string;style?:StyleProp<ViewStyle>;detail?:boolean;missing?:string}) {
 const [state,setState]=useState<'loading'|'ready'|'error'>(uri?'loading':'error');
 useEffect(()=>setState(uri?'loading':'error'),[uri]);
 return <View style={[photoStyles.thumbnail,style]} accessible accessibilityRole="image" accessibilityLabel={!uri?missing:state==='error'?'圖片暫時無法載入':label}>
  {!!uri && state!=='error' && <Image source={{uri}} resizeMode={detail?'contain':'cover'} style={StyleSheet.absoluteFill} onLoad={()=>setState('ready')} onError={()=>setState('error')}/>}
  {state!=='ready' && <View style={photoStyles.fallback}>{!!uri&&state==='loading'?<ActivityIndicator color={iosColors.tint}/>:<Text style={photoStyles.caption}>{uri?'圖片暫時無法載入':missing}</Text>}</View>}
 </View>;
}
export const photoStyles=StyleSheet.create({thumbnail:{width:84,height:84,borderRadius:iosRadius.control,backgroundColor:iosColors.surfaceSecondary,overflow:'hidden'},detail:{width:248,height:248,borderRadius:iosRadius.card,marginRight:iosSpacing.sm},fallback:{...StyleSheet.absoluteFill,alignItems:'center',justifyContent:'center',padding:iosSpacing.xs},caption:{...iosType.caption,color:iosColors.secondaryLabel,textAlign:'center'}});
export const listingPresentation=StyleSheet.create({card:{flexDirection:'row',backgroundColor:iosColors.surface,borderRadius:iosRadius.card,padding:iosSpacing.sm,gap:iosSpacing.sm,marginBottom:iosSpacing.sm},cardText:{flex:1,gap:iosSpacing.xxs},title:{...iosType.headline,color:iosColors.label},price:{...iosType.headline,color:iosColors.tint},small:{...iosType.subheadline,color:iosColors.secondaryLabel},badge:{...iosType.caption,color:'#5269B0'}});
