import { Modal as RNModal, View, StyleSheet, type ModalProps } from 'react-native';

type BamaModalProps = Pick<ModalProps, 'visible' | 'onRequestClose'> & {
  children: React.ReactNode;
};

export function Modal({ visible, onRequestClose, children }: BamaModalProps) {
  return (
    <RNModal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onRequestClose}
    >
      <View style={styles.overlay}>
        <View style={styles.sheet}>{children}</View>
      </View>
    </RNModal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  sheet: { backgroundColor: '#fff', borderRadius: 16, padding: 24, width: '100%' },
});
