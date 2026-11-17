import type { SQLiteDatabase } from 'expo-sqlite'
import { Alert } from 'react-native'
import { numberExists, renameStandLocal } from '../db/standEdits'

type Stand = { id: number; number: string; areaId: number }

/**
 * Asks for a new stand number and saves it (locally at once, to the server
 * with the next sync). A number that already exists in the area is refused.
 * Used by the stand page and the stand panel on the map.
 */
export function promptRenameStand(db: SQLiteDatabase, stand: Stand, onSaved: () => void) {
  Alert.prompt('Change stand number', undefined, [
    { text: 'Cancel', style: 'cancel' },
    {
      text: 'Save',
      onPress: (value?: string) => {
        const number = value?.trim() ?? ''
        if (!number || number === stand.number) return
        if (numberExists(db, stand.areaId, number, stand.id)) {
          Alert.alert('Number already used', `Stand ${number} already exists in this area.`)
          return
        }
        renameStandLocal(db, stand.id, number)
        onSaved()
      },
    },
  ], 'plain-text', stand.number)
}
