import React from 'react';
import {Pressable,ScrollView,StyleSheet,Text,View} from 'react-native';
import {SafeAreaModal} from './SafeAreaModal';
import {iosColors,iosRadius,iosType} from './iosTheme';
export type NativeMenuAction={label:string;onPress:()=>void;destructive?:boolean;disabled?:boolean;selected?:boolean};
export function NativeActionMenu({title,actions,onClose}:{title:string;actions:NativeMenuAction[];onClose:()=>void}){
 return <SafeAreaModal visible animationType="slide" onRequestClose={onClose}><View style={s.header}><Text style={s.title}>{title}</Text><Pressable accessibilityRole="button" style={s.action} onPress={onClose}><Text style={s.link}>關閉</Text></Pressable></View><ScrollView contentContainerStyle={s.body}>{actions.map((a,i)=><Pressable key={i} accessibilityRole="button" accessibilityState={{disabled:a.disabled,selected:a.selected}} disabled={a.disabled} style={[s.action,s.choice,a.disabled&&s.disabled]} onPress={a.onPress}><Text style={[s.text,a.destructive&&s.danger]}>{a.label}{a.selected?' ✓':''}</Text></Pressable>)}</ScrollView></SafeAreaModal>;
}
const s=StyleSheet.create({header:{padding:16,flexDirection:'row',flexWrap:'wrap',alignItems:'center',gap:12},title:{...iosType.title2,color:iosColors.label,flex:1},body:{padding:16,gap:2},action:{minHeight:48,padding:14,justifyContent:'center'},choice:{backgroundColor:iosColors.surface,borderRadius:iosRadius.control},link:{...iosType.body,color:iosColors.tint},text:{...iosType.body,color:iosColors.label},danger:{color:iosColors.danger},disabled:{opacity:0.45}});
