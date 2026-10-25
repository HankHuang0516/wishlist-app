import React from 'react';
import {Text} from 'react-native';
import * as Application from 'expo-application';
import {iosColors,iosType} from './iosTheme';

export function AppVersionLabel(){
 const version=Application.nativeApplicationVersion,build=Application.nativeBuildVersion;
 return <Text selectable style={{...iosType.footnote,color:iosColors.secondaryLabel}}>版本 {version??'尚未取得'}{build?`（${build}）`:''}</Text>;
}
