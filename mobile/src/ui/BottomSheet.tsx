import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Animated, Dimensions, PanResponder, Pressable, StyleSheet, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useTheme } from './theme'

const HIDDEN = Dimensions.get('window').height

/**
 * A panel that slides up from the bottom and is only as tall as its content.
 * Closes on a swipe down or a tap on the map above it. Used by the layer menu
 * and the stand panel.
 */
export function BottomSheet({ visible, onClose, closeLabel, children }: {
  visible: boolean
  onClose: () => void
  /** Read by VoiceOver for the area above the panel, e.g. "Close layers". */
  closeLabel: string
  children: ReactNode
}) {
  const t = useTheme()
  const translateY = useRef(new Animated.Value(HIDDEN)).current
  const [mounted, setMounted] = useState(visible)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    if (visible) {
      setMounted(true)
      Animated.spring(translateY, { toValue: 0, useNativeDriver: true, bounciness: 0, speed: 16 }).start()
    } else {
      Animated.timing(translateY, { toValue: HIDDEN, duration: 200, useNativeDriver: true }).start(() => setMounted(false))
    }
  }, [visible, translateY])

  const pan = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => g.dy > 6 && Math.abs(g.dy) > Math.abs(g.dx),
    onPanResponderMove: (_, g) => translateY.setValue(Math.max(0, g.dy)),
    onPanResponderRelease: (_, g) => {
      if (g.dy > 60 || g.vy > 0.5) onCloseRef.current()
      else Animated.spring(translateY, { toValue: 0, useNativeDriver: true, bounciness: 0 }).start()
    },
  })).current

  if (!mounted) return null

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel={closeLabel} />
      <Animated.View {...pan.panHandlers} style={[styles.sheet, { backgroundColor: t.card, transform: [{ translateY }] }]}>
        <SafeAreaView edges={['bottom']}>
          <View style={styles.handleArea}><View style={[styles.handle, { backgroundColor: t.border }]} /></View>
          {children}
        </SafeAreaView>
      </Animated.View>
    </View>
  )
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute', left: 0, right: 0, bottom: 0, borderTopLeftRadius: 16, borderTopRightRadius: 16,
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: -2 },
  },
  handleArea: { alignItems: 'center', paddingVertical: 10 },
  handle: { width: 40, height: 5, borderRadius: 3 },
})
