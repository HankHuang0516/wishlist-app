import React,{useState,type ReactNode} from 'react';
import {Pressable,StyleSheet,Text,View} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import {iosColors,iosRadius,iosType} from './iosTheme';
export function NativeDisclosure({title,children,initiallyOpen=false}:{title:string;children:ReactNode;initiallyOpen?:boolean}){
 const [open,setOpen]=useState(initiallyOpen);
 return <View style={s.card}><Pressable accessibilityRole="button" accessibilityState={{expanded:open}} accessibilityLabel={title} onPress={()=>setOpen(v=>!v)} style={s.row}><Text style={s.title}>{title}</Text><Ionicons name={open?'chevron-up':'chevron-down'} size={20} color={iosColors.secondaryLabel}/></Pressable>{open&&<View style={s.body}>{children}</View>}</View>;
}
const s=StyleSheet.create({card:{backgroundColor:iosColors.surface,borderRadius:iosRadius.card,overflow:'hidden'},row:{minHeight:52,padding:16,flexDirection:'row',alignItems:'center',gap:12},title:{...iosType.headline,color:iosColors.label,flex:1},body:{padding:16,paddingTop:0,gap:12}});
