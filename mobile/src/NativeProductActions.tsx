import React,{useRef,useState} from 'react';
import {Alert,Pressable,Share,StyleSheet,Text,View} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import {NativeProductWishButton} from './NativeProductWishes';
import {productShareMessage,productShareUrl} from './listingShare';
import type {WishProduct} from './productWishes';
import {iosColors,iosType} from './iosTheme';

/** The two things every product's own page offers, in the same place on each kind of page and on the web page: keep
 * it in a wishlist, and share it as text with the address of its public page. Sharing needs no account. */
export function NativeProductActions({product,price,apiUrl,version}:{product:WishProduct;price:string;apiUrl:string;version?:number}){
 const lock=useRef(false),[sharing,setSharing]=useState(false);
 async function share(){
  if(lock.current)return;lock.current=true;setSharing(true);
  try{
   const url=productShareUrl(product,apiUrl,__DEV__,version);
   if(!url)throw new Error('Product has no public page');
   await Share.share({message:productShareMessage(product.title,price,url),title:product.title});
  }catch{Alert.alert('分享失敗','無法開啟分享選單，請稍後重試。');}
  finally{lock.current=false;setSharing(false);}
 }
 return <View style={s.row}>
  <NativeProductWishButton labeled product={product}/>
  <Pressable accessibilityRole="button" accessibilityLabel={`分享商品：${product.title}`} disabled={sharing} accessibilityState={{disabled:sharing,busy:sharing}} style={[s.share,sharing&&{opacity:.5}]} onPress={()=>void share()}><Ionicons name="share-outline" size={21} color={iosColors.tint}/><Text style={s.text}>分享商品</Text></Pressable>
 </View>;
}
const s=StyleSheet.create({row:{flexDirection:'row',flexWrap:'wrap',gap:10},share:{flexGrow:1,minWidth:150,minHeight:48,paddingHorizontal:14,paddingVertical:10,borderRadius:12,borderWidth:1,borderColor:iosColors.tint,backgroundColor:iosColors.surface,flexDirection:'row',gap:8,alignItems:'center',justifyContent:'center'},text:{...iosType.headline,color:iosColors.tint,flexShrink:1}});
