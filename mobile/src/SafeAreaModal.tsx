import React from 'react';
import { Modal, type ModalProps, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { iosColors } from './iosTheme';

type Props = ModalProps & { contentStyle?: StyleProp<ViewStyle> };

// A Modal has its own native window. Measure its safe area inside that window,
// rather than reusing insets measured in the tab screen underneath it.
export function SafeAreaModal({ children, contentStyle, ...props }: Props) {
  return <Modal {...props} presentationStyle="fullScreen">
    <SafeAreaProvider>
      <SafeAreaView edges={['top', 'right', 'bottom', 'left']} style={[{ flex: 1, backgroundColor: iosColors.background }, contentStyle]}>
        {children}
      </SafeAreaView>
    </SafeAreaProvider>
  </Modal>;
}
